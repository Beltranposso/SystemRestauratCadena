import { useEffect } from 'react';
import { useQuery } from '../application/consultas';
import { aplicarConfiguracion } from '../application/store';
import type { Configuracion } from '../domain/tipos';
import { apiPublica } from './api';
import { despachar } from './sesion-puente';

export { useConfiguracion } from '../application/hooks';
export type { Configuracion } from '../domain/tipos';

/** Al llegar `configuracion:actualizada`, o al guardar desde el admin. */
export async function refrescarConfiguracion(datos?: Configuracion) {
  if (datos) {
    despachar(aplicarConfiguracion(datos));
    return;
  }
  try {
    despachar(aplicarConfiguracion((await apiPublica.get<Configuracion>('/configuracion')).data));
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
    if (configuracion.data) despachar(aplicarConfiguracion(configuracion.data));
  }, [configuracion.data]);
  return null;
}
