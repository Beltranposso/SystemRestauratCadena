import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { z } from 'zod';
import { CANALES_SEDE, EVENTOS, SALAS, type CanalSede } from '@restaurantes/shared';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { prisma } from '../db/prisma';
import { authDesdeJwt, autenticarDispositivo } from '../auth/autenticacion';
import { obtenerSede, puedeVerSede } from '../auth/alcance';
import type { Auth } from '../auth/tipos';

let io: Server | undefined;
let clientesRedis: { quit(): Promise<unknown> }[] = [];

/** Sala con todos los sockets de pantallas y kioscos, y sala propia de cada equipo. */
const SALA_DISPOSITIVOS = 'dispositivos';
const salaDispositivo = (id: string) => `dispositivo:${id}`;

/**
 * Pantallas y kioscos con al menos una conexión abierta ahora. Consulta las salas en vez de un
 * mapa en memoria para que funcione igual con varias instancias (adaptador de Redis).
 */
export async function dispositivosEnLinea(): Promise<ReadonlySet<string>> {
  if (!io) return new Set();
  try {
    const sockets = await io.in(SALA_DISPOSITIVOS).fetchSockets();
    const ids = new Set<string>();
    for (const s of sockets) {
      const a = s.data.auth as Auth | undefined;
      if (a?.tipo === 'dispositivo') ids.add(a.id);
    }
    return ids;
  } catch (err) {
    logger.warn({ err }, 'No se pudo consultar qué equipos están en línea');
    return new Set();
  }
}

/**
 * Con REDIS_URL, los eventos emitidos en una instancia llegan a los sockets conectados a
 * cualquier otra (necesario en Vercel, donde cada conexión queda fija a una instancia).
 */
async function conectarRedis(servidorIo: Server, url: string) {
  const pub = createClient({ url });
  const sub = pub.duplicate();
  for (const c of [pub, sub]) c.on('error', (err) => logger.error({ err }, 'Error de Redis'));
  clientesRedis = [pub, sub];
  await Promise.all([pub.connect(), sub.connect()]);
  servidorIo.adapter(createAdapter(pub, sub));
  logger.info('Socket.IO usando el adaptador de Redis');
}

function marcarConexion(dispositivoId: string) {
  void prisma.dispositivo
    .update({ where: { id: dispositivoId }, data: { ultimaConexionEn: new Date() } })
    .catch(() => undefined);
}

const esquemaSala = z.object({
  sedeId: z.number().int().positive(),
  canal: z.enum(CANALES_SEDE as [CanalSede, ...CanalSede[]]),
});
const esquemaEspera = z.object({ entradaId: z.string().uuid() });

type Ack = (r: { ok: boolean; sala?: string; error?: string }) => void;

/** Canales que puede escuchar cada tipo de dispositivo. */
const CANALES_DISPOSITIVO: Record<string, CanalSede[]> = {
  PANTALLA: ['pantalla'],
  KIOSCO: ['pantalla'],
};

async function puedeUnirse(auth: Auth | undefined, sedeId: number, canal: CanalSede) {
  if (!auth || auth.tipo === 'cliente') return 'Solo el personal o los dispositivos de la sede';
  const sede = await obtenerSede(sedeId).catch(() => null);
  if (!sede) return 'La sede no existe';
  if (!puedeVerSede(auth, sede)) return 'Esta sede está fuera de tu alcance';
  if (auth.tipo === 'dispositivo' && !CANALES_DISPOSITIVO[auth.dispositivo]?.includes(canal)) {
    return 'Este dispositivo no puede escuchar ese canal';
  }
  return null;
}

/**
 * Socket.IO sobre el mismo servidor HTTP. Credenciales en el handshake:
 *   io(url, { auth: { token: '<jwt>' } })            personal o cliente
 *   io(url, { auth: { deviceToken: '<token>' } })     pantalla o kiosco
 * Sin credenciales solo se puede seguir un turno de la cola (espera:unirse).
 */
