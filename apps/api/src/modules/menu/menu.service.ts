import type { Prisma } from '@prisma/client';
import {
  EVENTOS,
  aplicarPromociones,
  etiquetaPromocion,
  precioUnitarioConPromocion,
  promocionAplica,
  promocionVigente,
  type ReglaPromocion,
} from '@restaurantes/shared';
import { prisma } from '../../db/prisma';
import type { SedeInfo } from '../../auth/alcance';
import { emitirASede } from '../../realtime/socket';
import { aFechaDb, diaSemana, fechaOperacion, partesLocales } from '../../utils/fechas';

/**
 * Menú de una sede: qué se puede vender ahora, a qué precio y con qué promoción.
 * Lo usan el endpoint público /menu (caja, kiosco) y la creación de pedidos, para que
 * lo que se muestra y lo que se cobra salgan de la misma regla.
 */

export const incluirProductoMenu = {
  producto: {
    include: {
      categoria: true,
      componentes: {
        include: { producto: { select: { id: true, nombre: true } } },
        orderBy: { productoId: 'asc' },
      },
    },
  },
} satisfies Prisma.ProductoSedeInclude;

export type FilaMenu = Prisma.ProductoSedeGetPayload<{ include: typeof incluirProductoMenu }>;

/** Ids de productos que la sede puede vender ahora (en su menú, disponibles y activos). */
export async function vendiblesEnSede(sedeId: number, productoIds?: number[]) {
  const filas = await prisma.productoSede.findMany({
    where: {
      sedeId,
      disponible: true,
      producto: { activo: true },
      ...(productoIds ? { productoId: { in: productoIds } } : {}),
    },
    select: { productoId: true, precio: true },
  });
  return new Map(filas.map((f) => [f.productoId, f.precio]));
}

/**
 * Filas del menú de la sede listas para vender. Un combo se oculta si alguno de sus
 * componentes está agotado o no se ofrece en la sede (no se puede preparar).
 */
export async function filasVendibles(sedeId: number, productoIds?: number[]) {
  const filas = await prisma.productoSede.findMany({
    where: {
      sedeId,
      disponible: true,
      producto: { activo: true },
      ...(productoIds ? { productoId: { in: productoIds } } : {}),
    },
    include: incluirProductoMenu,
    orderBy: [{ producto: { categoria: { orden: 'asc' } } }, { orden: 'asc' }],
  });
  const idsComponentes = [
    ...new Set(filas.flatMap((f) => f.producto.componentes.map((c) => c.productoId))),
  ];
  const precios = idsComponentes.length
    ? await vendiblesEnSede(sedeId, idsComponentes)
    : new Map<number, Prisma.Decimal>();
  const vendibles = filas.filter(
    (f) => !f.producto.esCombo || f.producto.componentes.every((c) => precios.has(c.productoId)),
  );
  return { filas: vendibles, preciosComponentes: precios };
}

type PromocionDb = Prisma.PromocionGetPayload<object>;

export const aRegla = (p: PromocionDb): ReglaPromocion & { descripcion: string } => ({
  id: p.id,
  nombre: p.nombre,
  descripcion: p.descripcion,
  tipo: p.tipo,
  productoId: p.productoId,
  categoriaId: p.categoriaId,
  porcentaje: p.porcentaje === null ? null : Number(p.porcentaje),
  precioEspecial: p.precioEspecial === null ? null : Number(p.precioEspecial),
  llevaN: p.llevaN,
  pagaM: p.pagaM,
});

const fechaTexto = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export const vigenciaDe = (p: PromocionDb) => ({
  fechaInicio: fechaTexto(p.fechaInicio)!,
  fechaFin: fechaTexto(p.fechaFin),
  diasSemana: p.diasSemana,
  horaInicio: p.horaInicio,
  horaFin: p.horaFin,
  activa: p.activa,
});

/** Momento local de la sede: fecha, día de la semana y hora HH:mm. */
export function momentoLocal(sede: Pick<SedeInfo, 'zonaHoraria'>, ahora = new Date()) {
  const fecha = fechaOperacion(ahora, sede.zonaHoraria);
  const p = partesLocales(ahora, sede.zonaHoraria);
  const hora = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
  return { fecha, dia: diaSemana(fecha), hora };
}

