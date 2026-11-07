import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { EntradaEspera } from '@prisma/client';
import { EVENTOS } from '@restaurantes/shared';
import { esTest } from '../../config/env';
import { obtenerConfiguracion } from '../configuracion/configuracion.service';
import { prisma } from '../../db/prisma';
import { siguienteConsecutivo } from '../../db/secuencias';
import { crearModulo } from '../../http/ruta';
import { idEntero, paramsSede, paramsUuid } from '../../http/esquemas';
import { HttpError } from '../../utils/http-error';
import { aFechaDb, fechaOperacion } from '../../utils/fechas';
import { asegurarSede, obtenerSede, type SedeInfo } from '../../auth/alcance';
import type { AuthPersonal } from '../../auth/tipos';
import { emitirAEspera, emitirASede } from '../../realtime/socket';
import { notificarSinEsperar } from '../notificaciones/notificaciones.service';
import { abrirSesion, emitirMesa } from './salon.service';

export const moduloEspera = crearModulo('Cola de espera');
const { ruta } = moduloEspera;

const OPERACION = ['ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE', 'CAJERO'] as const;
const ACTIVOS = ['ESPERANDO', 'NOTIFICADO'] as const;

const limiteCola = rateLimit({
  windowMs: 10 * 60_000,
  limit: 20,
  skip: () => esTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: 'DEMASIADAS_SOLICITUDES',
        message: 'Demasiadas solicitudes, espera unos minutos',
      },
    });
  },
});

/** Duración media de ocupación de una mesa en la sede (últimos 14 días), en minutos; con caché de 10 min. */
const cacheRotacion = new Map<number, { minutos: number; hasta: number }>();
async function rotacionMedia(sedeId: number): Promise<number> {
  const c = cacheRotacion.get(sedeId);
  if (c && c.hasta > Date.now()) return c.minutos;
  const filas = await prisma.$queryRaw<{ minutos: number | null }[]>`
    SELECT AVG(EXTRACT(EPOCH FROM (s.fin - s.inicio)) / 60)::float AS minutos
    FROM sesiones_mesa s JOIN mesas m ON m.id = s.mesa_id
    WHERE m.sede_id = ${sedeId} AND s.fin IS NOT NULL AND s.inicio > now() - interval '14 days'`;
  const minutos = filas[0]?.minutos ?? 60;
  cacheRotacion.set(sedeId, { minutos, hasta: Date.now() + 10 * 60_000 });
  return minutos;
}

/** Posición en la cola y espera estimada: (personas delante + 1) × rotación media ÷ mesas donde caben. */
async function estadoPublico(entrada: EntradaEspera & { mesa?: { codigo: string } | null }) {
  let posicion: number | null = null;
  let esperaEstimadaMin: number | null = null;
  if (entrada.estado === 'ESPERANDO') {
    const [delante, mesas, rotacion] = await Promise.all([
      prisma.entradaEspera.count({
        where: {
          sedeId: entrada.sedeId,
          fechaOperacion: entrada.fechaOperacion,
          estado: 'ESPERANDO',
          numeroTurno: { lt: entrada.numeroTurno },
        },
      }),
      prisma.mesa.count({
        where: { sedeId: entrada.sedeId, activa: true, capacidad: { gte: entrada.personas } },
      }),
      rotacionMedia(entrada.sedeId),
    ]);
    posicion = delante + 1;
    esperaEstimadaMin = Math.min(
      120,
      Math.max(5, Math.ceil((posicion * rotacion) / Math.max(1, mesas))),
    );
  }
  return {
    id: entrada.id,
    sedeId: entrada.sedeId,
    numeroTurno: entrada.numeroTurno,
    nombre: entrada.nombre,
    personas: entrada.personas,
    estado: entrada.estado,
    posicion,
    esperaEstimadaMin,
    mesa: entrada.mesa?.codigo ?? null,
    creadoEn: entrada.creadoEn,
    notificadoEn: entrada.notificadoEn,
  };
}

