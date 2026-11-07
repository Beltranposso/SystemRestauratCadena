import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type { EstadoReserva, Prisma } from '@prisma/client';
import {
  EVENTOS,
  EstadoReserva as Estados,
  TRANSICIONES_RESERVA,
  puedeTransicionar,
} from '@restaurantes/shared';
import { exigirReservas } from '../configuracion/configuracion.service';
import { prisma } from '../../db/prisma';
import { crearModulo } from '../../http/ruta';
import {
  fecha,
  hora,
  idEntero,
  listaEnum,
  paginacion,
  paginado,
  paramsSede,
  paramsUuid,
  parcial,
  saltar,
} from '../../http/esquemas';
import { HttpError } from '../../utils/http-error';
import { fechaOperacion, localAUtc, sumarDias } from '../../utils/fechas';
import {
  asegurarSede,
  esGerente,
  obtenerSede,
  sedesFiltradas,
  type SedeInfo,
} from '../../auth/alcance';
import type { Auth, AuthCliente, AuthPersonal } from '../../auth/tipos';
import { emitirASede } from '../../realtime/socket';
import { notificarSinEsperar } from '../notificaciones/notificaciones.service';
import {
  abrirSesion,
  bloquearReservasSede,
  buscarMesaLibre,
  disponibilidad,
  emitirMesa,
  incluirReserva,
  reservaConHoraLocal,
  validarHorarioReserva,
} from './salon.service';

export const moduloReservas = crearModulo('Reservas');
const { ruta } = moduloReservas;

const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const nuevoCodigo = () =>
  Array.from({ length: 6 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');

type ReservaCompleta = Prisma.ReservaGetPayload<{ include: typeof incluirReserva }>;

async function cargarReserva(id: string) {
  const reserva = await prisma.reserva.findUnique({ where: { id }, include: incluirReserva });
  if (!reserva) throw HttpError.notFound('Reserva');
  return { reserva, sede: await obtenerSede(reserva.sedeId) };
}

/** El cliente dueño o el personal con alcance sobre la sede. */
async function cargarReservaVisible(auth: Auth, id: string) {
  const datos = await cargarReserva(id);
  if (auth.tipo === 'cliente') {
    if (datos.reserva.clienteId !== auth.id) throw HttpError.notFound('Reserva');
  } else if (auth.tipo === 'usuario') {
    await asegurarSede(auth, datos.reserva.sedeId);
  } else {
    throw HttpError.forbidden();
  }
  return datos;
}

function avisar(reserva: ReservaCompleta, sede: SedeInfo) {
  const datos = reservaConHoraLocal(reserva, sede);
  emitirASede(sede.id, 'salon', EVENTOS.reservaActualizada, datos);
  return datos;
}

async function notificarCliente(
  reserva: ReservaCompleta,
  sede: SedeInfo,
  tipo: 'CONFIRMACION_RESERVA' | 'CAMBIO_RESERVA' | 'MESA_LISTA',
  asunto: string,
  mensaje: string,
) {
  await notificarSinEsperar({
    tipo,
    asunto,
    mensaje,
    clienteId: reserva.clienteId,
    email: reserva.cliente.email,
    reservaId: reserva.id,
    datos: { reservaId: reserva.id, codigo: reserva.codigoConfirmacion, sede: sede.nombre },
  });
}

const describir = (r: ReservaCompleta, sede: SedeInfo) => {
  const dia = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: sede.zonaHoraria,
  }).format(r.inicio);
  const local = reservaConHoraLocal(r, sede);
  return `${sede.nombre}, ${dia} a las ${local.hora}, ${r.personas} persona${r.personas === 1 ? '' : 's'}`;
};

/** El cliente solo puede cambiar o cancelar antes del límite configurado en la sede. */
function verificarLimiteCliente(reserva: { inicio: Date }, sede: SedeInfo) {
  const limite = reserva.inicio.getTime() - sede.horasMinimasCancelacion * 3_600_000;
  if (Date.now() > limite) {
    throw HttpError.unprocessable(
      `Los cambios y cancelaciones se hacen con al menos ${sede.horasMinimasCancelacion} h de antelación; comunícate con la sede`,
    );
  }
}

// ───────────────────────────── Portal del cliente ─────────────────────────────

