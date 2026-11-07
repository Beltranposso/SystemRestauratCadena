import { z } from 'zod';
import type { Prisma, TipoDispositivo } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { crearModulo } from '../../http/ruta';
import { idEntero, paramsSede, uuid } from '../../http/esquemas';
import { HttpError } from '../../utils/http-error';
import { asegurarPais, asegurarSede, sedesFiltradas } from '../../auth/alcance';
import { invalidarCacheDispositivos } from '../../auth/autenticacion';
import { generarTokenDispositivo, sha256 } from '../../auth/tokens';
import { desconectarDispositivo, dispositivosEnLinea } from '../../realtime/socket';

/**
 * Pantallas de pedidos (TV) y kioscos de autoservicio.
 *
 * Control por cupos: el gerente de país (o el admin global) fija cuántos equipos de cada tipo
 * puede tener ACTIVOS cada sede. Dentro de ese cupo, el gerente de la sede registra los equipos,
 * los desactiva o les cambia el token. Un equipo desactivado libera su cupo y su token deja de
 * funcionar de inmediato (se le corta la conexión en tiempo real).
 */
export const moduloDispositivos = crearModulo('Pantallas y kioscos');
const { ruta } = moduloDispositivos;

const GERENCIA = ['ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE'] as const;
const NOMBRE_TIPO: Record<TipoDispositivo, string> = {
  KIOSCO: 'kioscos de autoservicio',
  PANTALLA: 'pantallas de pedidos',
};

const cupoAgotado = (tipo: TipoDispositivo, cupo: number) =>
  new HttpError(
    422,
    'CUPO_AGOTADO',
    cupo === 0
      ? `Esta sede no tiene cupo para ${NOMBRE_TIPO[tipo]}. Pídelo a tu gerente de país.`
      : `La sede ya usa sus ${cupo} cupos de ${NOMBRE_TIPO[tipo]}. Desactiva uno o pide más cupo a tu gerente de país.`,
    { tipo, cupo },
  );

/**
 * Bloquea la sede para cambios de dispositivos dentro de la transacción y verifica que quede
 * un cupo libre del tipo pedido. El bloqueo evita que dos altas simultáneas superen el cupo.
 */
