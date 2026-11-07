import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { crearModulo } from '../../http/ruta';
import { fecha, idEntero } from '../../http/esquemas';
import { HttpError } from '../../utils/http-error';
import { fechaOperacion, sumarDias } from '../../utils/fechas';
import { sedesFiltradas, type SedeInfo } from '../../auth/alcance';
import type { AuthPersonal } from '../../auth/tipos';
import { minutos } from '../salon/salon.service';

export const moduloReportes = crearModulo('Reportes');
const { ruta } = moduloReportes;

const ROLES = ['ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE'] as const;

const filtros = z.object({
  desde: fecha.optional().describe('Día local incluido; por defecto hace 29 días'),
  hasta: fecha.optional().describe('Día local incluido; por defecto hoy'),
  paisId: idEntero.optional(),
  ciudadId: idEntero.optional(),
  sedeId: idEntero.optional(),
});
type Filtros = z.infer<typeof filtros>;

const r2 = (v: number | null | undefined) =>
  v === null || v === undefined ? null : Math.round(v * 100) / 100;
const variacion = (actual: number | null, anterior: number | null) =>
  actual === null || anterior === null || anterior === 0
    ? null
    : r2(((actual - anterior) / anterior) * 100);

const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) +
  1;

/** Resuelve sedes (según alcance y filtros) y el rango de fechas del reporte. */
async function contexto(auth: AuthPersonal, f: Filtros) {
  const sedes = await sedesFiltradas(auth, f);
  const zona = sedes[0]?.zonaHoraria ?? 'UTC';
  const hasta = f.hasta ?? fechaOperacion(new Date(), zona);
  const desde = f.desde ?? sumarDias(hasta, -29);
  if (hasta < desde) throw HttpError.badRequest('hasta debe ser igual o posterior a desde');
  const dias = diasEntre(desde, hasta);
  if (dias > 400) throw HttpError.badRequest('El rango máximo es de 400 días');
  return { sedes, ids: sedes.map((s) => s.id), desde, hasta, dias };
}

const sinDatos = (ids: number[]) => ids.length === 0;

// ───────────────────────────── KPIs ─────────────────────────────

