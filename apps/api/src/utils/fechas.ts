/**
 * Utilidades de zona horaria sin dependencias externas (usa Intl).
 * Regla del proyecto: en la BD todo es UTC; el "día de operación" es la fecha local de la sede.
 */

const formateadores = new Map<string, Intl.DateTimeFormat>();

function formateador(zona: string): Intl.DateTimeFormat {
  let f = formateadores.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formateadores.set(zona, f);
  }
  return f;
}

/** Partes de la fecha-hora tal como se ven en el reloj de la zona indicada. */
export function partesLocales(fecha: Date, zona: string) {
  const p = Object.fromEntries(
    formateador(zona)
      .formatToParts(fecha)
      .filter((x) => x.type !== 'literal')
      .map((x) => [x.type, Number(x.value)]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
  return p;
}

/** Diferencia en minutos entre la hora local de la zona y UTC en ese instante (Bogotá = -300). */
export function desfaseMinutos(fecha: Date, zona: string): number {
  const p = partesLocales(fecha, zona);
  const comoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((comoUtc - Math.floor(fecha.getTime() / 1000) * 1000) / 60000);
}

/** Fecha local (YYYY-MM-DD) de un instante en la zona de la sede. */
export function fechaOperacion(fecha: Date, zona: string): string {
  const p = partesLocales(fecha, zona);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * Convierte una fecha y hora "de reloj" de la sede a un instante UTC.
 * Ej.: localAUtc('2026-10-25', 19, 30, 'America/Bogota') → 2026-10-26T00:30:00.000Z
 */
export function localAUtc(fecha: string, hora: number, minuto: number, zona: string): Date {
  const [y, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const ingenua = Date.UTC(y, m - 1, d, hora, minuto);
  // Dos pasadas para cubrir zonas con cambio de horario cerca del instante.
  let instante = ingenua - desfaseMinutos(new Date(ingenua), zona) * 60000;
  instante = ingenua - desfaseMinutos(new Date(instante), zona) * 60000;
  return new Date(instante);
}

/** Suma días a una fecha YYYY-MM-DD. */
export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Día de la semana (0 = domingo) de una fecha YYYY-MM-DD. */
export function diaSemana(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Convierte YYYY-MM-DD al Date que Prisma espera para columnas @db.Date. */
export function aFechaDb(fecha: string): Date {
  return new Date(`${fecha}T00:00:00.000Z`);
}
