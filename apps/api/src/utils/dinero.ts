import { Prisma } from '@prisma/client';

type Monto = Prisma.Decimal | number | string;

const dec = (v: Monto) => new Prisma.Decimal(v);

/** Redondea a 2 decimales (mitad hacia arriba), como se guarda en DECIMAL(12,2). */
export function redondear(v: Monto): Prisma.Decimal {
  return dec(v).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Convierte un monto en moneda local a USD con la tasa del país (unidades locales por 1 USD). */
export function aUsd(montoLocal: Monto, tasaUsd: Monto): Prisma.Decimal {
  return redondear(dec(montoLocal).div(dec(tasaUsd)));
}

/**
 * Calcula subtotal, impuestos y total de una lista de líneas.
 * Los precios del menú se guardan sin impuesto; el impuesto se aplica sobre el subtotal.
 */
export function calcularTotales(
  lineas: { precioUnitario: Monto; cantidad: number }[],
  tasaImpuesto: Monto,
) {
  const subtotal = redondear(
    lineas.reduce((acc, l) => acc.add(dec(l.precioUnitario).mul(l.cantidad)), dec(0)),
  );
  const impuestos = redondear(subtotal.mul(dec(tasaImpuesto)));
  return { subtotal, impuestos, total: subtotal.add(impuestos) };
}
