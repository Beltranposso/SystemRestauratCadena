import { useMemo } from 'react';
import type { Cliente, Dispositivo, Usuario } from '../domain/tipos';
import {
  cerrarCliente,
  cerrarPersonal,
  fijarCliente,
  fijarDispositivo,
  fijarPersonal,
  marcarClienteLista,
  marcarPersonalLista,
  olvidarDispositivo,
  store,
  useAppDispatch,
  useAppSelector,
} from './store';

/** Hook de compatibilidad con el aspecto de los antiguos stores de Zustand. */
export interface SesionPersonalHook {
  token: string | null;
  usuario: Usuario | null;
  lista: boolean;
  fijar: (token: string, usuario: Usuario) => void;
  cerrar: () => void;
  marcarLista: () => void;
}

export function usePersonal(): SesionPersonalHook;
export function usePersonal<T>(selector: (estado: SesionPersonalHook) => T): T;
export function usePersonal<T>(selector?: (estado: SesionPersonalHook) => T): T | SesionPersonalHook {
  const estado = useAppSelector((s) => s.personal);
  const dispatch = useAppDispatch();
  const api = useMemo<SesionPersonalHook>(
    () => ({
      ...estado,
      fijar: (token, usuario) => dispatch(fijarPersonal({ token, usuario })),
      cerrar: () => dispatch(cerrarPersonal()),
      marcarLista: () => dispatch(marcarPersonalLista()),
    }),
    [estado, dispatch],
  );
  return selector ? selector(api) : api;
}

export interface SesionClienteHook {
  token: string | null;
  cliente: Cliente | null;
  lista: boolean;
  fijar: (token: string, cliente: Cliente) => void;
  cerrar: () => void;
  marcarLista: () => void;
}

export function useCliente(): SesionClienteHook;
export function useCliente<T>(selector: (estado: SesionClienteHook) => T): T;
export function useCliente<T>(selector?: (estado: SesionClienteHook) => T): T | SesionClienteHook {
  const estado = useAppSelector((s) => s.cliente);
  const dispatch = useAppDispatch();
  const api = useMemo<SesionClienteHook>(
    () => ({
      ...estado,
      fijar: (token, cliente) => dispatch(fijarCliente({ token, cliente })),
      cerrar: () => dispatch(cerrarCliente()),
      marcarLista: () => dispatch(marcarClienteLista()),
    }),
    [estado, dispatch],
  );
  return selector ? selector(api) : api;
}

export interface SesionDispositivoHook {
  token: string | null;
  dispositivo: Dispositivo | null;
  revocado: boolean;
  fijar: (token: string, dispositivo: Dispositivo) => void;
  olvidar: (revocado?: boolean) => void;
}

export function useDispositivo(): SesionDispositivoHook;
export function useDispositivo<T>(selector: (estado: SesionDispositivoHook) => T): T;
export function useDispositivo<T>(
  selector?: (estado: SesionDispositivoHook) => T,
): T | SesionDispositivoHook {
  const estado = useAppSelector((s) => s.dispositivo);
  const dispatch = useAppDispatch();
  const api = useMemo<SesionDispositivoHook>(
    () => ({
      ...estado,
      fijar: (token, dispositivo) => dispatch(fijarDispositivo({ token, dispositivo })),
      olvidar: (revocado = false) => dispatch(olvidarDispositivo(revocado)),
    }),
    [estado, dispatch],
  );
  return selector ? selector(api) : api;
}

export interface MarcaHook {
  marca: import('../domain/tipos').Marca;
}

/** Lectura puntual fuera de React (por ejemplo, colores de gráficas). */
export function marcaActual(): import('../domain/tipos').Marca {
  return store.getState().marca.marca;
}

export function useMarca(): MarcaHook;
export function useMarca<T>(selector: (estado: MarcaHook) => T): T;
export function useMarca<T>(selector?: (estado: MarcaHook) => T): T | MarcaHook {
  const marca = useAppSelector((s) => s.marca.marca);
  const estado = useMemo<MarcaHook>(() => ({ marca }), [marca]);
  return selector ? selector(estado) : estado;
}

export type ConfiguracionHook = import('../domain/tipos').Configuracion & { cargada: boolean };

export function useConfiguracion(): ConfiguracionHook;
export function useConfiguracion<T>(selector: (estado: ConfiguracionHook) => T): T;
export function useConfiguracion<T>(
  selector?: (estado: ConfiguracionHook) => T,
): T | ConfiguracionHook {
  const estado = useAppSelector((s) => s.configuracion);
  return selector ? selector(estado) : estado;
}
