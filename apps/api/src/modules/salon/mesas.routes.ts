import { z } from 'zod';
import type { EstadoMesa } from '@prisma/client';
import { EstadoMesa as Estados, TRANSICIONES_MESA, puedeTransicionar } from '@restaurantes/shared';
import { prisma } from '../../db/prisma';
import { crearModulo } from '../../http/ruta';
import { idEntero, paramsId, paramsSede, parcial } from '../../http/esquemas';
import { HttpError } from '../../utils/http-error';
import { fechaOperacion, localAUtc, sumarDias } from '../../utils/fechas';
import { asegurarSede } from '../../auth/alcance';
import type { AuthPersonal } from '../../auth/tipos';
import { abrirSesion, cerrarSesion, emitirMesa, horaLocal } from './salon.service';

export const moduloMesas = crearModulo('Mesas y mapa del salón');
const { ruta } = moduloMesas;

const GERENTES = ['ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE'] as const;
const OPERACION = ['ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE', 'CAJERO'] as const;

/** Lienzo del plano: 1000 × 700 unidades */
const posicion = {
  posX: z.number().int().min(0).max(1000),
  posY: z.number().int().min(0).max(700),
  ancho: z.number().int().min(30).max(400),
  alto: z.number().int().min(30).max(400),
  rotacion: z.number().int().min(0).max(359).default(0),
};

const cuerpoMesa = z.object({
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{1,10}$/),
  capacidad: z.number().int().min(1).max(30),
  zona: z.string().trim().min(2).max(40),
  forma: z.enum(['REDONDA', 'CUADRADA', 'RECTANGULAR']),
  ...posicion,
  activa: z.boolean().default(true),
});

async function cargarMesa(auth: AuthPersonal, id: number) {
  const mesa = await prisma.mesa.findUnique({ where: { id } });
  if (!mesa) throw HttpError.notFound('Mesa');
  const sede = await asegurarSede(auth, mesa.sedeId);
  return { mesa, sede };
}

ruta(
  {
    metodo: 'get',
    ruta: '/sedes/:sedeId/mesas',
    resumen: 'Mesas con su estado, sesión actual y próxima reserva de hoy (panel y mapa)',
    auth: 'personal',
    params: paramsSede,
  },
  async ({ auth, params }) => {
    const sede = await asegurarSede(auth, params.sedeId);
    const ahora = new Date();
    const finDelDia = localAUtc(
      sumarDias(fechaOperacion(ahora, sede.zonaHoraria), 1),
      0,
      0,
      sede.zonaHoraria,
    );

    const mesas = await prisma.mesa.findMany({
      where: { sedeId: sede.id },
      orderBy: { codigo: 'asc' },
      include: {
        sesiones: { where: { fin: null }, take: 1, orderBy: { inicio: 'desc' } },
        reservas: {
          where: {
            estado: { in: ['PENDIENTE', 'CONFIRMADA'] },
            inicio: { gte: new Date(ahora.getTime() - 30 * 60_000), lt: finDelDia },
          },
          orderBy: { inicio: 'asc' },
          take: 1,
          include: { cliente: { select: { nombre: true, telefono: true } } },
        },
      },
    });

    const datos = mesas.map(({ sesiones, reservas, ...m }) => {
      const sesion = sesiones[0];
      const reserva = reservas[0];
      return {
        ...m,
        sesionActual: sesion
          ? { ...sesion, minutos: Math.floor((ahora.getTime() - sesion.inicio.getTime()) / 60_000) }
          : null,
        proximaReserva: reserva
          ? {
              id: reserva.id,
              hora: horaLocal(reserva.inicio, sede.zonaHoraria),
              inicio: reserva.inicio,
              personas: reserva.personas,
              estado: reserva.estado,
              cliente: reserva.cliente,
              codigoConfirmacion: reserva.codigoConfirmacion,
            }
          : null,
      };
    });

    const resumen = Object.fromEntries(Object.keys(Estados).map((e) => [e, 0])) as Record<
      EstadoMesa,
      number
    >;
    for (const m of datos) if (m.activa) resumen[m.estado]++;
    const activas = datos.filter((m) => m.activa).length;
    return {
      lienzo: { ancho: 1000, alto: 700 },
      resumen: {
        ...resumen,
        total: activas,
        ocupacionPct: activas ? Math.round((resumen.OCUPADA / activas) * 100) : 0,
      },
      mesas: datos,
    };
  },
);

