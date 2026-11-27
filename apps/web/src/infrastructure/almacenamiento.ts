/** Acceso seguro a localStorage: en kioscos sin almacenamiento la sesión dura lo que la pestaña. */

export const CLAVES = {
  dispositivo: 'fogon.dispositivo',
  marca: 'fogon.marca',
} as const;

function disponible(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

export function leer<T>(clave: string, porDefecto: T): T {
  if (!disponible()) return porDefecto;
  try {
    const crudo = window.localStorage.getItem(clave);
    return crudo ? ({ ...(porDefecto as object), ...(JSON.parse(crudo) as object) } as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

export function escribir(clave: string, valor: unknown): void {
  if (!disponible()) return;
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento disponible */
  }
}

export function borrar(clave: string): void {
  if (!disponible()) return;
  try {
    window.localStorage.removeItem(clave);
  } catch {
    /* sin almacenamiento disponible */
  }
}
