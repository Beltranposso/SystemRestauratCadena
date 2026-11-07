/**
 * Generador pseudoaleatorio con semilla (mulberry32): el seed produce siempre
 * la misma estructura de datos, lo que facilita depurar y comparar reportes.
 */
export function crearRng(semilla: number) {
  let a = semilla >>> 0;
  const siguiente = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng = {
    siguiente,
    /** Entero entre min y max, ambos incluidos. */
    entero: (min: number, max: number) => Math.floor(siguiente() * (max - min + 1)) + min,
    /** Decimal entre min y max. */
    rango: (min: number, max: number) => siguiente() * (max - min) + min,
    prob: (p: number) => siguiente() < p,
    elegir: <T>(lista: readonly T[]): T => {
      if (lista.length === 0) throw new Error('Lista vacía');
      return lista[Math.floor(siguiente() * lista.length)] as T;
    },
    /** Elige según pesos: [[valor, peso], …] */
    ponderado: <T>(opciones: readonly (readonly [T, number])[]): T => {
      const total = opciones.reduce((s, [, p]) => s + p, 0);
      let r = siguiente() * total;
      for (const [valor, peso] of opciones) {
        r -= peso;
        if (r <= 0) return valor;
      }
      return opciones[opciones.length - 1]![0];
    },
    mezclar: <T>(lista: readonly T[]): T[] => {
      const copia = [...lista];
      for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(siguiente() * (i + 1));
        [copia[i], copia[j]] = [copia[j]!, copia[i]!];
      }
      return copia;
    },
  };
  return rng;
}

export type Rng = ReturnType<typeof crearRng>;

const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Códigos de confirmación únicos de 6 caracteres, sin letras ambiguas (O/0, I/1). */
export function generadorCodigos(rng: Rng) {
  const usados = new Set<string>();
  return () => {
    for (;;) {
      let c = '';
      for (let i = 0; i < 6; i++) c += ALFABETO_CODIGO[rng.entero(0, ALFABETO_CODIGO.length - 1)];
      if (!usados.has(c)) {
        usados.add(c);
        return c;
      }
    }
  };
}

export const sumarMin = (fecha: Date, minutos: number) =>
  new Date(fecha.getTime() + minutos * 60_000);

/** Inserta en lotes respetando el límite de 65 535 parámetros de PostgreSQL. */
export async function insertarEnLotes<T extends object>(
  filas: T[],
  insertar: (lote: T[]) => Promise<unknown>,
): Promise<void> {
  if (filas.length === 0) return;
  const columnas = Object.keys(filas[0]!).length;
  const tamano = Math.max(1, Math.floor(60_000 / columnas));
  for (let i = 0; i < filas.length; i += tamano) {
    await insertar(filas.slice(i, i + tamano));
  }
}