async function reservarCupo(tx: Prisma.TransactionClient, sedeId: number, tipo: TipoDispositivo) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(3, ${sedeId})`;
  const sede = await tx.sede.findUniqueOrThrow({
    where: { id: sedeId },
    select: { cupoKioscos: true, cupoPantallas: true },
  });
  const cupo = tipo === 'KIOSCO' ? sede.cupoKioscos : sede.cupoPantallas;
  const activos = await tx.dispositivo.count({ where: { sedeId, tipo, activo: true } });
  if (activos >= cupo) throw cupoAgotado(tipo, cupo);
}

/** Conteo de cupos por sede: { KIOSCO: { activos, cupo }, PANTALLA: { … } } */
async function cuposDe(sedeIds: number[]) {
  const [sedes, conteo] = await Promise.all([
    prisma.sede.findMany({
      where: { id: { in: sedeIds } },
      select: { id: true, cupoKioscos: true, cupoPantallas: true },
    }),
    prisma.dispositivo.groupBy({
      by: ['sedeId', 'tipo'],
      where: { sedeId: { in: sedeIds }, activo: true },
      _count: { _all: true },
    }),
  ]);
  const activos = (sedeId: number, tipo: TipoDispositivo) =>
    conteo.find((c) => c.sedeId === sedeId && c.tipo === tipo)?._count._all ?? 0;
  return new Map(
    sedes.map((s) => [
      s.id,
      {
        KIOSCO: { activos: activos(s.id, 'KIOSCO'), cupo: s.cupoKioscos },
        PANTALLA: { activos: activos(s.id, 'PANTALLA'), cupo: s.cupoPantallas },
      },
    ]),
  );
}

const camposDispositivo = {
  id: true,
  sedeId: true,
  nombre: true,
  tipo: true,
  activo: true,
  creadoEn: true,
  ultimaConexionEn: true,
} as const;

const conPresencia = <T extends { id: string }>(d: T) => ({
  ...d,
  enLinea: dispositivosEnLinea().has(d.id),
});

async function dispositivoEnAlcance(auth: Parameters<typeof asegurarSede>[0], id: string) {
  const d = await prisma.dispositivo.findUnique({ where: { id } });
  if (!d) throw HttpError.notFound('Dispositivo');
  await asegurarSede(auth, d.sedeId);
  return d;
}

// ───────────────────────────── Cupos ─────────────────────────────

ruta(
  {
    metodo: 'get',
    ruta: '/dispositivos/cupos',
    resumen: 'Cupos y uso de pantallas y kioscos por sede',
    descripcion:
      'Una fila por sede del alcance: cupo asignado, equipos activos y cuántos están conectados ahora.',
    auth: 'personal',
    roles: GERENCIA,
    query: z.object({ paisId: idEntero.optional(), ciudadId: idEntero.optional() }),
  },
  async ({ auth, query }) => {
    const sedes = await sedesFiltradas(auth, query);
    const ids = sedes.map((s) => s.id);
    const [cupos, info, equipos] = await Promise.all([
      cuposDe(ids),
      prisma.sede.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          codigo: true,
          nombre: true,
          activa: true,
          ciudad: {
            select: { id: true, nombre: true, pais: { select: { id: true, nombre: true } } },
          },
        },
        orderBy: { codigo: 'asc' },
      }),
      prisma.dispositivo.findMany({
        where: { sedeId: { in: ids }, activo: true },
        select: { id: true, sedeId: true },
      }),
    ]);
    const enLinea = dispositivosEnLinea();
    return info.map((s) => ({
      ...s,
      cupos: cupos.get(s.id)!,
      enLinea: equipos.filter((e) => e.sedeId === s.id && enLinea.has(e.id)).length,
    }));
  },
);

ruta(
  {
    metodo: 'put',
    ruta: '/sedes/:sedeId/cupos',
    resumen: 'Asignar cupos de kioscos y pantallas a una sede',
    descripcion:
      'Solo el gerente de país (para sus sedes) o el admin global. No se puede bajar el cupo por debajo de los equipos activos: primero hay que desactivar alguno.',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL', 'GERENTE_PAIS'],
    params: paramsSede,
    body: z
      .object({
        cupoKioscos: z.number().int().min(0).max(50).optional(),
        cupoPantallas: z.number().int().min(0).max(50).optional(),
      })
      .refine((b) => b.cupoKioscos !== undefined || b.cupoPantallas !== undefined, {
        message: 'Indica cupoKioscos o cupoPantallas',
      }),
  },
  async ({ auth, params, body }) => {
    const sede = await asegurarSede(auth, params.sedeId);
    await asegurarPais(auth, sede.paisId);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(3, ${sede.id})`;
      for (const [tipo, nuevo] of [
        ['KIOSCO', body.cupoKioscos],
        ['PANTALLA', body.cupoPantallas],
      ] as const) {
        if (nuevo === undefined) continue;
        const activos = await tx.dispositivo.count({
          where: { sedeId: sede.id, tipo, activo: true },
        });
        if (activos > nuevo)
          throw new HttpError(
            422,
            'CUPO_EN_USO',
            `La sede tiene ${activos} ${NOMBRE_TIPO[tipo]} activos; desactiva ${activos - nuevo} antes de bajar el cupo a ${nuevo}.`,
            { tipo, activos },
          );
      }
      await tx.sede.update({ where: { id: sede.id }, data: body });
    });
    return (await cuposDe([sede.id])).get(sede.id)!;
  },
);

// ───────────────────────────── Equipos de una sede ─────────────────────────────

ruta(
  {
    metodo: 'get',
    ruta: '/sedes/:sedeId/dispositivos',
    resumen: 'Pantallas y kioscos de una sede, con su cupo',
    auth: 'personal',
    roles: GERENCIA,
    params: paramsSede,
  },
  async ({ auth, params }) => {
    await asegurarSede(auth, params.sedeId);
    const [cupos, dispositivos] = await Promise.all([
      cuposDe([params.sedeId]),
      prisma.dispositivo.findMany({
        where: { sedeId: params.sedeId },
        select: camposDispositivo,
        orderBy: [{ tipo: 'asc' }, { creadoEn: 'asc' }],
      }),
    ]);
    return { cupos: cupos.get(params.sedeId)!, dispositivos: dispositivos.map(conPresencia) };
  },
);