ruta(
  {
    metodo: 'get',
    ruta: '/sedes/:sedeId/disponibilidad',
    resumen: 'Franjas disponibles para reservar un día',
    descripcion:
      'Franjas cada 30 min dentro del horario de la sede, con cuántas mesas aptas quedan libres.',
    auth: 'publico',
    params: paramsSede,
    query: z.object({ fecha, personas: z.coerce.number().int().min(1).max(30) }),
  },
  async ({ params, query }) => {
    await exigirReservas();
    const sede = await obtenerSede(params.sedeId);
    if (!sede.activa) throw HttpError.notFound('Sede');
    return {
      sedeId: sede.id,
      fecha: query.fecha,
      personas: query.personas,
      duracionMin: sede.duracionReservaMin,
      franjas: await disponibilidad(sede, query.fecha, query.personas),
    };
  },
);

const cuerpoReserva = z.object({
  sedeId: idEntero,
  fecha: fecha.describe('Fecha local de la sede'),
  hora: hora.describe('Hora local de la sede'),
  personas: z.number().int().min(1).max(30),
  notas: z.string().trim().max(300).optional(),
});

ruta(
  {
    metodo: 'post',
    ruta: '/reservas',
    resumen: 'Reservar mesa',
    descripcion:
      'Asigna automáticamente la mesa más ajustada y confirma la reserva al instante con un código de 6 caracteres. ' +
      'Envía la confirmación en la app y por correo. 409 `SIN_DISPONIBILIDAD` incluye franjas alternativas del mismo día.',
    auth: 'cliente',
    status: 201,
    body: cuerpoReserva,
  },
  async ({ auth, body }) => {
    await exigirReservas();
    const sede = await obtenerSede(body.sedeId);
    if (!sede.activa) throw HttpError.notFound('Sede');
    const inicio = validarHorarioReserva(sede, body.fecha, body.hora);

    const reserva = await prisma.$transaction(async (tx) => {
      await bloquearReservasSede(tx, sede.id);
      const mesa = await buscarMesaLibre(tx, sede, body.personas, inicio);
      if (!mesa) return null;
      return tx.reserva.create({
        data: {
          sedeId: sede.id,
          clienteId: auth.id,
          mesaId: mesa.id,
          inicio,
          duracionMin: sede.duracionReservaMin,
          personas: body.personas,
          estado: 'CONFIRMADA',
          codigoConfirmacion: nuevoCodigo(),
          notas: body.notas,
        },
        include: incluirReserva,
      });
    });

    if (!reserva) {
      const alternativas = (await disponibilidad(sede, body.fecha, body.personas))
        .filter((f) => f.disponible)
        .map((f) => f.hora);
      throw new HttpError(409, 'SIN_DISPONIBILIDAD', 'No hay mesas libres para esa hora', {
        alternativas,
      });
    }

    await notificarCliente(
      reserva,
      sede,
      'CONFIRMACION_RESERVA',
      `Reserva confirmada · ${reserva.codigoConfirmacion}`,
      `Tu reserva está confirmada: ${describir(reserva, sede)}. Código ${reserva.codigoConfirmacion}.`,
    );
    return avisar(reserva, sede);
  },
);

ruta(
  {
    metodo: 'get',
    ruta: '/clientes/me',
    resumen: 'Mi perfil (cliente)',
    auth: 'cliente',
  },
  async ({ auth }) =>
    prisma.cliente.findUniqueOrThrow({
      where: { id: auth.id },
      select: { id: true, nombre: true, email: true, telefono: true, creadoEn: true },
    }),
);

ruta(
  {
    metodo: 'get',
    ruta: '/clientes/me/reservas',
    resumen: 'Mis reservas',
    auth: 'cliente',
    query: z.object({
      vigentes: z.enum(['true', 'false']).optional().describe('true: solo próximas activas'),
    }),
  },
  async ({ auth, query }) => {
    const reservas = await prisma.reserva.findMany({
      where: {
        clienteId: auth.id,
        ...(query.vigentes === 'true'
          ? {
              estado: { in: ['PENDIENTE', 'CONFIRMADA', 'SENTADA'] },
              inicio: { gte: new Date(Date.now() - 3 * 3_600_000) },
            }
          : {}),
      },
      include: { ...incluirReserva, calificaciones: { select: { id: true, puntaje: true } } },
      orderBy: { inicio: 'desc' },
      take: 100,
    });
    const ahora = Date.now();
    return Promise.all(
      reservas.map(async (r) => {
        const sede = await obtenerSede(r.sedeId);
        const limite = r.inicio.getTime() - sede.horasMinimasCancelacion * 3_600_000;
        return {
          ...reservaConHoraLocal(r, sede),
          puedeModificar: ['PENDIENTE', 'CONFIRMADA'].includes(r.estado) && ahora < limite,
          puedeCalificar: r.estado === 'COMPLETADA' && r.calificaciones.length === 0,
        };
      }),
    );
  },
);