/** Promociones que aplican en la sede en este instante (hora local de la sede). */
export async function promocionesVigentes(sede: SedeInfo, ahora = new Date()) {
  const { fecha, dia, hora } = momentoLocal(sede, ahora);
  const filas = await prisma.promocion.findMany({
    where: {
      activa: true,
      sedes: { some: { sedeId: sede.id } },
      fechaInicio: { lte: aFechaDb(fecha) },
      OR: [{ fechaFin: null }, { fechaFin: { gte: aFechaDb(fecha) } }],
    },
    orderBy: { id: 'asc' },
  });
  return filas.filter((p) => promocionVigente(vigenciaDe(p), fecha, dia, hora)).map(aRegla);
}

/** Menú público de la sede, con combos, ahorro y promociones vigentes. */
export async function menuDeSede(sede: SedeInfo) {
  const [{ filas, preciosComponentes }, promociones] = await Promise.all([
    filasVendibles(sede.id),
    promocionesVigentes(sede),
  ]);

  const categorias = new Map<
    number,
    { id: number; nombre: string; icono: string; productos: unknown[] }
  >();
  for (const f of filas) {
    const p = f.producto;
    const c = p.categoria;
    if (!categorias.has(c.id))
      categorias.set(c.id, { id: c.id, nombre: c.nombre, icono: c.icono, productos: [] });

    // Distintivo: la promoción que deja el menor precio por unidad; si no, la de "lleva N paga M"
    const aplicables = promociones.filter((r) => promocionAplica(r, p.id, p.categoriaId));
    const destacada =
      aplicables
        .map((r) => ({ r, precio: precioUnitarioConPromocion(r, Number(f.precio)) }))
        .filter((x) => x.precio !== null && x.precio < Number(f.precio))
        .sort((a, b) => a.precio! - b.precio!)[0] ??
      aplicables
        .filter((r) => r.tipo === 'LLEVA_PAGA')
        .map((r) => ({ r, precio: null as number | null }))[0];

    const precioSuelto = p.esCombo
      ? p.componentes.reduce(
          (s, c) => s + Number(preciosComponentes.get(c.productoId) ?? 0) * c.cantidad,
          0,
        )
      : null;

    categorias.get(c.id)!.productos.push({
      id: p.id,
      sku: p.sku,
      nombre: p.nombre,
      descripcion: p.descripcion,
      imagenUrl: p.imagenUrl,
      categoriaId: p.categoriaId,
      precio: f.precio,
      esCombo: p.esCombo,
      componentes: p.componentes.map((c) => ({
        productoId: c.productoId,
        nombre: c.producto.nombre,
        cantidad: c.cantidad,
      })),
      /** Lo que costarían los componentes por separado en esta sede (solo combos) */
      precioSuelto,
      promocion: destacada
        ? {
            id: destacada.r.id,
            nombre: destacada.r.nombre,
            tipo: destacada.r.tipo,
            etiqueta: etiquetaPromocion(destacada.r),
            precioConPromocion: destacada.precio,
          }
        : null,
    });
  }

  return {
    sede: {
      id: sede.id,
      nombre: sede.nombre,
      moneda: sede.moneda,
      tasaImpuesto: sede.tasaImpuesto,
    },
    categorias: [...categorias.values()],
    /** Reglas vigentes: la web las usa con aplicarPromociones() para mostrar el total exacto */
    promociones,
  };
}

export { aplicarPromociones };

/** Avisa a los kioscos (sala pantalla) y a la caja de las sedes que su menú cambió, para que recarguen. */
export function avisarCambioMenu(sedeIds: Iterable<number>) {
  for (const sedeId of new Set(sedeIds)) {
    emitirASede(sedeId, 'pantalla', EVENTOS.menuActualizado, { sedeId });
    emitirASede(sedeId, 'caja', EVENTOS.menuActualizado, { sedeId });
  }
}
