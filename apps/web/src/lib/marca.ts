import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { MARCA_POR_DEFECTO, derivarPaleta, hexARgb } from '@restaurantes/shared';
import { apiPublica } from './sesion';

export interface Marca {
  nombre: string;
  logo: string | null;
  colorPrimario: string;
  colorAcento: string;
  actualizadoEn?: string;
}

const CLAVE = 'fogon.marca';
export const MARCA_INICIAL: Marca = { ...MARCA_POR_DEFECTO, logo: null };

/** Variables CSS de un par de colores (las mismas que usa Tailwind: brand.red, brand.gold…). */
export function variablesDe(colorPrimario: string, colorAcento: string): Record<string, string> {
  const p = derivarPaleta(colorPrimario, colorAcento);
  const canales = (hex: string) => hexARgb(hex).join(' ');
  return {
    '--marca-primario': canales(p.primario),
    '--marca-primario-oscuro': canales(p.primarioOscuro),
    '--marca-acento': canales(p.acento),
    '--marca-acento-suave': canales(p.acentoSuave),
  };
}

export const useMarca = create<{ marca: Marca }>(() => ({ marca: leerCache() }));

function leerCache(): Marca {
  try {
    const crudo = localStorage.getItem(CLAVE);
    return crudo ? { ...MARCA_INICIAL, ...(JSON.parse(crudo) as Marca) } : MARCA_INICIAL;
  } catch {
    return MARCA_INICIAL;
  }
}

/** Pinta toda la app con la marca: variables CSS, color de la barra del navegador y título. */
export function aplicarMarca(m: Marca) {
  const raiz = document.documentElement;
  for (const [k, v] of Object.entries(variablesDe(m.colorPrimario, m.colorAcento)))
    raiz.style.setProperty(k, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', m.colorPrimario);
  document.title = m.nombre;
  useMarca.setState({ marca: m });
  try {
    localStorage.setItem(CLAVE, JSON.stringify(m));
  } catch {
    /* sin almacenamiento: se recarga del servidor en cada visita */
  }
}

/** Al arrancar: aplica la última marca conocida para que no parpadee el rojo por defecto. */
export function aplicarMarcaGuardada() {
  aplicarMarca(leerCache());
}

/** Mantiene la marca al día con el servidor (también en kioscos y pantallas sin sesión). */
export function SincronizarMarca() {
  const q = useQuery({
    queryKey: ['marca'],
    queryFn: async () => (await apiPublica.get<Marca>('/marca')).data,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
  useEffect(() => {
    if (q.data) aplicarMarca(q.data);
  }, [q.data]);
  return null;
}

/** Recarga la marca del servidor (al llegar el evento marca:actualizada por Socket.IO). */
export async function refrescarMarca() {
  try {
    aplicarMarca((await apiPublica.get<Marca>('/marca')).data);
  } catch {
    /* se reintenta en la próxima sincronización */
  }
}