ruta(
  {
    metodo: 'get',
    ruta: '/clientes/me/notificaciones',
    resumen: 'Mis notificaciones',
    auth: 'cliente',
  },
  async ({ auth }) =>
    prisma.notificacion.findMany({
      where: { clienteId: auth.id, canal: 'EN_APP' },
      orderBy: { creadoEn: 'desc' },
      take: 50,
    }),
);

ruta(
  {
    metodo: 'get',
    ruta: '/reservas/:id',
    resumen: 'Detalle de reserva (personal de la sede)',
    auth: 'personal',
    params: paramsUuid,
  },
  async ({ auth, params }) => {
    const { reserva, sede } = await cargarReservaVisible(auth, params.id);
    return reservaConHoraLocal(reserva, sede);
  },
);

ruta(
  {
    metodo: 'get',
    ruta: '/clientes/me/reservas/:id',
    resumen: 'Detalle de una de mis reservas (pantalla de confirmación)',
    auth: 'cliente',
    params: paramsUuid,
  },
  async ({ auth, params }) => {
    const { reserva, sede } = await cargarReservaVisible(auth, params.id);
    return reservaConHoraLocal(reserva, sede);
  },
);

ruta(
  {
    metodo: 'patch',
    ruta: '/reservas/:id',
    resumen: 'Modificar mi reserva (fecha, hora, personas, notas)',
    descripcion:
      'Revalida disponibilidad y puede cambiar de mesa. Solo antes del límite de la sede.',
    auth: 'cliente',
    params: paramsUuid,
    body: parcial(cuerpoReserva.omit({ sedeId: true })),
  },
  async ({ auth, params, body }) => {
    await exigirReservas();
    const { reserva, sede } = await cargarReservaVisible(auth, params.id);
    if (!['PENDIENTE', 'CONFIRMADA'].includes(reserva.estado)) {
      throw HttpError.unprocessable(`Una reserva ${reserva.estado} no se puede modificar`);
    }
    verificarLimiteCliente(reserva, sede);

    const local = reservaConHoraLocal(reserva, sede);
    const cambiaMesa = body.fecha || body.hora || body.personas;
    const inicio = cambiaMesa
      ? validarHorarioReserva(sede, body.fecha ?? local.fecha, body.hora ?? local.hora)
      : reserva.inicio;
    const personas = body.personas ?? reserva.personas;

    const actualizada = await prisma.$transaction(async (tx) => {
      let mesaId = reserva.mesaId;
      if (cambiaMesa) {
        await bloquearReservasSede(tx, sede.id);
        const mesa = await buscarMesaLibre(tx, sede, personas, inicio, reserva.id);
        if (!mesa)
          throw new HttpError(
            409,
            'SIN_DISPONIBILIDAD',
            'No hay mesas libres para ese cambio; tu reserva sigue igual',
          );
        mesaId = mesa.id;
      }
      return tx.reserva.update({
        where: { id: reserva.id },
        data: {
          inicio,
          personas,
          mesaId,
          ...(body.notas !== undefined ? { notas: body.notas } : {}),
        },
        include: incluirReserva,
      });
    });

    await notificarCliente(
      actualizada,
      sede,
      'CAMBIO_RESERVA',
      `Reserva modificada · ${actualizada.codigoConfirmacion}`,
      `Tu reserva cambió: ${describir(actualizada, sede)}.`,
    );
    return avisar(actualizada, sede);
  },
);

async function cancelar(auth: AuthCliente | AuthPersonal, id: string) {
  const { reserva, sede } = await cargarReservaVisible(auth, id);
  if (!puedeTransicionar(TRANSICIONES_RESERVA, reserva.estado, 'CANCELADA')) {
    throw HttpError.unprocessable(`Una reserva ${reserva.estado} no se puede cancelar`);
  }
  if (auth.tipo === 'cliente') verificarLimiteCliente(reserva, sede);

  const actualizada = await prisma.$transaction(async (tx) => {
    const r = await tx.reserva.updateMany({
      where: { id, estado: reserva.estado },
      data: { estado: 'CANCELADA', canceladaEn: new Date() },
    });
    if (r.count === 0) throw HttpError.conflict('La reserva cambió mientras tanto');
    // Si la mesa estaba apartada para esta reserva, se libera
    if (reserva.mesaId)
      await tx.mesa.updateMany({
        where: { id: reserva.mesaId, estado: 'RESERVADA' },
        data: { estado: 'LIBRE' },
      });
    return tx.reserva.findUniqueOrThrow({ where: { id }, include: incluirReserva });
  });
  if (reserva.mesaId) {
    const mesa = await prisma.mesa.findUniqueOrThrow({ where: { id: reserva.mesaId } });
    emitirMesa(sede.id, mesa);
  }
  await notificarCliente(
    actualizada,
    sede,
    'CAMBIO_RESERVA',
    `Reserva cancelada · ${actualizada.codigoConfirmacion}`,
    `Tu reserva fue cancelada: ${describir(actualizada, sede)}.`,
  );
  return avisar(actualizada, sede);
}

