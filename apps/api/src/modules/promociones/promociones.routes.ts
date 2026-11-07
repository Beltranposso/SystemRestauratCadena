import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { TIPOS_PROMOCION, etiquetaPromocion, promocionVigente } from '@restaurantes/shared';
import { prisma } from '../../db/prisma';
import { crearModulo } from '../../http/ruta';
import {
  booleanoQuery,
  fecha,
  hora,
  idEntero,
  monto,
  paramsId,
  parcial,
} from '../../http/esquemas';
import { HttpError } from '../../utils/http-error';
import { asegurarSede, sedesFiltradas, todasLasSedes } from '../../auth/alcance';
import type { AuthPersonal } from '../../auth/tipos';
import { aFechaDb } from '../../utils/fechas';
import {
  aRegla,
  avisarCambioMenu,
  momentoLocal,
  promocionesVigentes,
  vigenciaDe,
} from '../menu/menu.service';

/**
 * Promociones de la casa matriz. Solo el admin global las crea y elige en qué sedes aplican;
 * los gerentes las consultan para las sedes de su alcance.
 */
export const moduloPromociones = crearModulo('Promociones');
const { ruta } = moduloPromociones;

const campos = z.object({
  nombre: z.string().trim().min(3).max(80),
  descripcion: z.string().trim().max(200).default(''),
  tipo: z.enum(TIPOS_PROMOCION),
  productoId: idEntero.nullable().optional(),
  categoriaId: idEntero.nullable().optional(),
  porcentaje: z.coerce
    .number()
    .gt(0)
    .max(100)
    .nullable()
    .optional()
    .describe('PORCENTAJE: 20 = 20 %'),
  precioEspecial: monto.nullable().optional().describe('PRECIO_FIJO: precio en moneda local'),
  llevaN: z.number().int().min(2).max(10).nullable().optional().describe('LLEVA_PAGA: lleva N…'),
  pagaM: z.number().int().min(1).max(9).nullable().optional().describe('…paga M'),
  fechaInicio: fecha,
  fechaFin: fecha.nullable().optional(),
  diasSemana: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .default([])
    .describe('0 = domingo … 6 = sábado; vacío = todos los días'),
  horaInicio: hora.nullable().optional(),
  horaFin: hora.nullable().optional(),
  activa: z.boolean().default(true),
  sedeIds: z.array(idEntero).min(1, 'Elige al menos una sede').max(500),
});
type Campos = z.output<typeof campos>;

/** Reglas por tipo. Devuelve los datos normalizados (campos que no aplican en null). */
function normalizar(c: Campos) {
  const errores: string[] = [];
  const base = {
    productoId: c.productoId ?? null,
    categoriaId: c.categoriaId ?? null,
    porcentaje: null as number | null,
    precioEspecial: null as number | null,
    llevaN: null as number | null,
    pagaM: null as number | null,
  };
  if (c.tipo === 'PORCENTAJE') {
    if (!c.porcentaje) errores.push('Indica el porcentaje de descuento');
    if ((base.productoId === null) === (base.categoriaId === null))
      errores.push('Un descuento en % aplica a un producto o a una categoría (uno de los dos)');
    base.porcentaje = c.porcentaje ?? null;
  } else {
    if (base.productoId === null) errores.push('Elige el producto o combo de la promoción');
    base.categoriaId = null;
    if (c.tipo === 'PRECIO_FIJO') {
      if (c.precioEspecial === null || c.precioEspecial === undefined)
        errores.push('Indica el precio especial');
      base.precioEspecial = c.precioEspecial ?? null;
    } else {
      if (!c.llevaN || !c.pagaM || c.pagaM >= c.llevaN)
        errores.push('En "lleva N paga M", M debe ser menor que N (p. ej. 2x1, 3x2)');
      base.llevaN = c.llevaN ?? null;
      base.pagaM = c.pagaM ?? null;
    }
  }
  if (c.fechaFin && c.fechaFin < c.fechaInicio)
    errores.push('La fecha final debe ser igual o posterior a la inicial');
  if (Boolean(c.horaInicio) !== Boolean(c.horaFin))
    errores.push('Indica hora de inicio y de fin, o ninguna');
  if (c.horaInicio && c.horaFin && c.horaInicio >= c.horaFin)
    errores.push('La hora de inicio debe ser antes de la de fin');
  if (errores.length) throw HttpError.badRequest(errores[0]!, { errores });

  return {
    nombre: c.nombre,
    descripcion: c.descripcion,
    tipo: c.tipo,
    ...base,
    fechaInicio: aFechaDb(c.fechaInicio),
    fechaFin: c.fechaFin ? aFechaDb(c.fechaFin) : null,
    diasSemana: [...new Set(c.diasSemana)].sort(),
    horaInicio: c.horaInicio ?? null,
    horaFin: c.horaFin ?? null,
    activa: c.activa,
  };
}

