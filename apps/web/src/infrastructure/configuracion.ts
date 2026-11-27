import { useEffect } from 'react';
import { useQuery } from '../application/consultas';
import { aplicarConfiguracion } from '../application/store';
import type { Configuracion } from '../domain/tipos';
import { apiPublica } from './api';
import { despachar } from './sesion-puente';

export { useConfiguracion } from '../application/hooks';
export type { Configuracion } from '../domain/tipos';

const CONFIGURACION_INICIAL: Configuracion = {
  reservasHabilitadas: false,
  salirFilaHabilitado: true,
};

/** Evita que una respuesta HTML o incompleta deje los flags en `undefined`. */
export function normalizarConfiguracion(datos: unknown): Configuracion {
  if (typeof datos !== 'object' || datos === null) return CONFIGURACION_INICIAL;
  const c = datos as Partial<Configuracion>;
  return {
    reservasHabilitadas:
      typeof c.reservasHabilitadas === 'boolean'
        ? c.reservasHabilitadas
        : CONFIGURACION_INICIAL.reservasHabilitadas,
    salirFilaHabilitado:
      typeof c.salirFilaHabilitado === 'boolean'
        ? c.salirFilaHabilitado
        : CONFIGURACION_INICIAL.salirFilaHabilitado,
  };
}

/** Al llegar `configuracion:actualizada`, o al guardar desde el admin. */
export async function refrescarConfiguracion(datos?: Configuracion) {
  if (datos) {
    despachar(aplicarConfiguracion(normalizarConfiguracion(datos)));
    return;
  }
  try {
    const respuesta = await apiPublica.get<Configuracion>('/configuracion');
    despachar(aplicarConfiguracion(normalizarConfiguracion(respuesta.data)));
  } catch {
    /* se reintenta en la próxima sincronización */
  }
}

export function SincronizarConfiguracion() {
  const configuracion = useQuery({
    queryKey: ['configuracion'],
    queryFn: async () => (await apiPublica.get<Configuracion>('/configuracion')).data,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (configuracion.data && typeof configuracion.data === 'object')
      despachar(aplicarConfiguracion(normalizarConfiguracion(configuracion.data)));
  }, [configuracion.data]);
  return null;
}