ruta(
  {
    metodo: 'post',
    ruta: '/sedes/:sedeId/mesas',
    resumen: 'Crear mesa',
    auth: 'personal',
    roles: GERENTES,
    params: paramsSede,
    body: cuerpoMesa,
    status: 201,
  },
  async ({ auth, params, body }) => {
    await asegurarSede(auth, params.sedeId);
    const existe = await prisma.mesa.findUnique({
      where: { sedeId_codigo: { sedeId: params.sedeId, codigo: body.codigo } },
    });
    if (existe) throw HttpError.conflict(`Ya existe la mesa ${body.codigo} en esta sede`);
    return prisma.mesa.create({ data: { ...body, sedeId: params.sedeId } });
  },
);

ruta(
  {
    metodo: 'patch',
    ruta: '/mesas/:id',
    resumen: 'Editar mesa (código, capacidad, zona, forma, posición, activa)',
    auth: 'personal',
    roles: GERENTES,
    params: paramsId,
    body: parcial(cuerpoMesa),
  },
  async ({ auth, params, body }) => {
    const { mesa } = await cargarMesa(auth, params.id);
    if (body.activa === false && mesa.estado === 'OCUPADA')
      throw HttpError.unprocessable('No se puede desactivar una mesa ocupada');
    return prisma.mesa.update({ where: { id: mesa.id }, data: body });
  },
);

ruta(
  {
    metodo: 'put',
    ruta: '/sedes/:sedeId/plano',
    resumen: 'Guardar el plano del salón (posiciones de varias mesas a la vez)',
    descripcion:
      'Lo usa el modo edición del mapa al soltar las mesas. Todas deben pertenecer a la sede.',
    auth: 'personal',
    roles: GERENTES,
    params: paramsSede,
    body: z.object({
      mesas: z
        .array(
          z.object({
            id: idEntero,
            ...posicion,
            zona: z.string().trim().min(2).max(40).optional(),
          }),
        )
        .min(1)
        .max(200),
    }),
  },
  async ({ auth, params, body }) => {
    await asegurarSede(auth, params.sedeId);
    const ids = body.mesas.map((m) => m.id);
    const propias = await prisma.mesa.count({ where: { id: { in: ids }, sedeId: params.sedeId } });
    if (propias !== new Set(ids).size)
      throw HttpError.unprocessable('Hay mesas que no pertenecen a esta sede');
    await prisma.$transaction(
      body.mesas.map(({ id, ...datos }) => prisma.mesa.update({ where: { id }, data: datos })),
    );
    return { actualizadas: body.mesas.length };
  },
);

ruta(
  {
    metodo: 'patch',
    ruta: '/mesas/:id/estado',
    resumen: 'Cambiar el estado de una mesa',
    descripcion:
      'LIBRE → OCUPADA abre una sesión de cliente directo (sin reserva). OCUPADA → LIMPIEZA o LIBRE cierra la sesión ' +
      'y completa la reserva sentada. Para sentar una reserva o un turno de la cola usa sus propios endpoints.',
    auth: 'personal',
    roles: OPERACION,
    params: paramsId,
    body: z.object({
      estado: z.enum(Object.keys(Estados) as [EstadoMesa, ...EstadoMesa[]]),
      personas: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe('Solo al ocupar; por defecto la capacidad'),
    }),
  },
  async ({ auth, params, body }) => {
    const { mesa, sede } = await cargarMesa(auth, params.id);
    if (mesa.estado === body.estado) return mesa;
    if (!puedeTransicionar(TRANSICIONES_MESA, mesa.estado, body.estado)) {
      throw HttpError.unprocessable(`No se puede pasar de ${mesa.estado} a ${body.estado}`, {
        permitidos: TRANSICIONES_MESA[mesa.estado],
      });
    }

    const actualizada = await prisma.$transaction(async (tx) => {
      if (body.estado === 'OCUPADA') {
        await abrirSesion(tx, mesa, 'DIRECTO', body.personas ?? mesa.capacidad);
      } else if (mesa.estado === 'OCUPADA') {
        await cerrarSesion(tx, mesa.id, body.estado as 'LIBRE' | 'LIMPIEZA');
      } else {
        const r = await tx.mesa.updateMany({
          where: { id: mesa.id, estado: mesa.estado },
          data: { estado: body.estado },
        });
        if (r.count === 0) throw HttpError.conflict('La mesa cambió de estado mientras tanto');
      }
      return tx.mesa.findUniqueOrThrow({ where: { id: mesa.id } });
    });

    emitirMesa(sede.id, actualizada);
    return actualizada;
  },
);