/** Tras cualquier cambio, cada turno vivo de la sede recibe su nueva posición y el salón la lista. */
async function difundirCola(sedeId: number, fechaOp: Date) {
  const vivas = await prisma.entradaEspera.findMany({
    where: { sedeId, fechaOperacion: fechaOp, estado: { in: [...ACTIVOS] } },
    include: { mesa: { select: { codigo: true } } },
    orderBy: { numeroTurno: 'asc' },
  });
  const estados = await Promise.all(vivas.map(estadoPublico));
  for (const e of estados) emitirAEspera(e.id, EVENTOS.esperaActualizada, e);
  emitirASede(sedeId, 'salon', EVENTOS.esperaActualizada, estados);
  return estados;
}

async function cargarEntrada(id: string) {
  const entrada = await prisma.entradaEspera.findUnique({
    where: { id },
    include: { mesa: { select: { codigo: true } } },
  });
  if (!entrada) throw HttpError.notFound('Turno de espera');
  return entrada;
}

async function cargarParaPersonal(auth: AuthPersonal, id: string) {
  const entrada = await cargarEntrada(id);
  const sede = await asegurarSede(auth, entrada.sedeId);
  return { entrada, sede };
}

async function avisarMesaLista(entrada: EntradaEspera, sede: SedeInfo, mesaCodigo: string | null) {
  const cliente = entrada.clienteId
    ? await prisma.cliente.findUnique({ where: { id: entrada.clienteId }, select: { email: true } })
    : null;
  await notificarSinEsperar({
    tipo: 'MESA_LISTA',
    asunto: `Tu mesa está lista · ${sede.nombre}`,
    mensaje: mesaCodigo
      ? `Turno ${entrada.numeroTurno}: tu mesa ${mesaCodigo} está lista. Acércate a la entrada.`
      : `Turno ${entrada.numeroTurno}: tu mesa está lista. Acércate a la entrada.`,
    clienteId: entrada.clienteId,
    email: cliente?.email ?? null,
    telefono: entrada.telefono,
    entradaEsperaId: entrada.id,
    datos: { entradaId: entrada.id, numeroTurno: entrada.numeroTurno, mesa: mesaCodigo },
  });
}

// ───────────────────────────── Comensal ─────────────────────────────

ruta(
  {
    metodo: 'post',
    ruta: '/sedes/:sedeId/espera',
    resumen: 'Unirse a la cola de espera',
    descripcion:
      'Público (kiosco de entrada, QR o caja). Si llega un JWT de cliente se usan sus datos. ' +
      'Devuelve el número de turno, la posición y la espera estimada; sigue el turno con GET /espera/{id} ' +
      'o por Socket.IO (espera:unirse).',
    auth: 'cliente-opcional',
    status: 201,
    params: paramsSede,
    body: z.object({
      nombre: z.string().trim().min(2).max(80).optional(),
      telefono: z
        .string()
        .trim()
        .regex(/^\+?[0-9 ()-]{7,20}$/, 'Teléfono inválido')
        .optional(),
      personas: z.number().int().min(1).max(30),
    }),
    middlewares: [limiteCola],
  },
  async ({ auth, params, body }) => {
    const sede = await obtenerSede(params.sedeId);
    if (!sede.activa) throw HttpError.notFound('Sede');
    const cliente = auth ? await prisma.cliente.findUnique({ where: { id: auth.id } }) : null;
    const nombre = body.nombre ?? cliente?.nombre;
    const telefono = body.telefono ?? cliente?.telefono;
    if (!nombre || !telefono) throw HttpError.badRequest('Indica nombre y teléfono');

    const maxCapacidad = await prisma.mesa.aggregate({
      where: { sedeId: sede.id, activa: true },
      _max: { capacidad: true },
    });
    if (body.personas > (maxCapacidad._max.capacidad ?? 0)) {
      throw HttpError.unprocessable(
        `La mesa más grande de esta sede es para ${maxCapacidad._max.capacidad ?? 0} personas`,
      );
    }

    const fecha = fechaOperacion(new Date(), sede.zonaHoraria);
    const fechaDb = aFechaDb(fecha);
    const duplicada = await prisma.entradaEspera.findFirst({
      where: { sedeId: sede.id, fechaOperacion: fechaDb, telefono, estado: { in: [...ACTIVOS] } },
    });
    if (duplicada)
      throw HttpError.conflict('Ya tienes un turno activo en esta sede', {
        entradaId: duplicada.id,
        numeroTurno: duplicada.numeroTurno,
      });

    const entrada = await prisma.$transaction(async (tx) => {
      const numero = await siguienteConsecutivo(tx, sede.id, fecha, 'ESPERA');
      return tx.entradaEspera.create({
        data: {
          sedeId: sede.id,
          clienteId: cliente?.id ?? null,
          nombre,
          telefono,
          personas: body.personas,
          fechaOperacion: fechaDb,
          numeroTurno: numero,
        },
      });
    });
    await difundirCola(sede.id, fechaDb);
    return estadoPublico(entrada);
  },
);

