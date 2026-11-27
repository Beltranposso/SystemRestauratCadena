import { useMemo, useRef } from 'react';
import {
  consultaApi,
  registrarConsulta,
  tagsDeClave,
} from '../infrastructure/consulta-api';
import { useAppDispatch } from './store';

export { useMutation } from './mutaciones';

type QueryKey = readonly unknown[];

export interface UseQueryOptions<TData, TSelected = TData> {
  queryKey: QueryKey;
  queryFn: () => Promise<TData> | TData;
  enabled?: boolean;
  refetchInterval?: number | false;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
  select?: (data: TData) => TSelected;
}

export interface UseQueryResult<TData> {
  data: TData | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
}

/**
 * Adaptador de `useQuery` sobre RTK Query. Mantiene los queryKey existentes como
 * entradas de caché y convierte las opciones a las de `useQuery` de RTK Query.
 */
export function useQuery<TData, TSelected = TData>(
  opciones: UseQueryOptions<TData, TSelected>,
): UseQueryResult<TSelected> {
  const clave = JSON.stringify(opciones.queryKey);
  const consultaRef = useRef(opciones.queryFn);
  consultaRef.current = opciones.queryFn;
  registrarConsulta(clave, () => consultaRef.current());

  const seleccionRef = useRef(opciones.select);
  seleccionRef.current = opciones.select;

  const seleccionar = seleccionRef.current;
  const resultado = consultaApi.useConsultaQuery({ clave }, {
    skip: opciones.enabled === false,
    pollingInterval:
      typeof opciones.refetchInterval === 'number' ? opciones.refetchInterval : undefined,
    refetchOnMountOrArgChange:
      opciones.staleTime === undefined ? undefined : opciones.staleTime / 1000,
    refetchOnFocus: opciones.refetchOnWindowFocus,
    selectFromResult: seleccionar
      ? (estado: unknown) => {
          const e = estado as { data?: TData };
          return {
            ...e,
            data: e.data === undefined ? undefined : seleccionRef.current?.(e.data),
          };
        }
      : undefined,
  }) as unknown as UseQueryResult<TSelected>;

  return resultado;
}

export interface FiltroInvalidacion {
  queryKey?: QueryKey;
}

/** Sustituto de `useQueryClient`, respaldado por el dispatch del store. */
export function useQueryClient() {
  const dispatch = useAppDispatch();
  return useMemo(
    () => ({
      invalidateQueries: async (filtro: FiltroInvalidacion = {}) => {
        dispatch(consultaApi.util.invalidateTags(tagsDeClave(JSON.stringify(filtro.queryKey ?? []))));
      },
      setQueryData: <T>(queryKey: QueryKey, actualizador: T | ((anterior: T) => T)) => {
        const clave = JSON.stringify(queryKey);
        dispatch(
          consultaApi.util.updateQueryData('consulta', { clave }, (borrador: unknown) => {
            if (typeof actualizador === 'function')
              return (actualizador as (anterior: unknown) => unknown)(borrador);
            return actualizador;
          }),
        );
      },
    }),
    [dispatch],
  );
}
