import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiPersonal, usePersonal } from './sesion';
import type { Sede } from './tipos';
import { hoyEn, sumarDias } from './formato';

/** Sedes dentro del alcance del usuario (el servidor ya filtra por rol). */
export function useSedes() {
  const token = usePersonal((s) => s.token);
  return useQuery({
    queryKey: ['sedes'],
    queryFn: async () => (await apiPersonal.get<Sede[]>('/sedes')).data,
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
  });
}

export interface Filtros {
  paisId?: number;
  ciudadId?: number;
  sedeId?: number;
  desde: string;
  hasta: string;
}

const numero = (v: string | null) => (v ? Number(v) : undefined);

/**
 * Filtros globales del dashboard guardados en la URL (?paisId=&ciudadId=&sedeId=&desde=&hasta=)
 * para poder compartir exactamente la misma vista.
 */
export function useFiltros() {
  const [params, setParams] = useSearchParams();
  const hasta = params.get('hasta') ?? hoyEn('America/Bogota');
  const desde = params.get('desde') ?? sumarDias(hasta, -29);

  const filtros: Filtros = useMemo(
    () => ({
      paisId: numero(params.get('paisId')),
      ciudadId: numero(params.get('ciudadId')),
      sedeId: numero(params.get('sedeId')),
      desde,
      hasta,
    }),
    [params, desde, hasta],
  );

  const cambiar = (cambios: Partial<Record<keyof Filtros, string | number | undefined>>) => {
    setParams(
      (actual) => {
        const nuevo = new URLSearchParams(actual);
        for (const [k, v] of Object.entries(cambios)) {
          if (v === undefined || v === '') nuevo.delete(k);
          else nuevo.set(k, String(v));
        }
        return nuevo;
      },
      { replace: true },
    );
  };

  /** Query string para la API, sin valores vacíos */
  const query = useMemo(() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filtros)) if (v !== undefined) q.set(k, String(v));
    return q.toString();
  }, [filtros]);

  return { filtros, cambiar, query };
}

/**
 * Sede con la que trabaja una pantalla operativa (caja, cocina, mesas, turnos, menú):
 * la elegida en la URL, la del usuario o la primera de su alcance.
 */
export function useSedeTrabajo() {
  const usuario = usePersonal((s) => s.usuario);
  const { data: sedes } = useSedes();
  const [params, setParams] = useSearchParams();
  const elegida = numero(params.get('sedeId'));
  const id = elegida ?? usuario?.sedeId ?? sedes?.[0]?.id;
  const sede = sedes?.find((s) => s.id === id);
  const elegir = (sedeId: number) =>
    setParams(
      (actual) => {
        const nuevo = new URLSearchParams(actual);
        nuevo.set('sedeId', String(sedeId));
        return nuevo;
      },
      { replace: true },
    );
  return { sedeId: id, sede, sedes: sedes ?? [], elegir, puedeElegir: (sedes?.length ?? 0) > 1 };
}