ruta(
  {
    metodo: 'post',
    ruta: '/clientes/me/reservas/:id/cancelar',
    resumen: 'Cancelar mi reserva',
    descripcion: 'Solo antes del límite de la sede (horasMinimasCancelacion).',
    auth: 'cliente',
    params: paramsUuid,
  },
  async ({ auth, params }) => cancelar(auth, params.id),
);

// ───────────────────────────── Gestión en la sede ─────────────────────────────

const estadosReserva = Object.keys(Estados) as [EstadoReserva, ...EstadoReserva[]];

ruta(
  {
    metodo: 'get',
    ruta: '/reservas',
    resumen: 'Reservas de la sede (agenda del día)',
    auth: 'personal',
    query: paginacion.extend({
      sedeId: idEntero.optional(),
      fecha: fecha.optional().describe('Día local; por defecto hoy'),
      estado: listaEnum(estadosReserva).optional(),
      codigo: z.string().trim().toUpperCase().length(6).optional(),
    }),
  },
  async ({ auth, query }) => {
    const sedes = await sedesFiltradas(auth, { sedeId: query.sedeId });
    const where: Prisma.ReservaWhereInput = {
      sedeId: { in: sedes.map((s) => s.id) },
      ...(query.estado ? { estado: { in: query.estado } } : {}),
      ...(query.codigo ? { codigoConfirmacion: query.codigo } : {}),
    };
    // El "día" depende de la zona de cada sede
    if (!query.codigo) {
      where.OR = sedes.map((s) => {
        const dia = query.fecha ?? fechaOperacion(new Date(), s.zonaHoraria);
        return {
          sedeId: s.id,
          inicio: {
            gte: localAUtc(dia, 0, 0, s.zonaHoraria),
            lt: localAUtc(sumarDias(dia, 1), 0, 0, s.zonaHoraria),
          },
        };
      });
    }
    const [filas, total] = await Promise.all([
      prisma.reserva.findMany({
        where,
        include: incluirReserva,
        orderBy: { inicio: 'asc' },
        ...saltar(query),
      }),
      prisma.reserva.count({ where }),
    ]);
    const datos = await Promise.all(
      filas.map(async (r) => reservaConHoraLocal(r, await obtenerSede(r.sedeId))),
    );
    return paginado(datos, total, query);
  },
);

ruta(
  {
    metodo: 'post',
    ruta: '/reservas/:id/cancelar',
    resumen: 'Cancelar reserva (personal)',
    descripcion: 'El personal puede cancelar en cualquier momento; se notifica al cliente.',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE', 'CAJERO'],
    params: paramsUuid,
  },
  async ({ auth, params }) => cancelar(auth, params.id),
);

ruta(
  {
    metodo: 'post',
    ruta: '/reservas/:id/confirmar',
    resumen: 'Confirmar una reserva pendiente',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE', 'CAJERO'],
    params: paramsUuid,
  },
  async ({ auth, params }) => {
    const { reserva, sede } = await cargarReservaVisible(auth, params.id);
    if (reserva.estado !== 'PENDIENTE')
      throw HttpError.unprocessable(`La reserva ya está ${reserva.estado}`);
    const actualizada = await prisma.reserva.update({
      where: { id: reserva.id },
      data: { estado: 'CONFIRMADA' },
      include: incluirReserva,
    });
    await notificarCliente(
      actualizada,
      sede,
      'CONFIRMACION_RESERVA',
      `Reserva confirmada · ${actualizada.codigoConfirmacion}`,
      `Tu reserva está confirmada: ${describir(actualizada, sede)}.`,
    );
    return avisar(actualizada, sede);
  },
);