async function kpisPeriodo(ids: number[], desde: string, hasta: string) {
  const [fila] = await prisma.$queryRaw<
    { pedidos: number; ventas_usd: number; cancelados: number; prep_min: number | null }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE estado <> 'CANCELADO')::int AS pedidos,
      COALESCE(SUM(total_usd) FILTER (WHERE estado <> 'CANCELADO'), 0)::float AS ventas_usd,
      COUNT(*) FILTER (WHERE estado = 'CANCELADO')::int AS cancelados,
      (AVG(EXTRACT(EPOCH FROM (listo_en - creado_en)) / 60) FILTER (WHERE listo_en IS NOT NULL))::float AS prep_min
    FROM pedidos
    WHERE sede_id = ANY(${ids}::int[]) AND fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date`;

  const [calif] = await prisma.$queryRaw<{ promedio: number | null; total: number }[]>`
    SELECT AVG(c.puntaje)::float AS promedio, COUNT(*)::int AS total
    FROM calificaciones c JOIN sedes s ON s.id = c.sede_id
    WHERE c.sede_id = ANY(${ids}::int[])
      AND (c.creado_en AT TIME ZONE s.zona_horaria)::date BETWEEN ${desde}::date AND ${hasta}::date`;

  const pedidos = fila?.pedidos ?? 0;
  const ventasUsd = fila?.ventas_usd ?? 0;
  const totalConCancelados = pedidos + (fila?.cancelados ?? 0);
  return {
    ventasUsd: r2(ventasUsd)!,
    pedidos,
    ticketPromedioUsd: pedidos ? r2(ventasUsd / pedidos) : null,
    tiempoPreparacionMin: r2(fila?.prep_min ?? null),
    tasaCancelacionPct: totalConCancelados
      ? r2(((fila?.cancelados ?? 0) / totalConCancelados) * 100)
      : null,
    calificacionPromedio: r2(calif?.promedio ?? null),
    calificaciones: calif?.total ?? 0,
  };
}

ruta(
  {
    metodo: 'get',
    ruta: '/reportes/kpis',
    resumen: 'Indicadores del periodo con variación frente al periodo anterior',
    descripcion:
      'Ventas en USD (convertidas con la tasa del día de cada venta), pedidos, ticket promedio, tiempo de cocina ' +
      '(de creado a listo), cancelaciones y calificación. `variacionPct` compara con un periodo de igual duración justo antes.',
    auth: 'personal',
    roles: ROLES,
    query: filtros,
  },
  async ({ auth, query }) => {
    const { ids, desde, hasta, dias, sedes } = await contexto(auth, query);
    const anteriorHasta = sumarDias(desde, -1);
    const anteriorDesde = sumarDias(anteriorHasta, -(dias - 1));
    const [actual, anterior] = sinDatos(ids)
      ? [
          await kpisPeriodo([-1], desde, hasta),
          await kpisPeriodo([-1], anteriorDesde, anteriorHasta),
        ]
      : await Promise.all([
          kpisPeriodo(ids, desde, hasta),
          kpisPeriodo(ids, anteriorDesde, anteriorHasta),
        ]);
    return {
      periodo: { desde, hasta, dias },
      periodoAnterior: { desde: anteriorDesde, hasta: anteriorHasta },
      sedes: sedes.length,
      ...actual,
      anterior,
      variacionPct: {
        ventasUsd: variacion(actual.ventasUsd, anterior.ventasUsd),
        pedidos: variacion(actual.pedidos, anterior.pedidos),
        ticketPromedioUsd: variacion(actual.ticketPromedioUsd, anterior.ticketPromedioUsd),
        tiempoPreparacionMin: variacion(actual.tiempoPreparacionMin, anterior.tiempoPreparacionMin),
      },
    };
  },
);

// ───────────────────────────── Ventas agrupadas ─────────────────────────────

const AGRUPACIONES = [
  'dia',
  'semana',
  'mes',
  'hora',
  'pais',
  'ciudad',
  'sede',
  'canal',
  'metodoPago',
  'producto',
] as const;
type Agrupacion = (typeof AGRUPACIONES)[number];

/** Columnas por agrupación. Lista cerrada: nunca se interpola texto del usuario en el SQL. */
const CLAVES: Record<
  Exclude<Agrupacion, 'producto'>,
  { select: Prisma.Sql; group: Prisma.Sql; order: Prisma.Sql }
> = {
  dia: {
    select: Prisma.sql`to_char(p.fecha_operacion, 'YYYY-MM-DD') AS clave, NULL AS etiqueta`,
    group: Prisma.sql`p.fecha_operacion`,
    order: Prisma.sql`p.fecha_operacion`,
  },
  semana: {
    select: Prisma.sql`to_char(date_trunc('week', p.fecha_operacion), 'YYYY-MM-DD') AS clave, 'Semana del ' || to_char(date_trunc('week', p.fecha_operacion), 'DD/MM') AS etiqueta`,
    group: Prisma.sql`date_trunc('week', p.fecha_operacion)`,
    order: Prisma.sql`date_trunc('week', p.fecha_operacion)`,
  },
  mes: {
    select: Prisma.sql`to_char(date_trunc('month', p.fecha_operacion), 'YYYY-MM') AS clave, NULL AS etiqueta`,
    group: Prisma.sql`date_trunc('month', p.fecha_operacion)`,
    order: Prisma.sql`date_trunc('month', p.fecha_operacion)`,
  },
  hora: {
    select: Prisma.sql`lpad(EXTRACT(HOUR FROM p.creado_en AT TIME ZONE s.zona_horaria)::int::text, 2, '0') || ':00' AS clave, NULL AS etiqueta`,
    group: Prisma.sql`EXTRACT(HOUR FROM p.creado_en AT TIME ZONE s.zona_horaria)`,
    order: Prisma.sql`EXTRACT(HOUR FROM p.creado_en AT TIME ZONE s.zona_horaria)`,
  },
  pais: {
    select: Prisma.sql`pa.codigo_iso AS clave, pa.nombre AS etiqueta`,
    group: Prisma.sql`pa.codigo_iso, pa.nombre`,
    order: Prisma.sql`ventas_usd DESC`,
  },
  ciudad: {
    select: Prisma.sql`c.id::text AS clave, c.nombre AS etiqueta`,
    group: Prisma.sql`c.id, c.nombre`,
    order: Prisma.sql`ventas_usd DESC`,
  },
  sede: {
    select: Prisma.sql`s.codigo AS clave, s.nombre AS etiqueta, MAX(p.moneda) AS moneda, SUM(p.total) FILTER (WHERE p.estado <> 'CANCELADO')::float AS ventas_local`,
    group: Prisma.sql`s.codigo, s.nombre`,
    order: Prisma.sql`ventas_usd DESC`,
  },
  canal: {
    select: Prisma.sql`p.canal::text AS clave, NULL AS etiqueta`,
    group: Prisma.sql`p.canal`,
    order: Prisma.sql`ventas_usd DESC`,
  },
  metodoPago: {
    select: Prisma.sql`p.metodo_pago::text AS clave, NULL AS etiqueta`,
    group: Prisma.sql`p.metodo_pago`,
    order: Prisma.sql`ventas_usd DESC`,
  },
};

ruta(
  {
    metodo: 'get',
    ruta: '/reportes/ventas',
    resumen:
      'Ventas agrupadas (día, semana, mes, hora, país, ciudad, sede, canal, método de pago o producto)',
    descripcion:
      'Montos en USD. Agrupando por sede también se incluye el total en moneda local. ' +
      'Por producto, `ventasUsd` es sin impuesto y `limite` acota el ranking.',
    auth: 'personal',
    roles: ROLES,
    query: filtros.extend({
      agrupar: z.enum(AGRUPACIONES).default('dia'),
      limite: z.coerce.number().int().min(1).max(200).default(20),
    }),
  },
  async ({ auth, query }) => {
    const { ids, desde, hasta } = await contexto(auth, query);
    const sedesSql = sinDatos(ids) ? [-1] : ids;
    const base = Prisma.sql`
      FROM pedidos p
      JOIN sedes s ON s.id = p.sede_id
      JOIN ciudades c ON c.id = s.ciudad_id
      JOIN paises pa ON pa.id = c.pais_id
      WHERE p.sede_id = ANY(${sedesSql}::int[]) AND p.fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date`;

    if (query.agrupar === 'producto') {
      const conItems = await prisma.$queryRaw<
        {
          clave: string;
          etiqueta: string;
          sku: string;
          unidades: number;
          ventas_usd: number;
          pedidos: number;
        }[]
      >`
        SELECT i.producto_id::text AS clave, pr.nombre AS etiqueta, pr.sku,
               SUM(i.cantidad)::int AS unidades,
               SUM(i.subtotal * p.total_usd / NULLIF(p.total, 0))::float AS ventas_usd,
               COUNT(DISTINCT p.id)::int AS pedidos
        FROM pedido_items i
        JOIN pedidos p ON p.id = i.pedido_id
        JOIN productos pr ON pr.id = i.producto_id
        WHERE p.sede_id = ANY(${sedesSql}::int[]) AND p.fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date
          AND p.estado <> 'CANCELADO'
        GROUP BY i.producto_id, pr.nombre, pr.sku
        ORDER BY ventas_usd DESC NULLS LAST
        LIMIT ${query.limite}`;
      return {
        agrupar: 'producto',
        periodo: { desde, hasta },
        datos: conItems.map((f) => ({ ...f, ventasUsd: r2(f.ventas_usd), ventas_usd: undefined })),
      };
    }

    const k = CLAVES[query.agrupar];
    const filas = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT ${k.select},
             COUNT(*) FILTER (WHERE p.estado <> 'CANCELADO')::int AS pedidos,
             COALESCE(SUM(p.total_usd) FILTER (WHERE p.estado <> 'CANCELADO'), 0)::float AS ventas_usd,
             COUNT(*) FILTER (WHERE p.estado = 'CANCELADO')::int AS cancelados
      ${base}
      GROUP BY ${k.group}
      ORDER BY ${k.order}
      LIMIT ${query.limite > 20 || ['dia', 'hora', 'semana', 'mes'].includes(query.agrupar) ? 400 : query.limite}`;

    return {
      agrupar: query.agrupar,
      periodo: { desde, hasta },
      datos: filas.map(({ ventas_usd, ventas_local, ...f }) => ({
        ...f,
        ventasUsd: r2(ventas_usd as number),
        ...(ventas_local !== undefined ? { ventasLocal: r2(ventas_local as number) } : {}),
        ticketPromedioUsd: (f.pedidos as number)
          ? r2((ventas_usd as number) / (f.pedidos as number))
          : null,
      })),
    };
  },
);