export function iniciarSocket(servidor: HttpServer): Server {
  io = new Server(servidor, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  });

  if (env.REDIS_URL) {
    conectarRedis(io, env.REDIS_URL).catch((err) =>
      logger.error(
        { err },
        'No se pudo conectar a Redis: los eventos solo llegarán a esta instancia',
      ),
    );
  }

  io.use(async (socket, next) => {
    const { token, deviceToken } = (socket.handshake.auth ?? {}) as Record<string, unknown>;
    try {
      if (typeof token === 'string' && token) {
        socket.data.auth = authDesdeJwt(token);
      } else if (typeof deviceToken === 'string' && deviceToken) {
        const auth = await autenticarDispositivo(deviceToken);
        if (!auth) return next(new Error('DISPOSITIVO_INVALIDO'));
        socket.data.auth = auth;
      }
      next();
    } catch {
      next(new Error('TOKEN_INVALIDO'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const auth = socket.data.auth as Auth | undefined;
    if (auth?.tipo === 'cliente') void socket.join(SALAS.cliente(auth.id));
    if (auth?.tipo === 'dispositivo') {
      void socket.join([SALA_DISPOSITIVOS, salaDispositivo(auth.id)]);
      marcarConexion(auth.id);
      socket.on('disconnect', () => marcarConexion(auth.id));
    }
    logger.debug({ socket: socket.id, tipo: auth?.tipo ?? 'anonimo' }, 'Socket conectado');

    socket.on(EVENTOS.unirseSede, async (payload: unknown, ack?: Ack) => {
      const datos = esquemaSala.safeParse(payload);
      if (!datos.success) return ack?.({ ok: false, error: 'sedeId y canal son obligatorios' });
      const error = await puedeUnirse(auth, datos.data.sedeId, datos.data.canal);
      if (error) return ack?.({ ok: false, error });
      const sala = SALAS[datos.data.canal](datos.data.sedeId);
      await socket.join(sala);
      ack?.({ ok: true, sala });
    });

    socket.on(EVENTOS.salirSede, async (payload: unknown, ack?: Ack) => {
      const datos = esquemaSala.safeParse(payload);
      if (!datos.success) return ack?.({ ok: false, error: 'sedeId y canal son obligatorios' });
      const sala = SALAS[datos.data.canal](datos.data.sedeId);
      await socket.leave(sala);
      ack?.({ ok: true, sala });
    });

    socket.on(EVENTOS.unirseEspera, async (payload: unknown, ack?: Ack) => {
      const datos = esquemaEspera.safeParse(payload);
      if (!datos.success) return ack?.({ ok: false, error: 'entradaId inválido' });
      const existe = await prisma.entradaEspera.count({ where: { id: datos.data.entradaId } });
      if (!existe) return ack?.({ ok: false, error: 'El turno no existe' });
      const sala = SALAS.espera(datos.data.entradaId);
      await socket.join(sala);
      ack?.({ ok: true, sala });
    });
  });

  return io;
}

/** Emite a un canal de una sede (no hace nada si Socket.IO no se ha iniciado, p. ej. en tests de HTTP). */
export function emitirASede(sedeId: number, canal: CanalSede, evento: string, datos: unknown) {
  io?.to(SALAS[canal](sedeId)).emit(evento, datos);
}

export function emitirACliente(clienteId: string, evento: string, datos: unknown) {
  io?.to(SALAS.cliente(clienteId)).emit(evento, datos);
}

export function emitirAEspera(entradaId: string, evento: string, datos: unknown) {
  io?.to(SALAS.espera(entradaId)).emit(evento, datos);
}

/** Evento para todas las pantallas conectadas (p. ej. cambió la apariencia). */
export function emitirATodos(evento: string, datos: unknown) {
  io?.emit(evento, datos);
}

/**
 * Corta las conexiones de un dispositivo (al desactivarlo o cambiar su token), esté conectado
 * a esta instancia o a otra.
 */
export function desconectarDispositivo(dispositivoId: string) {
  if (!io) return;
  const sala = salaDispositivo(dispositivoId);
  io.to(sala).emit(EVENTOS.dispositivoRevocado, {
    motivo: 'El administrador desactivó este equipo',
  });
  io.in(sala).disconnectSockets(true);
}

export async function cerrarSocket(): Promise<void> {
  if (io) await io.close();
  io = undefined;
  await Promise.all(clientesRedis.map((c) => c.quit().catch(() => undefined)));
  clientesRedis = [];
}