ruta(
  {
    metodo: 'get',
    ruta: '/espera/:id',
    resumen: 'Consultar mi turno en la cola',
    descripcion:
      'Público: el id es un UUID imposible de adivinar que el comensal recibe al unirse.',
    auth: 'publico',
    params: paramsUuid,
  },
  async ({ params }) => estadoPublico(await cargarEntrada(params.id)),
);

ruta(
  {
    metodo: 'post',
    ruta: '/espera/:id/salir',
    resumen: 'Salir de la cola',
    descripcion:
      'Solo si la cadena lo permite (configuración `salirFilaHabilitado`); si no, responde 403 y lo hace el personal con /abandono.',
    auth: 'publico',
    params: paramsUuid,
  },
  async ({ params }) => {
    if (!(await obtenerConfiguracion()).salirFilaHabilitado)
      throw new HttpError(
        403,
        'SALIR_FILA_DESHABILITADO',
        'Para salir de la fila avísale al personal del restaurante',
      );
    const entrada = await cargarEntrada(params.id);
    return abandonar(entrada);
  },
);

async function abandonar(entrada: EntradaEspera) {
  if (!ACTIVOS.includes(entrada.estado as (typeof ACTIVOS)[number])) {
    throw HttpError.unprocessable(`El turno ya está ${entrada.estado}`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.entradaEspera.update({ where: { id: entrada.id }, data: { estado: 'ABANDONO' } });
    if (entrada.mesaId)
      await tx.mesa.updateMany({
        where: { id: entrada.mesaId, estado: 'RESERVADA' },
        data: { estado: 'LIBRE' },
      });
  });
  if (entrada.mesaId)
    emitirMesa(
      entrada.sedeId,
      await prisma.mesa.findUniqueOrThrow({ where: { id: entrada.mesaId } }),
    );
  await difundirCola(entrada.sedeId, entrada.fechaOperacion);
  return estadoPublico(await cargarEntrada(entrada.id));
}

// ───────────────────────────── Personal de la sede ─────────────────────────────

ruta(
  {
    metodo: 'get',
    ruta: '/sedes/:sedeId/espera',
    resumen: 'Cola de espera de hoy',
    auth: 'personal',
    params: paramsSede,
    query: z.object({
      incluirCerradas: z
        .enum(['true', 'false'])
        .optional()
        .describe('Incluye sentados y abandonos de hoy'),
    }),
  },
  async ({ auth, params, query }) => {
    const sede = await asegurarSede(auth, params.sedeId);
    const fechaDb = aFechaDb(fechaOperacion(new Date(), sede.zonaHoraria));
    const entradas = await prisma.entradaEspera.findMany({
      where: {
        sedeId: sede.id,
        fechaOperacion: fechaDb,
        ...(query.incluirCerradas === 'true' ? {} : { estado: { in: [...ACTIVOS] } }),
      },
      include: { mesa: { select: { codigo: true } } },
      orderBy: { numeroTurno: 'asc' },
    });
    const datos = await Promise.all(
      entradas.map(async (e) => ({ ...(await estadoPublico(e)), telefono: e.telefono })),
    );
    return {
      esperando: datos.filter((d) => d.estado === 'ESPERANDO').length,
      notificados: datos.filter((d) => d.estado === 'NOTIFICADO').length,
      datos,
    };
  },
);

