import { useEffect } from 'react';
import { MARCA_POR_DEFECTO, derivarPaleta, esHex, hexARgb } from '@shared';
import { useQuery } from '../application/consultas';
import { establecerMarca } from '../application/store';
import type { Marca } from '../domain/tipos';
import { CLAVES, leer, escribir } from './almacenamiento';
import { apiPublica } from './api';
import { despachar } from './sesion-puente';

export { marcaActual, useMarca } from '../application/hooks';
export type { Marca } from '../domain/tipos';

export const MARCA_INICIAL: Marca = { ...MARCA_POR_DEFECTO, logo: null };

/**
 * La respuesta de la API (o un localStorage antiguo) puede no traer colores válidos.
 * Nunca dejamos que eso llegue a `derivarPaleta`, que espera hex de 6 dígitos.
 */
export function normalizarMarca(datos: unknown): Marca {
  if (typeof datos !== 'object' || datos === null) return MARCA_INICIAL;
  const m = datos as Partial<Marca>;
  return {
    ...MARCA_INICIAL,
    ...m,
    nombre: typeof m.nombre === 'string' && m.nombre.trim() ? m.nombre : MARCA_INICIAL.nombre,
    colorPrimario:
      typeof m.colorPrimario === 'string' && esHex(m.colorPrimario)
        ? m.colorPrimario
        : MARCA_INICIAL.colorPrimario,
    colorAcento:
      typeof m.colorAcento === 'string' && esHex(m.colorAcento)
        ? m.colorAcento
        : MARCA_INICIAL.colorAcento,
    logo: typeof m.logo === 'string' ? m.logo : null,
  };
}

/** Variables CSS de un par de colores (las mismas que usa Tailwind: brand.red, brand.gold…). */
export function variablesDe(colorPrimario: string, colorAcento: string): Record<string, string> {
  const paleta = derivarPaleta(colorPrimario, colorAcento);
  const canales = (hex: string) => hexARgb(hex).join(' ');
  return {
    '--marca-primario': canales(paleta.primario),
    '--marca-primario-oscuro': canales(paleta.primarioOscuro),
    '--marca-acento': canales(paleta.acento),
    '--marca-acento-suave': canales(paleta.acentoSuave),
  };
}

/** Pinta toda la app con la marca y la guarda en el store y en localStorage. */
export function aplicarMarca(datos: unknown) {
  const m = normalizarMarca(datos);
  const raiz = document.documentElement;
  for (const [clave, valor] of Object.entries(variablesDe(m.colorPrimario, m.colorAcento)))
    raiz.style.setProperty(clave, valor);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', m.colorPrimario);
  document.title = m.nombre;
  despachar(establecerMarca(m));
  escribir(CLAVES.marca, m);
}

/** Al arrancar: aplica la última marca conocida para que no parpadee el rojo por defecto. */
export function aplicarMarcaGuardada() {
  aplicarMarca(leer<unknown>(CLAVES.marca, MARCA_INICIAL));
}

/** Mantiene la marca al día con el servidor (también en kioscos y pantallas sin sesión). */
export function SincronizarMarca() {
  const marca = useQuery({
    queryKey: ['marca'],
    queryFn: async () => (await apiPublica.get<Marca>('/marca')).data,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
  useEffect(() => {
    if (marca.data && typeof marca.data === 'object') aplicarMarca(marca.data);
  }, [marca.data]);
  return null;
}

/** Recarga la marca del servidor al llegar `marca:actualizada` por Socket.IO. */
export async function refrescarMarca() {
  try {
    aplicarMarca((await apiPublica.get<Marca>('/marca')).data);
  } catch {
    /* se reintenta en la próxima sincronización */
  }
}
