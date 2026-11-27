import { useCallback, useId, useRef } from 'react';
import { consultaApi, registrarMutacion } from '../infrastructure/consulta-api';

interface Callbacks<TData, TVariables> {
  onSuccess?: (datos: TData, variables: TVariables) => void;
  onError?: (error: unknown, variables: TVariables) => void;
  onSettled?: (datos: TData | undefined, error: unknown, variables: TVariables) => void;
}

export interface UseMutationOptions<TData, TVariables> extends Callbacks<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData> | TData;
}

export interface UseMutationResult<TData, TVariables> {
  mutate: (variables: TVariables, callbacks?: Callbacks<TData, TVariables>) => void;
  mutateAsync: (variables: TVariables, callbacks?: Callbacks<TData, TVariables>) => Promise<TData>;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  variables: TVariables | undefined;
  reset: () => void;
  data: TData | undefined;
}

/** Adaptador de `useMutation` sobre RTK Query, con las mismas callbacks de React Query. */
export function useMutation<TData = unknown, TVariables = void>(
  opciones: UseMutationOptions<TData, TVariables>,
): UseMutationResult<TData, TVariables> {
  const id = useId();
  const opcionesRef = useRef(opciones);
  opcionesRef.current = opciones;
  registrarMutacion(id, (variables) => opcionesRef.current.mutationFn(variables as TVariables));

  const [ejecutar, estado] = consultaApi.useEjecutarMutation();

  const mutateAsync = useCallback(
    async (variables: TVariables, llamada?: Callbacks<TData, TVariables>) => {
      const actuales = opcionesRef.current;
      try {
        const datos = (await ejecutar({ id, variables }).unwrap()) as TData;
        actuales.onSuccess?.(datos, variables);
        llamada?.onSuccess?.(datos, variables);
        actuales.onSettled?.(datos, undefined, variables);
        llamada?.onSettled?.(datos, undefined, variables);
        return datos;
      } catch (error) {
        actuales.onError?.(error, variables);
        llamada?.onError?.(error, variables);
        actuales.onSettled?.(undefined, error, variables);
        llamada?.onSettled?.(undefined, error, variables);
        throw error;
      }
    },
    [ejecutar, id],
  );

  const mutate = useCallback(
    (variables: TVariables, llamada?: Callbacks<TData, TVariables>) => {
      void mutateAsync(variables, llamada).catch(() => undefined);
    },
    [mutateAsync],
  );

  return {
    ...(estado as unknown as Omit<UseMutationResult<TData, TVariables>, 'mutate' | 'mutateAsync' | 'isPending' | 'variables'>),
    mutate,
    mutateAsync,
    isPending: estado.isLoading,
    variables: estado.originalArgs?.variables as TVariables | undefined,
  };
}