// ───────────────────────────── Ocupación del salón ─────────────────────────────

const minutosOperacion = (s: SedeInfo) => minutos(s.horaCierre) - minutos(s.horaApertura);

ruta(
  {
    metodo: 'get',
    ruta: '/reportes/ocupacion',
    resumen: 'Ocupación de mesas, rotación, tiempo de espera, cancelaciones y no-shows',
    descripcion:
      'Ocupación = minutos con mesa ocupada ÷ minutos disponibles (mesas activas × horario de la sede). ' +
      'Rotación = sesiones ÷ mesas ÷ días. Agrupa por día, hora local, mesa o sede.',
    auth: 'personal',
    roles: ROLES,
    query: filtros.extend({ agrupar: z.enum(['dia', 'hora', 'mesa', 'sede']).default('dia') }),
  },
  async ({ auth, query }) => {
    const { sedes, ids, desde, hasta, dias } = await contexto(auth, query);
    const sedesSql = sinDatos(ids) ? [-1] : ids;

    const mesasPorSede = await prisma.mesa.groupBy({
      by: ['sedeId'],
      where: { sedeId: { in: sedesSql }, activa: true },
      _count: true,
    });
    const mesas = new Map(mesasPorSede.map((m) => [m.sedeId, m._count]));
    const totalMesas = [...mesas.values()].reduce((a, b) => a + b, 0);
    const minutosDisponiblesDia = sedes.reduce(
      (acc, s) => acc + (mesas.get(s.id) ?? 0) * minutosOperacion(s),
      0,
    );

    const filtroSesiones = Prisma.sql`
      FROM sesiones_mesa sm
      JOIN mesas m ON m.id = sm.mesa_id
      JOIN sedes s ON s.id = m.sede_id
      WHERE m.sede_id = ANY(${sedesSql}::int[])
        AND (sm.inicio AT TIME ZONE s.zona_horaria)::date BETWEEN ${desde}::date AND ${hasta}::date`;
    const duracion = Prisma.sql`EXTRACT(EPOCH FROM (COALESCE(sm.fin, now()) - sm.inicio)) / 60`;

    const [resumen] = await prisma.$queryRaw<
      { minutos: number | null; sesiones: number; personas: number | null }[]
    >`
      SELECT SUM(${duracion})::float AS minutos, COUNT(*)::int AS sesiones, SUM(sm.personas)::int AS personas ${filtroSesiones}`;

    const [espera] = await prisma.$queryRaw<
      { espera_min: number | null; sentados: number; abandonos: number }[]
    >`
      SELECT (AVG(EXTRACT(EPOCH FROM (e.sentado_en - e.creado_en)) / 60) FILTER (WHERE e.estado = 'SENTADO'))::float AS espera_min,
             COUNT(*) FILTER (WHERE e.estado = 'SENTADO')::int AS sentados,
             COUNT(*) FILTER (WHERE e.estado = 'ABANDONO')::int AS abandonos
      FROM entradas_espera e
      WHERE e.sede_id = ANY(${sedesSql}::int[]) AND e.fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date`;

    const [reservas] = await prisma.$queryRaw<
      { total: number; canceladas: number; no_show: number; completadas: number }[]
    >`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE r.estado = 'CANCELADA')::int AS canceladas,
             COUNT(*) FILTER (WHERE r.estado = 'NO_SHOW')::int AS no_show,
             COUNT(*) FILTER (WHERE r.estado = 'COMPLETADA')::int AS completadas
      FROM reservas r JOIN sedes s ON s.id = r.sede_id
      WHERE r.sede_id = ANY(${sedesSql}::int[])
        AND (r.inicio AT TIME ZONE s.zona_horaria)::date BETWEEN ${desde}::date AND ${hasta}::date`;

    const pct = (min: number | null | undefined, disponible: number) =>
      disponible > 0 ? r2(((min ?? 0) / disponible) * 100) : null;

    let datos: Record<string, unknown>[];
    if (query.agrupar === 'dia') {
      const filas = await prisma.$queryRaw<{ clave: string; minutos: number; sesiones: number }[]>`
        SELECT to_char((sm.inicio AT TIME ZONE s.zona_horaria)::date, 'YYYY-MM-DD') AS clave,
               SUM(${duracion})::float AS minutos, COUNT(*)::int AS sesiones
        ${filtroSesiones}
        GROUP BY 1 ORDER BY 1`;
      datos = filas.map((f) => ({
        ...f,
        minutos: Math.round(f.minutos),
        ocupacionPct: pct(f.minutos, minutosDisponiblesDia),
      }));
    } else if (query.agrupar === 'hora') {
      // Reparte cada sesión entre las horas que abarca
      const filas = await prisma.$queryRaw<{ hora: number; minutos: number }[]>`
        SELECT EXTRACT(HOUR FROM h AT TIME ZONE s.zona_horaria)::int AS hora,
               SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(sm.fin, now()), h + interval '1 hour') - GREATEST(sm.inicio, h))) / 60)::float AS minutos
        FROM sesiones_mesa sm
        JOIN mesas m ON m.id = sm.mesa_id
        JOIN sedes s ON s.id = m.sede_id
        CROSS JOIN LATERAL generate_series(date_trunc('hour', sm.inicio), COALESCE(sm.fin, now()), interval '1 hour') AS h
        WHERE m.sede_id = ANY(${sedesSql}::int[])
          AND (sm.inicio AT TIME ZONE s.zona_horaria)::date BETWEEN ${desde}::date AND ${hasta}::date
        GROUP BY 1 ORDER BY 1`;
      datos = filas
        .filter((f) => f.minutos > 0)
        .map((f) => ({
          clave: `${String(f.hora).padStart(2, '0')}:00`,
          minutos: Math.round(f.minutos),
          ocupacionPct: pct(f.minutos, totalMesas * dias * 60),
        }));
    } else if (query.agrupar === 'mesa') {
      const filas = await prisma.$queryRaw<
        {
          mesa_id: number;
          sede_id: number;
          clave: string;
          zona: string;
          capacidad: number;
          minutos: number;
          sesiones: number;
        }[]
      >`
        SELECT m.id AS mesa_id, m.sede_id, s.codigo || ' · ' || m.codigo AS clave, m.zona, m.capacidad,
               SUM(${duracion})::float AS minutos, COUNT(*)::int AS sesiones
        ${filtroSesiones}
        GROUP BY m.id, m.sede_id, s.codigo, m.codigo, m.zona, m.capacidad
        ORDER BY minutos DESC`;
      const porId = new Map(sedes.map((s) => [s.id, s]));
      datos = filas.map(({ sede_id, ...f }) => ({
        ...f,
        minutos: Math.round(f.minutos),
        rotacion: r2(f.sesiones / dias),
        ocupacionPct: pct(f.minutos, dias * minutosOperacion(porId.get(sede_id)!)),
      }));
    } else {
      const filas = await prisma.$queryRaw<
        { sede_id: number; minutos: number; sesiones: number }[]
      >`
        SELECT m.sede_id, SUM(${duracion})::float AS minutos, COUNT(*)::int AS sesiones
        ${filtroSesiones}
        GROUP BY m.sede_id`;
      const porSede = new Map(filas.map((f) => [f.sede_id, f]));
      datos = sedes
        .map((s) => {
          const f = porSede.get(s.id);
          const n = mesas.get(s.id) ?? 0;
          return {
            clave: s.codigo,
            etiqueta: s.nombre,
            mesas: n,
            minutos: Math.round(f?.minutos ?? 0),
            sesiones: f?.sesiones ?? 0,
            rotacion: n ? r2((f?.sesiones ?? 0) / n / dias) : null,
            ocupacionPct: pct(f?.minutos, n * dias * minutosOperacion(s)),
          };
        })
        .sort((a, b) => (b.ocupacionPct ?? 0) - (a.ocupacionPct ?? 0));
    }

    const totalReservas = reservas?.total ?? 0;
    const cerradasEspera = (espera?.sentados ?? 0) + (espera?.abandonos ?? 0);
    return {
      agrupar: query.agrupar,
      periodo: { desde, hasta, dias },
      resumen: {
        mesas: totalMesas,
        ocupacionPct: pct(resumen?.minutos, minutosDisponiblesDia * dias),
        sesiones: resumen?.sesiones ?? 0,
        comensales: resumen?.personas ?? 0,
        rotacion: totalMesas ? r2((resumen?.sesiones ?? 0) / totalMesas / dias) : null,
        esperaPromedioMin: r2(espera?.espera_min ?? null),
        abandonoColaPct: cerradasEspera
          ? r2(((espera?.abandonos ?? 0) / cerradasEspera) * 100)
          : null,
        reservas: totalReservas,
        cancelacionPct: totalReservas
          ? r2(((reservas?.canceladas ?? 0) / totalReservas) * 100)
          : null,
        noShowPct: totalReservas ? r2(((reservas?.no_show ?? 0) / totalReservas) * 100) : null,
      },
      datos,
    };
  },
);