/** Comprueba sedes, producto y que el precio especial tenga sentido en cada sede. */
async function validarContraMenus(d: ReturnType<typeof normalizar>, sedeIds: number[]) {
  const sedes = await todasLasSedes();
  const faltantes = sedeIds.filter((id) => !sedes.has(id));
  if (faltantes.length) throw HttpError.notFound(`Sede ${faltantes[0]}`);

  if (d.productoId !== null) {
    const producto = await prisma.producto.findUnique({ where: { id: d.productoId } });
    if (!producto) throw HttpError.notFound('Producto');
  }
  if (d.categoriaId !== null) {
    const cat = await prisma.categoria.findUnique({ where: { id: d.categoriaId } });
    if (!cat) throw HttpError.notFound('Categoría');
  }

  if (d.tipo === 'PRECIO_FIJO') {
    // Un precio fijo está en una moneda: todas las sedes deben compartirla
    const monedas = new Set(sedeIds.map((id) => sedes.get(id)!.moneda));
    if (monedas.size > 1)
      throw HttpError.unprocessable(
        'Un precio especial está en una sola moneda: elige sedes de un mismo país o crea una promoción por país',
        { monedas: [...monedas] },
      );
    const precios = await prisma.productoSede.findMany({
      where: { productoId: d.productoId!, sedeId: { in: sedeIds } },
      select: { sedeId: true, precio: true },
    });
    const sinRebaja = precios.filter((p) => p.precio.lte(new Prisma.Decimal(d.precioEspecial!)));
    if (sinRebaja.length)
      throw HttpError.unprocessable(
        `El precio especial no es menor que el precio normal en ${sinRebaja.map((p) => sedes.get(p.sedeId)!.codigo).join(', ')}`,
        { sedeIds: sinRebaja.map((p) => p.sedeId) },
      );
  }
}

const incluir = {
  producto: { select: { id: true, nombre: true, sku: true, esCombo: true } },
  categoria: { select: { id: true, nombre: true } },
  sedes: { include: { sede: { select: { id: true, codigo: true, nombre: true } } } },
  _count: { select: { items: true } },
} satisfies Prisma.PromocionInclude;

type PromocionDetalle = Prisma.PromocionGetPayload<{ include: typeof incluir }>;

/** Estado de la promoción hoy en sus sedes: VIGENTE (aplica ahora en alguna), PROGRAMADA, VENCIDA o PAUSADA. */
async function presentar(p: PromocionDetalle, visibles: Set<number>) {
  const sedes = await todasLasSedes();
  const v = vigenciaDe(p);
  const propias = p.sedes.filter((s) => visibles.has(s.sedeId));
  const momentos = propias.map((s) => momentoLocal(sedes.get(s.sedeId)!));
  const hoy = momentos[0]?.fecha ?? new Date().toISOString().slice(0, 10);
  let estado: 'VIGENTE' | 'FUERA_DE_HORARIO' | 'PROGRAMADA' | 'VENCIDA' | 'PAUSADA';
  if (!p.activa) estado = 'PAUSADA';
  else if (v.fechaFin && hoy > v.fechaFin) estado = 'VENCIDA';
  else if (hoy < v.fechaInicio) estado = 'PROGRAMADA';
  else if (momentos.some((m) => promocionVigente(v, m.fecha, m.dia, m.hora))) estado = 'VIGENTE';
  else estado = 'FUERA_DE_HORARIO';

  const { sedes: _s, _count, ...resto } = p;
  return {
    ...resto,
    ...v,
    porcentaje: p.porcentaje === null ? null : Number(p.porcentaje),
    precioEspecial: p.precioEspecial,
    etiqueta: etiquetaPromocion(aRegla(p)),
    estado,
    usos: _count.items,
    sedes: propias.map((s) => s.sede),
    /** Sedes fuera del alcance de quien consulta (el gerente de país no ve las de otros países) */
    otrasSedes: p.sedes.length - propias.length,
  };
}

async function visiblesDe(auth: AuthPersonal) {
  return new Set((await sedesFiltradas(auth, {})).map((s) => s.id));
}

