const monedas = new Map<string, Intl.NumberFormat>();

/** Precio en la moneda de la sede: COP sin decimales, el resto con dos. */
export function dinero(valor: string | number | null | undefined, moneda = 'USD') {
  if (valor === null || valor === undefined) return '—';
  let f = monedas.get(moneda);
  if (!f) {
    const sinDecimales = ['COP', 'CLP', 'PYG'].includes(moneda);
    f = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: moneda,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: sinDecimales ? 0 : 2,
      maximumFractionDigits: sinDecimales ? 0 : 2,
    });
    monedas.set(moneda, f);
  }
  return f.format(Number(valor));
}

/** USD compacto para tarjetas del dashboard: US$ 42,8 mil */
export function usdCompacto(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return '—';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    notation: valor >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: valor >= 10_000 ? 1 : 2,
  }).format(valor);
}

/** Eje de gráficas: siempre compacto (US$ 8 mil) para que quepa */
export const usdEje = (v: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(v);

export const entero = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : new Intl.NumberFormat('es-CO').format(n);

export const porcentaje = (n: number | null | undefined, decimales = 1) =>
  n === null || n === undefined
    ? '—'
    : `${n.toLocaleString('es-CO', { maximumFractionDigits: decimales })} %`;

export const minutos = (n: number | null | undefined) =>
  n === null || n === undefined
    ? '—'
    : `${n.toLocaleString('es-CO', { maximumFractionDigits: 1 })} min`;

/** Hora local de la sede (o del navegador si no se indica zona). */
export function horaDe(iso: string, zona?: string) {
  return new Intl.DateTimeFormat('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: zona,
  }).format(new Date(iso));
}

/** "lun 27 oct" a partir de YYYY-MM-DD */
export function diaCorto(fecha: string) {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
    .format(new Date(`${fecha}T12:00:00Z`))
    .replace('.', '');
}

/** "Mar" a partir de YYYY-MM-DD */
export function diaSemana(fecha: string) {
  const d = new Intl.DateTimeFormat('es-CO', { weekday: 'short', timeZone: 'UTC' })
    .format(new Date(`${fecha}T12:00:00Z`))
    .replace('.', '');
  return d.charAt(0).toUpperCase() + d.slice(1);
}

export function diaLargo(fecha: string) {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${fecha}T12:00:00Z`));
}

/** Fecha local YYYY-MM-DD en una zona */
export function hoyEn(zona?: string, desplazamientoDias = 0) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + desplazamientoDias * 86_400_000));
}

export function sumarDias(fecha: string, dias: number) {
  const [y, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Lunes de la semana de una fecha YYYY-MM-DD */
export function lunesDe(fecha: string) {
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return sumarDias(fecha, -((dia + 6) % 7));
}

export function minutosDesde(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
}

export const ETIQUETA_ROL: Record<string, string> = {
  ADMIN_GLOBAL: 'Admin global',
  GERENTE_PAIS: 'Gerente de país',
  GERENTE_SEDE: 'Gerente de sede',
  CAJERO: 'Caja',
  COCINA: 'Cocina',
};

export const ETIQUETA_PUESTO: Record<string, string> = {
  CAJA: 'Caja',
  COCINA: 'Cocina',
  SERVICIO: 'Servicio',
  GERENCIA: 'Gerencia',
};
