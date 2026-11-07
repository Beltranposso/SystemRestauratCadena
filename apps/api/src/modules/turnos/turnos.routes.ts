import { z } from 'zod';
import type { Prisma, PuestoTurno, RolUsuario } from '@prisma/client';
import { prisma, type Tx } from '../../db/prisma';
import { crearModulo } from '../../http/ruta';
import { fecha, hora, idEntero, paramsUuid } from '../../http/esquemas';
import { HttpError } from '../../utils/http-error';
import { fechaOperacion, localAUtc, sumarDias } from '../../utils/fechas';
import { asegurarSede, esGerente, obtenerSede, type SedeInfo } from '../../auth/alcance';
import type { AuthPersonal } from '../../auth/tipos';

export const moduloTurnos = crearModulo('Turnos del personal');
const { ruta } = moduloTurnos;

const GERENTES = ['ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE'] as const;
const PUESTO_POR_ROL: Partial<Record<RolUsuario, PuestoTurno>> = {
  GERENTE_SEDE: 'GERENCIA',
  CAJERO: 'CAJA',
  COCINA: 'COCINA',
};
const MARGEN_ENTRADA_MIN = 30;

const incluir = { usuario: { select: { id: true, nombre: true, rol: true } } } as const;

const aHoraLocal = (d: Date, zona: string) =>
  new Intl.DateTimeFormat('es-CO', {
    timeZone: zona,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);

/** Agrega la fecha y horas locales de la sede a cada turno (lo que pinta la grilla semanal). */
const conHoraLocal = <T extends { inicio: Date; fin: Date }>(t: T, sede: SedeInfo) => ({
  ...t,
  fecha: fechaOperacion(t.inicio, sede.zonaHoraria),
  horaInicio: aHoraLocal(t.inicio, sede.zonaHoraria),
  horaFin: aHoraLocal(t.fin, sede.zonaHoraria),
  horas: Math.round(((t.fin.getTime() - t.inicio.getTime()) / 3_600_000) * 100) / 100,
});

/** fecha + horas locales → rango UTC. Si la hora de fin es menor o igual, el turno termina al día siguiente. */
function rangoUtc(sede: SedeInfo, f: string, hi: string, hf: string) {
  const [h1, m1] = hi.split(':').map(Number) as [number, number];
  const [h2, m2] = hf.split(':').map(Number) as [number, number];
  const inicio = localAUtc(f, h1, m1, sede.zonaHoraria);
  const fin = localAUtc(hf <= hi ? sumarDias(f, 1) : f, h2, m2, sede.zonaHoraria);
  const horas = (fin.getTime() - inicio.getTime()) / 3_600_000;
  if (horas < 1 || horas > 16)
    throw HttpError.unprocessable('Un turno debe durar entre 1 y 16 horas');
  return { inicio, fin };
}

/** Rechaza turnos que se crucen para la misma persona. El advisory lock serializa altas simultáneas. */
async function verificarSolape(
  tx: Tx,
  usuarioId: string,
  inicio: Date,
  fin: Date,
  excluirId?: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(2, hashtext(${usuarioId}))`;
  const cruce = await tx.turno.findFirst({
    where: {
      usuarioId,
      estado: { not: 'AUSENTE' },
      inicio: { lt: fin },
      fin: { gt: inicio },
      ...(excluirId ? { id: { not: excluirId } } : {}),
    },
    select: { id: true, inicio: true, fin: true, sedeId: true },
  });
  if (cruce)
    throw HttpError.conflict('La persona ya tiene un turno que se cruza con ese horario', {
      turno: cruce,
    });
}

async function cargarTurno(auth: AuthPersonal, id: string) {
  const turno = await prisma.turno.findUnique({ where: { id } });
  if (!turno) throw HttpError.notFound('Turno');
  const sede = await asegurarSede(auth, turno.sedeId);
  return { turno, sede };
}

ruta(
  {
    metodo: 'get',
    ruta: '/turnos',
    resumen: 'Turnos de una sede en un rango (por defecto la semana actual)',
    descripcion: 'Cajeros y cocina solo ven sus propios turnos. Incluye horas totales por persona.',
    auth: 'personal',
    query: z.object({
      sedeId: idEntero.optional(),
      desde: fecha.optional().describe('Fecha local; por defecto el lunes de esta semana'),
      hasta: fecha.optional().describe('Fecha local incluida; por defecto desde + 6 días'),
      usuarioId: z.string().uuid().optional(),
    }),
  },
  async ({ auth, query }) => {
    const sedeId = query.sedeId ?? auth.sedeId;
    if (!sedeId) throw HttpError.badRequest('Indica sedeId');
    const sede = await asegurarSede(auth, sedeId);

    const hoy = fechaOperacion(new Date(), sede.zonaHoraria);
    const lunes = sumarDias(hoy, -((new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7));
    const desde = query.desde ?? lunes;
    const hasta = query.hasta ?? sumarDias(desde, 6);
    if (hasta < desde) throw HttpError.badRequest('hasta debe ser igual o posterior a desde');

    const usuarioId = esGerente(auth.rol) ? query.usuarioId : auth.id;
    const turnos = await prisma.turno.findMany({
      where: {
        sedeId,
        ...(usuarioId ? { usuarioId } : {}),
        inicio: {
          gte: localAUtc(desde, 0, 0, sede.zonaHoraria),
          lt: localAUtc(sumarDias(hasta, 1), 0, 0, sede.zonaHoraria),
        },
      },
      include: incluir,
      orderBy: [{ inicio: 'asc' }],
    });

    const datos = turnos.map((t) => conHoraLocal(t, sede));
    const resumen = new Map<
      string,
      { usuarioId: string; nombre: string; horas: number; turnos: number }
    >();
    for (const t of datos) {
      const r = resumen.get(t.usuarioId) ?? {
        usuarioId: t.usuarioId,
        nombre: t.usuario.nombre,
        horas: 0,
        turnos: 0,
      };
      if (t.estado !== 'AUSENTE') r.horas += t.horas;
      r.turnos += 1;
      resumen.set(t.usuarioId, r);
    }
    return { desde, hasta, zonaHoraria: sede.zonaHoraria, datos, resumen: [...resumen.values()] };
  },
);

const cuerpoTurno = z.object({
  sedeId: idEntero,
  usuarioId: z.string().uuid(),
  puesto: z
    .enum(['CAJA', 'COCINA', 'SERVICIO', 'GERENCIA'])
    .optional()
    .describe('Por defecto según el rol'),
  fecha: fecha.describe('Día local en que empieza el turno'),
  horaInicio: hora,
  horaFin: hora.describe('Si es menor o igual que horaInicio, termina al día siguiente'),
  notas: z.string().trim().max(200).optional(),
});

ruta(
  {
    metodo: 'post',
    ruta: '/turnos',
    resumen: 'Programar turno',
    descripcion: '409 si la persona ya tiene un turno que se cruza.',
    auth: 'personal',
    roles: GERENTES,
    status: 201,
    body: cuerpoTurno,
  },
  async ({ auth, body }) => {
    const sede = await asegurarSede(auth, body.sedeId);
    const empleado = await prisma.usuario.findFirst({
      where: { id: body.usuarioId, sedeId: body.sedeId, activo: true },
    });
    if (!empleado) throw HttpError.unprocessable('La persona no está activa en esta sede');
    const puesto = body.puesto ?? PUESTO_POR_ROL[empleado.rol];
    if (!puesto) throw HttpError.badRequest('Indica el puesto');
    const { inicio, fin } = rangoUtc(sede, body.fecha, body.horaInicio, body.horaFin);

    const turno = await prisma.$transaction(async (tx) => {
      await verificarSolape(tx, body.usuarioId, inicio, fin);
      return tx.turno.create({
        data: {
          sedeId: body.sedeId,
          usuarioId: body.usuarioId,
          puesto,
          inicio,
          fin,
          notas: body.notas,
        },
        include: incluir,
      });
    });
    return conHoraLocal(turno, sede);
  },
);

ruta(
  {
    metodo: 'patch',
    ruta: '/turnos/:id',
    resumen: 'Editar turno o marcar ausencia',
    descripcion: 'Un turno completado solo admite cambios en las notas.',
    auth: 'personal',
    roles: GERENTES,
    params: paramsUuid,
    body: z.object({
      puesto: z.enum(['CAJA', 'COCINA', 'SERVICIO', 'GERENCIA']).optional(),
      fecha: fecha.optional(),
      horaInicio: hora.optional(),
      horaFin: hora.optional(),
      estado: z.enum(['PROGRAMADO', 'AUSENTE']).optional(),
      notas: z.string().trim().max(200).nullable().optional(),
    }),
  },
  async ({ auth, params, body }) => {
    const { turno, sede } = await cargarTurno(auth, params.id);
    const cambiaHorario = body.fecha || body.horaInicio || body.horaFin;
    if (turno.estado === 'COMPLETADO' && (cambiaHorario || body.estado || body.puesto)) {
      throw HttpError.unprocessable('El turno ya se completó; solo puedes editar las notas');
    }
    if (body.estado === 'AUSENTE' && turno.estado === 'EN_CURSO') {
      throw HttpError.unprocessable('La persona ya marcó entrada en este turno');
    }

    const data: Prisma.TurnoUncheckedUpdateInput = {};
    if (body.puesto) data.puesto = body.puesto;
    if (body.notas !== undefined) data.notas = body.notas;
    if (body.estado) data.estado = body.estado;

    const actualizado = await prisma.$transaction(async (tx) => {
      if (cambiaHorario) {
        const f = body.fecha ?? fechaOperacion(turno.inicio, sede.zonaHoraria);
        const hi = body.horaInicio ?? aHoraLocal(turno.inicio, sede.zonaHoraria);
        const hf = body.horaFin ?? aHoraLocal(turno.fin, sede.zonaHoraria);
        const { inicio, fin } = rangoUtc(sede, f, hi, hf);
        await verificarSolape(tx, turno.usuarioId, inicio, fin, turno.id);
        Object.assign(data, { inicio, fin });
      } else if (body.estado === 'PROGRAMADO') {
        await verificarSolape(tx, turno.usuarioId, turno.inicio, turno.fin, turno.id);
      }
      return tx.turno.update({ where: { id: turno.id }, data, include: incluir });
    });
    return conHoraLocal(actualizado, sede);
  },
);

ruta(
  {
    metodo: 'delete',
    ruta: '/turnos/:id',
    resumen: 'Eliminar turno programado',
    descripcion: 'Solo turnos que aún no empiezan. Para los demás, márcalos como ausencia.',
    auth: 'personal',
    roles: GERENTES,
    params: paramsUuid,
  },
  async ({ auth, params }) => {
    const { turno } = await cargarTurno(auth, params.id);
    if (turno.estado !== 'PROGRAMADO' || turno.inicio <= new Date()) {
      throw HttpError.unprocessable('Solo se eliminan turnos programados que no han empezado');
    }
    await prisma.turno.delete({ where: { id: turno.id } });
  },
);

async function marcar(auth: AuthPersonal, id: string, tipo: 'entrada' | 'salida') {
  const { turno, sede } = await cargarTurno(auth, id);
  if (turno.usuarioId !== auth.id && !esGerente(auth.rol)) {
    throw HttpError.forbidden('Solo puedes marcar tus propios turnos');
  }
  const ahora = new Date();

  if (tipo === 'entrada') {
    if (turno.estado !== 'PROGRAMADO')
      throw HttpError.unprocessable(`No se puede marcar entrada en un turno ${turno.estado}`);
    if (
      ahora.getTime() < turno.inicio.getTime() - MARGEN_ENTRADA_MIN * 60_000 ||
      ahora >= turno.fin
    ) {
      throw HttpError.unprocessable(
        `La entrada se marca desde ${MARGEN_ENTRADA_MIN} min antes del inicio hasta el fin del turno`,
      );
    }
  } else if (turno.estado !== 'EN_CURSO') {
    throw HttpError.unprocessable('Primero hay que marcar la entrada');
  }

  const r = await prisma.turno.updateMany({
    where: { id, estado: turno.estado },
    data:
      tipo === 'entrada'
        ? { estado: 'EN_CURSO', entradaReal: ahora }
        : { estado: 'COMPLETADO', salidaReal: ahora },
  });
  if (r.count === 0) throw HttpError.conflict('El turno cambió mientras tanto');
  const actualizado = await prisma.turno.findUniqueOrThrow({ where: { id }, include: incluir });
  return conHoraLocal(actualizado, await obtenerSede(sede.id));
}

ruta(
  {
    metodo: 'post',
    ruta: '/turnos/:id/entrada',
    resumen: 'Marcar entrada',
    descripcion: `Se permite desde ${MARGEN_ENTRADA_MIN} min antes del inicio. La persona marca la suya; un gerente puede marcar por ella.`,
    auth: 'personal',
    params: paramsUuid,
  },
  async ({ auth, params }) => marcar(auth, params.id, 'entrada'),
);

ruta(
  {
    metodo: 'post',
    ruta: '/turnos/:id/salida',
    resumen: 'Marcar salida',
    auth: 'personal',
    params: paramsUuid,
  },
  async ({ auth, params }) => marcar(auth, params.id, 'salida'),
);