// ───────────────────────────── Calificaciones ─────────────────────────────

ruta(
  {
    metodo: 'get',
    ruta: '/reportes/calificaciones',
    resumen:
      'Calificación del servicio: promedio, distribución, ranking de sedes y últimos comentarios',
    auth: 'personal',
    roles: ROLES,
    query: filtros,
  },
  async ({ auth, query }) => {
    const { ids, desde, hasta } = await contexto(auth, query);
    const sedesSql = sinDatos(ids) ? [-1] : ids;
    const filtro = Prisma.sql`
      FROM calificaciones c JOIN sedes s ON s.id = c.sede_id
      WHERE c.sede_id = ANY(${sedesSql}::int[])
        AND (c.creado_en AT TIME ZONE s.zona_horaria)::date BETWEEN ${desde}::date AND ${hasta}::date`;

    const [total] = await prisma.$queryRaw<{ promedio: number | null; total: number }[]>`
      SELECT AVG(c.puntaje)::float AS promedio, COUNT(*)::int AS total ${filtro}`;
    const distribucion = await prisma.$queryRaw<{ puntaje: number; total: number }[]>`
      SELECT c.puntaje::int AS puntaje, COUNT(*)::int AS total ${filtro} GROUP BY 1 ORDER BY 1 DESC`;
    const porSede = await prisma.$queryRaw<
      { clave: string; etiqueta: string; promedio: number; total: number }[]
    >`
      SELECT s.codigo AS clave, s.nombre AS etiqueta, AVG(c.puntaje)::float AS promedio, COUNT(*)::int AS total
      ${filtro} GROUP BY s.codigo, s.nombre ORDER BY promedio DESC`;
    const comentarios = await prisma.$queryRaw<
      { id: string; sede: string; puntaje: number; comentario: string; creado_en: Date }[]
    >`
      SELECT c.id, s.codigo AS sede, c.puntaje::int AS puntaje, c.comentario, c.creado_en
      ${filtro} AND c.comentario IS NOT NULL ORDER BY c.creado_en DESC LIMIT 10`;

    const conteo = Object.fromEntries([5, 4, 3, 2, 1].map((p) => [p, 0])) as Record<number, number>;
    for (const d of distribucion) conteo[d.puntaje] = d.total;
    return {
      periodo: { desde, hasta },
      promedio: r2(total?.promedio ?? null),
      total: total?.total ?? 0,
      distribucion: [5, 4, 3, 2, 1].map((p) => ({ puntaje: p, total: conteo[p] ?? 0 })),
      porSede: porSede.map((s) => ({ ...s, promedio: r2(s.promedio) })),
      ultimosComentarios: comentarios.map(({ creado_en, ...c }) => ({ ...c, creadoEn: creado_en })),
    };
  },
);
