import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { apiPublica } from './sesion';

/** Funciones de la cadena que activa o desactiva el admin global (Configuración). */
export interface Configuracion {
  reservasHabilitadas: boolean;
  salirFilaHabilitado: boolean;
}

interface Estado extends Configuracion {
  /** Ya llegó la respuesta del servidor (antes de eso no se ocultan ni muestran vistas) */
  cargada: boolean;
}

export const useConfiguracion = create<Estado>(() => ({
  reservasHabilitadas: false,
  salirFilaHabilitado: true,
  cargada: false,
}));

const aplicar = (c: Configuracion) =>
  useConfiguracion.setState({
    reservasHabilitadas: c.reservasHabilitadas,
    salirFilaHabilitado: c.salirFilaHabilitado,
    cargada: true,
  });

/** Al llegar configuracion:actualizada por Socket.IO, o al guardar desde el admin. */
export async function refrescarConfiguracion(datos?: Configuracion) {
  if (datos) return aplicar(datos);
  try {
    aplicar((await apiPublica.get<Configuracion>('/configuracion')).data);
  } catch {
    /* se reintenta en la próxima sincronización */
  }
}

export function SincronizarConfiguracion() {
  const q = useQuery({
    queryKey: ['configuracion'],
    queryFn: async () => (await apiPublica.get<Configuracion>('/configuracion')).data,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (q.data) aplicar(q.data);
  }, [q.data]);
  return null;
}