ruta(
  {
    metodo: 'post',
    ruta: '/espera/:id/notificar',
    resumen: 'Avisar que la mesa está lista',
    descripcion:
      'Si se indica mesaId la aparta (RESERVADA). Envía el aviso en la app o a la sala del turno, y por correo si es cliente registrado.',
    auth: 'personal',
    roles: OPERACION,
    params: paramsUuid,
    body: z.object({ mesaId: idEntero.optional() }),
  },
  async ({ auth, params, body }) => {
    const { entrada, sede } = await cargarParaPersonal(auth, params.id);
    if (!ACTIVOS.includes(entrada.estado as (typeof ACTIVOS)[number]))
      throw HttpError.unprocessable(`El turno ya está ${entrada.estado}`);

    let mesaCodigo = entrada.mesa?.codigo ?? null;
    const mesaId = body.mesaId ?? entrada.mesaId;
    if (body.mesaId) {
      const mesa = await prisma.mesa.findFirst({
        where: { id: body.mesaId, sedeId: sede.id, activa: true },
      });
      if (!mesa) throw HttpError.unprocessable('La mesa no pertenece a esta sede');
      if (mesa.capacidad < entrada.personas)
        throw HttpError.unprocessable(`La mesa es para ${mesa.capacidad} personas`);
      const r = await prisma.mesa.updateMany({
        where: { id: mesa.id, estado: 'LIBRE' },
        data: { estado: 'RESERVADA' },
      });
      if (r.count === 0 && mesa.estado !== 'RESERVADA')
        throw HttpError.conflict(`La mesa ${mesa.codigo} no está libre`);
      emitirMesa(sede.id, { ...mesa, estado: 'RESERVADA' });
      mesaCodigo = mesa.codigo;
    }

    const actualizada = await prisma.entradaEspera.update({
      where: { id: entrada.id },
      data: { estado: 'NOTIFICADO', notificadoEn: new Date(), mesaId: mesaId ?? null },
      include: { mesa: { select: { codigo: true } } },
    });
    await avisarMesaLista(actualizada, sede, mesaCodigo);
    await difundirCola(sede.id, entrada.fechaOperacion);
    return estadoPublico(actualizada);
  },
);

ruta(
  {
    metodo: 'post',
    ruta: '/espera/:id/sentar',
    resumen: 'Sentar al comensal de la cola',
    descripcion: 'Ocupa la mesa y abre su sesión con origen ESPERA.',
    auth: 'personal',
    roles: OPERACION,
    params: paramsUuid,
    body: z.object({
      mesaId: idEntero.optional().describe('Obligatoria si no se apartó mesa al notificar'),
    }),
  },
  async ({ auth, params, body }) => {
    const { entrada, sede } = await cargarParaPersonal(auth, params.id);
    if (!ACTIVOS.includes(entrada.estado as (typeof ACTIVOS)[number]))
      throw HttpError.unprocessable(`El turno ya está ${entrada.estado}`);
    const mesaId = body.mesaId ?? entrada.mesaId;
    if (!mesaId) throw HttpError.badRequest('Indica la mesa');
    const mesa = await prisma.mesa.findFirst({ where: { id: mesaId, sedeId: sede.id } });
    if (!mesa) throw HttpError.unprocessable('La mesa no pertenece a esta sede');

    await prisma.$transaction(async (tx) => {
      await abrirSesion(tx, mesa, 'ESPERA', entrada.personas, { entradaEsperaId: entrada.id });
      // Si se apartó otra mesa al notificar, se libera
      if (entrada.mesaId && entrada.mesaId !== mesaId) {
        await tx.mesa.updateMany({
          where: { id: entrada.mesaId, estado: 'RESERVADA' },
          data: { estado: 'LIBRE' },
        });
      }
      await tx.entradaEspera.update({
        where: { id: entrada.id },
        data: { estado: 'SENTADO', sentadoEn: new Date(), mesaId },
      });
    });
    emitirMesa(sede.id, { ...mesa, estado: 'OCUPADA' });
    await difundirCola(sede.id, entrada.fechaOperacion);
    return estadoPublico(await cargarEntrada(entrada.id));
  },
);

ruta(
  {
    metodo: 'post',
    ruta: '/espera/:id/abandono',
    resumen: 'Marcar que el comensal se fue',
    auth: 'personal',
    roles: OPERACION,
    params: paramsUuid,
  },
  async ({ auth, params }) => {
    const { entrada } = await cargarParaPersonal(auth, params.id);
    return abandonar(entrada);
  },
);