ruta(
  {
    metodo: 'post',
    ruta: '/sedes/:sedeId/dispositivos',
    resumen: 'Registrar una pantalla o un kiosco (consume un cupo)',
    descripcion:
      'Devuelve el token UNA sola vez; en la base de datos solo queda su hash. Responde 422 CUPO_AGOTADO si la sede ya usa todos sus cupos de ese tipo.',
    auth: 'personal',
    roles: GERENCIA,
    params: paramsSede,
    status: 201,
    body: z.object({
      nombre: z.string().trim().min(2).max(80),
      tipo: z.enum(['PANTALLA', 'KIOSCO']),
    }),
  },
  async ({ auth, params, body }) => {
    await asegurarSede(auth, params.sedeId);
    const token = generarTokenDispositivo();
    const d = await prisma.$transaction(async (tx) => {
      await reservarCupo(tx, params.sedeId, body.tipo);
      return tx.dispositivo.create({
        data: { ...body, sedeId: params.sedeId, tokenHash: sha256(token) },
        select: camposDispositivo,
      });
    });
    return { ...conPresencia(d), token };
  },
);

ruta(
  {
    metodo: 'patch',
    ruta: '/dispositivos/:id',
    resumen: 'Renombrar, activar o desactivar un equipo',
    descripcion:
      'Desactivar libera el cupo y desconecta el equipo al instante. Reactivar exige un cupo libre.',
    auth: 'personal',
    roles: GERENCIA,
    params: z.object({ id: uuid }),
    body: z.object({
      activo: z.boolean().optional(),
      nombre: z.string().trim().min(2).max(80).optional(),
    }),
  },
  async ({ auth, params, body }) => {
    const d = await dispositivoEnAlcance(auth, params.id);
    const actualizado = await prisma.$transaction(async (tx) => {
      if (body.activo === true && !d.activo) await reservarCupo(tx, d.sedeId, d.tipo);
      return tx.dispositivo.update({
        where: { id: d.id },
        data: body,
        select: camposDispositivo,
      });
    });
    invalidarCacheDispositivos();
    if (body.activo === false) desconectarDispositivo(d.id);
    return conPresencia(actualizado);
  },
);

ruta(
  {
    metodo: 'post',
    ruta: '/dispositivos/:id/token',
    resumen: 'Generar un token nuevo (reemplazar o volver a vincular el equipo)',
    descripcion: 'El token anterior deja de funcionar. El nuevo se muestra una sola vez.',
    auth: 'personal',
    roles: GERENCIA,
    params: z.object({ id: uuid }),
  },
  async ({ auth, params }) => {
    const d = await dispositivoEnAlcance(auth, params.id);
    const token = generarTokenDispositivo();
    const actualizado = await prisma.dispositivo.update({
      where: { id: d.id },
      data: { tokenHash: sha256(token) },
      select: camposDispositivo,
    });
    invalidarCacheDispositivos();
    desconectarDispositivo(d.id);
    return { ...conPresencia(actualizado), token };
  },
);

ruta(
  {
    metodo: 'delete',
    ruta: '/dispositivos/:id',
    resumen: 'Eliminar un equipo (libera su cupo)',
    auth: 'personal',
    roles: GERENCIA,
    params: z.object({ id: uuid }),
  },
  async ({ auth, params }) => {
    const d = await dispositivoEnAlcance(auth, params.id);
    await prisma.dispositivo.delete({ where: { id: d.id } });
    invalidarCacheDispositivos();
    desconectarDispositivo(d.id);
  },
);

ruta(
  {
    metodo: 'get',
    ruta: '/dispositivos/yo',
    resumen: 'Datos del dispositivo autenticado (para que la pantalla o el kiosco sepan su sede)',
    auth: 'dispositivo',
  },
  async ({ auth }) =>
    prisma.dispositivo.findUniqueOrThrow({
      where: { id: auth.id },
      select: {
        id: true,
        nombre: true,
        tipo: true,
        sede: { select: { id: true, codigo: true, nombre: true, zonaHoraria: true } },
      },
    }),
);