ruta(
  {
    metodo: 'get',
    ruta: '/promociones',
    resumen: 'Promociones de las sedes del alcance',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE'],
    query: z.object({ sedeId: idEntero.optional(), activa: booleanoQuery.optional() }),
  },
  async ({ auth, query }) => {
    if (query.sedeId) await asegurarSede(auth, query.sedeId);
    const visibles = await visiblesDe(auth);
    const filas = await prisma.promocion.findMany({
      where: {
        sedes: { some: { sedeId: query.sedeId ? query.sedeId : { in: [...visibles] } } },
        ...(query.activa !== undefined ? { activa: query.activa } : {}),
      },
      include: incluir,
      orderBy: [{ activa: 'desc' }, { fechaInicio: 'desc' }, { id: 'desc' }],
    });
    return Promise.all(filas.map((p) => presentar(p, visibles)));
  },
);

ruta(
  {
    metodo: 'get',
    ruta: '/sedes/:sedeId/promociones/vigentes',
    resumen: 'Promociones que aplican ahora en una sede (hora local)',
    auth: 'publico',
    params: z.object({ sedeId: idEntero }),
  },
  async ({ params }) => {
    const sede = (await todasLasSedes()).get(params.sedeId);
    if (!sede || !sede.activa) throw HttpError.notFound('Sede');
    return promocionesVigentes(sede);
  },
);

ruta(
  {
    metodo: 'post',
    ruta: '/promociones',
    resumen: 'Crear promoción',
    descripcion:
      'Solo el admin global. Tipos: PORCENTAJE (producto o categoría), PRECIO_FIJO (producto o combo; sedes de una misma moneda) y LLEVA_PAGA (2x1, 3x2…).',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL'],
    body: campos,
    status: 201,
  },
  async ({ auth, body }) => {
    const datos = normalizar(body);
    const sedeIds = [...new Set(body.sedeIds)];
    await validarContraMenus(datos, sedeIds);
    const creada = await prisma.promocion.create({
      data: { ...datos, sedes: { create: sedeIds.map((sedeId) => ({ sedeId })) } },
      include: incluir,
    });
    avisarCambioMenu(sedeIds);
    return presentar(creada, await visiblesDe(auth));
  },
);

ruta(
  {
    metodo: 'patch',
    ruta: '/promociones/:id',
    resumen: 'Editar, pausar o reactivar una promoción',
    descripcion: '`sedeIds` reemplaza la lista de sedes.',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL'],
    params: paramsId,
    body: parcial(campos),
  },
  async ({ auth, params, body }) => {
    const actual = await prisma.promocion.findUnique({
      where: { id: params.id },
      include: { sedes: true },
    });
    if (!actual) throw HttpError.notFound('Promoción');
    const v = vigenciaDe(actual);
    const combinado = campos.parse({
      nombre: actual.nombre,
      descripcion: actual.descripcion,
      tipo: actual.tipo,
      productoId: actual.productoId,
      categoriaId: actual.categoriaId,
      porcentaje: actual.porcentaje === null ? null : Number(actual.porcentaje),
      precioEspecial: actual.precioEspecial === null ? null : Number(actual.precioEspecial),
      llevaN: actual.llevaN,
      pagaM: actual.pagaM,
      ...v,
      sedeIds: actual.sedes.map((s) => s.sedeId),
      ...Object.fromEntries(Object.entries(body).filter(([, x]) => x !== undefined)),
    });
    const datos = normalizar(combinado);
    const sedeIds = [...new Set(combinado.sedeIds)];
    await validarContraMenus(datos, sedeIds);
    const actualizada = await prisma.$transaction(async (tx) => {
      if (body.sedeIds) {
        await tx.promocionSede.deleteMany({ where: { promocionId: actual.id } });
        await tx.promocionSede.createMany({
          data: sedeIds.map((sedeId) => ({ promocionId: actual.id, sedeId })),
        });
      }
      return tx.promocion.update({ where: { id: actual.id }, data: datos, include: incluir });
    });
    avisarCambioMenu([...actual.sedes.map((s) => s.sedeId), ...sedeIds]);
    return presentar(actualizada, await visiblesDe(auth));
  },
);

ruta(
  {
    metodo: 'delete',
    ruta: '/promociones/:id',
    resumen: 'Eliminar promoción',
    descripcion:
      'Los pedidos que la usaron conservan el nombre y el descuento. Si prefieres conservarla, páusala con PATCH activa=false.',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL'],
    params: paramsId,
  },
  async ({ params }) => {
    const actual = await prisma.promocion.findUnique({
      where: { id: params.id },
      include: { sedes: true },
    });
    if (!actual) throw HttpError.notFound('Promoción');
    await prisma.promocion.delete({ where: { id: actual.id } });
    avisarCambioMenu(actual.sedes.map((s) => s.sedeId));
  },
);