ruta(
  {
    metodo: 'post',
    ruta: '/reservas/:id/notificar-mesa-lista',
    resumen: 'Avisar al cliente que su mesa está lista',
    descripcion:
      'Aparta la mesa (RESERVADA) si está libre y envía el aviso en la app y por correo.',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE', 'CAJERO'],
    params: paramsUuid,
  },
  async ({ auth, params }) => {
    const { reserva, sede } = await cargarReservaVisible(auth, params.id);
    if (!['PENDIENTE', 'CONFIRMADA'].includes(reserva.estado))
      throw HttpError.unprocessable(`La reserva está ${reserva.estado}`);
    if (!reserva.mesa) throw HttpError.unprocessable('La reserva no tiene mesa asignada');
    const r = await prisma.mesa.updateMany({
      where: { id: reserva.mesa.id, estado: { in: ['LIBRE', 'RESERVADA'] } },
      data: { estado: 'RESERVADA' },
    });
    if (r.count === 0)
      throw HttpError.conflict(`La mesa ${reserva.mesa.codigo} todavía no está libre`);
    emitirMesa(sede.id, { id: reserva.mesa.id, codigo: reserva.mesa.codigo, estado: 'RESERVADA' });
    await notificarCliente(
      reserva,
      sede,
      'MESA_LISTA',
      `Tu mesa está lista · ${sede.nombre}`,
      `Tu mesa ${reserva.mesa.codigo} está lista. Acércate a la entrada con el código ${reserva.codigoConfirmacion}.`,
    );
    return avisar(reserva, sede);
  },
);

ruta(
  {
    metodo: 'post',
    ruta: '/reservas/:id/sentar',
    resumen: 'Sentar al cliente de una reserva',
    descripcion:
      'Ocupa la mesa asignada (o la indicada), abre la sesión de mesa y pasa la reserva a SENTADA.',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE', 'CAJERO'],
    params: paramsUuid,
    body: z.object({ mesaId: idEntero.optional().describe('Para cambiar de mesa al llegar') }),
  },
  async ({ auth, params, body }) => {
    const { reserva, sede } = await cargarReservaVisible(auth, params.id);
    if (!['PENDIENTE', 'CONFIRMADA'].includes(reserva.estado))
      throw HttpError.unprocessable(`La reserva está ${reserva.estado}`);
    const mesaId = body.mesaId ?? reserva.mesaId;
    if (!mesaId) throw HttpError.badRequest('Indica la mesa');
    const mesa = await prisma.mesa.findFirst({ where: { id: mesaId, sedeId: sede.id } });
    if (!mesa) throw HttpError.unprocessable('La mesa no pertenece a esta sede');

    const actualizada = await prisma.$transaction(async (tx) => {
      await abrirSesion(tx, mesa, 'RESERVA', reserva.personas, { reservaId: reserva.id });
      return tx.reserva.update({
        where: { id: reserva.id },
        data: { estado: 'SENTADA', mesaId },
        include: incluirReserva,
      });
    });
    emitirMesa(sede.id, { ...mesa, estado: 'OCUPADA' });
    return avisar(actualizada, sede);
  },
);

ruta(
  {
    metodo: 'post',
    ruta: '/reservas/:id/no-show',
    resumen: 'Marcar que el cliente no llegó',
    descripcion:
      'Disponible 15 minutos después de la hora reservada. Libera la mesa si estaba apartada.',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE', 'CAJERO'],
    params: paramsUuid,
  },
  async ({ auth, params }) => {
    const { reserva, sede } = await cargarReservaVisible(auth, params.id);
    if (!puedeTransicionar(TRANSICIONES_RESERVA, reserva.estado, 'NO_SHOW'))
      throw HttpError.unprocessable(`La reserva está ${reserva.estado}`);
    if (Date.now() < reserva.inicio.getTime() + 15 * 60_000 && !esGerente(auth.rol)) {
      throw HttpError.unprocessable('Espera al menos 15 minutos después de la hora de la reserva');
    }
    const actualizada = await prisma.$transaction(async (tx) => {
      if (reserva.mesaId)
        await tx.mesa.updateMany({
          where: { id: reserva.mesaId, estado: 'RESERVADA' },
          data: { estado: 'LIBRE' },
        });
      return tx.reserva.update({
        where: { id: reserva.id },
        data: { estado: 'NO_SHOW' },
        include: incluirReserva,
      });
    });
    if (reserva.mesa)
      emitirMesa(sede.id, await prisma.mesa.findUniqueOrThrow({ where: { id: reserva.mesa.id } }));
    return avisar(actualizada, sede);
  },
);
