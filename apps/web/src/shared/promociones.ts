/**
 * Reglas de promociones, compartidas por la API (que cobra) y la web (que muestra el precio).
 * Todo el cálculo se hace en centavos enteros para que ambos lados den exactamente lo mismo.
 *
 * Reglas:
 *  - Una promoción aplica a un producto (o combo) o, si es de porcentaje, a toda una categoría.
 *  - Las promociones NO se acumulan: por producto gana la que más descuenta.
 *  - "Lleva N paga M" se cuenta sobre la cantidad total del producto en el pedido,
 *    aunque venga en varias líneas (p. ej. una con notas y otra sin notas).
 */

import type { TipoPromocion } from './enums';

export const TIPOS_PROMOCION = [
  'PORCENTAJE',
  'PRECIO_FIJO',
  'LLEVA_PAGA',
] as const satisfies readonly TipoPromocion[];

export interface ReglaPromocion {
  id: number;
  nombre: string;
  tipo: TipoPromocion;
  productoId: number | null;
  categoriaId: number | null;
  porcentaje: number | string | null;
  precioEspecial: number | string | null;
  llevaN: number | null;
  pagaM: number | null;
}

export interface VigenciaPromocion {
  /** YYYY-MM-DD */
  fechaInicio: string;
  fechaFin: string | null;
  /** 0 = domingo … 6 = sábado; vacío = todos los días */
  diasSemana: number[];
  horaInicio: string | null;
  horaFin: string | null;
  activa: boolean;
}

export interface LineaParaPrecio {
  productoId: number;
  categoriaId: number;
  precio: number | string;
  cantidad: number;
}

export interface DescuentoLinea {
  /** Descuento de la línea en moneda local (2 decimales) */
  descuento: number;
  promocion: { id: number; nombre: string } | null;
}

const centavos = (v: number | string) => Math.round(Number(v) * 100);
const deCentavos = (c: number) => c / 100;

/** ¿La promoción cubre este producto? */
export function promocionAplica(p: ReglaPromocion, productoId: number, categoriaId: number) {
  if (p.productoId !== null) return p.productoId === productoId;
  return p.tipo === 'PORCENTAJE' && p.categoriaId === categoriaId;
}

/** Descuento, en centavos, de una promoción sobre `cantidad` unidades a `precioCent`. */
function descuentoCentavos(p: ReglaPromocion, precioCent: number, cantidad: number): number {
  const bruto = precioCent * cantidad;
  switch (p.tipo) {
    case 'PORCENTAJE': {
      const basisPoints = Math.round(Number(p.porcentaje ?? 0) * 100); // 12.5 % → 1250
      return Math.min(bruto, Math.round((bruto * basisPoints) / 10_000));
    }
    case 'PRECIO_FIJO': {
      const especial = centavos(p.precioEspecial ?? 0);
      return Math.max(0, precioCent - especial) * cantidad;
    }
    case 'LLEVA_PAGA': {
      const n = p.llevaN ?? 0;
      const m = p.pagaM ?? 0;
      if (n < 2 || m < 1 || m >= n) return 0;
      return Math.floor(cantidad / n) * (n - m) * precioCent;
    }
  }
}

/**
 * Calcula el descuento de cada línea con las promociones vigentes.
 * Devuelve un arreglo paralelo a `lineas`.
 */
export function aplicarPromociones(
  lineas: LineaParaPrecio[],
  promociones: ReglaPromocion[],
): DescuentoLinea[] {
  const resultado: DescuentoLinea[] = lineas.map(() => ({ descuento: 0, promocion: null }));

  // Agrupa por producto: "lleva N paga M" se cuenta sobre el total del producto
  const grupos = new Map<number, number[]>();
  lineas.forEach((l, i) => grupos.set(l.productoId, [...(grupos.get(l.productoId) ?? []), i]));

  for (const [productoId, indices] of grupos) {
    const primera = lineas[indices[0]!]!;
    const precioCent = centavos(primera.precio);
    const cantidad = indices.reduce((s, i) => s + lineas[i]!.cantidad, 0);
    if (precioCent <= 0 || cantidad <= 0) continue;

    let mejor: { p: ReglaPromocion; cent: number } | null = null;
    for (const p of promociones) {
      if (!promocionAplica(p, productoId, primera.categoriaId)) continue;
      const cent = descuentoCentavos(p, precioCent, cantidad);
      if (cent > 0 && (!mejor || cent > mejor.cent || (cent === mejor.cent && p.id < mejor.p.id)))
        mejor = { p, cent };
    }
    if (!mejor) continue;

    // Reparte el descuento entre las líneas según su cantidad; el resto va a la última
    let pendiente = mejor.cent;
    indices.forEach((i, k) => {
      const parte =
        k === indices.length - 1
          ? pendiente
          : Math.floor((mejor.cent * lineas[i]!.cantidad) / cantidad);
      pendiente -= parte;
      resultado[i] = {
        descuento: deCentavos(parte),
        promocion: { id: mejor.p.id, nombre: mejor.p.nombre },
      };
    });
  }
  return resultado;
}

/** ¿Está vigente en esta fecha y hora local de la sede? */
export function promocionVigente(
  v: VigenciaPromocion,
  fechaLocal: string,
  diaSemana: number,
  horaLocal: string,
): boolean {
  if (!v.activa) return false;
  if (fechaLocal < v.fechaInicio) return false;
  if (v.fechaFin && fechaLocal > v.fechaFin) return false;
  if (v.diasSemana.length && !v.diasSemana.includes(diaSemana)) return false;
  if (v.horaInicio && v.horaFin && (horaLocal < v.horaInicio || horaLocal >= v.horaFin))
    return false;
  return true;
}

/** Texto corto para el distintivo del producto: "2x1", "-20 %", "Precio especial". */
export function etiquetaPromocion(
  p: Pick<ReglaPromocion, 'tipo' | 'porcentaje' | 'llevaN' | 'pagaM'>,
) {
  if (p.tipo === 'LLEVA_PAGA') return `${p.llevaN}x${p.pagaM}`;
  if (p.tipo === 'PORCENTAJE') return `-${Number(p.porcentaje)} %`;
  return 'Precio especial';
}

/** Precio por unidad con la promoción (para porcentaje y precio especial). null si es "lleva N paga M". */
export function precioUnitarioConPromocion(p: ReglaPromocion, precio: number | string) {
  if (p.tipo === 'LLEVA_PAGA') return null;
  const cent = centavos(precio);
  return deCentavos(cent - descuentoCentavos(p, cent, 1));
}

export const NOMBRES_DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;
