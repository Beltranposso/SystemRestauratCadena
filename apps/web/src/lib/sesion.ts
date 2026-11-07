import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { create } from 'zustand';
import type { Cliente, Dispositivo, Usuario } from './tipos';

/**
 * Tres sesiones independientes, una por tipo de pantalla:
 *  - personal: dashboard, caja y cocina (JWT en memoria + refresh en cookie httpOnly)
 *  - cliente:  portal de reservas (igual, con su propia cookie)
 *  - dispositivo: pantalla de clientes y kiosco (token guardado en el equipo)
 * El access token nunca se guarda en localStorage: al recargar se renueva con la cookie.
 */

const BASE = import.meta.env.VITE_API_URL ?? '/api';

interface SesionPersonal {
  token: string | null;
  usuario: Usuario | null;
  lista: boolean; // ya se intentó restaurar la sesión al cargar
  fijar: (token: string, usuario: Usuario) => void;
  cerrar: () => void;
  marcarLista: () => void;
}

export const usePersonal = create<SesionPersonal>((set) => ({
  token: null,
  usuario: null,
  lista: false,
  fijar: (token, usuario) => set({ token, usuario, lista: true }),
  cerrar: () => set({ token: null, usuario: null, lista: true }),
  marcarLista: () => set({ lista: true }),
}));

interface SesionCliente {
  token: string | null;
  cliente: Cliente | null;
  lista: boolean;
  fijar: (token: string, cliente: Cliente) => void;
  cerrar: () => void;
  marcarLista: () => void;
}

export const useCliente = create<SesionCliente>((set) => ({
  token: null,
  cliente: null,
  lista: false,
  fijar: (token, cliente) => set({ token, cliente, lista: true }),
  cerrar: () => set({ token: null, cliente: null, lista: true }),
  marcarLista: () => set({ lista: true }),
}));

const CLAVE_DISPOSITIVO = 'fogon.dispositivo';

interface SesionDispositivo {
  token: string | null;
  dispositivo: Dispositivo | null;
  /** El servidor rechazó el token: el equipo fue desactivado, eliminado o se le cambió el token */
  revocado: boolean;
  fijar: (token: string, dispositivo: Dispositivo) => void;
  olvidar: (revocado?: boolean) => void;
}

function leerDispositivo(): { token: string | null; dispositivo: Dispositivo | null } {
  try {
    const crudo = localStorage.getItem(CLAVE_DISPOSITIVO);
    return crudo ? JSON.parse(crudo) : { token: null, dispositivo: null };
  } catch {
    return { token: null, dispositivo: null };
  }
}

export const useDispositivo = create<SesionDispositivo>((set) => ({
  ...leerDispositivo(),
  revocado: false,
  fijar: (token, dispositivo) => {
    try {
      localStorage.setItem(CLAVE_DISPOSITIVO, JSON.stringify({ token, dispositivo }));
    } catch {
      /* sin almacenamiento: la sesión dura lo que la pestaña */
    }
    set({ token, dispositivo, revocado: false });
  },
  olvidar: (revocado = false) => {
    try {
      localStorage.removeItem(CLAVE_DISPOSITIVO);
    } catch {
      /* nada */
    }
    set({ token: null, dispositivo: null, revocado });
  },
}));

// ───────────────────────────── Clientes HTTP ─────────────────────────────

export interface ErrorApi {
  code: string;
  message: string;
  details?: unknown;
}

/** Mensaje legible de cualquier error de la API. */
export function mensajeError(err: unknown): string {
  if (err instanceof AxiosError) {
    const e = (err.response?.data as { error?: ErrorApi } | undefined)?.error;
    if (e?.details && Array.isArray(e.details) && e.code === 'VALIDACION') {
      return (e.details as { mensaje: string }[]).map((d) => d.mensaje).join('. ');
    }
    if (e?.message) return e.message;
    if (!err.response) return 'No hay conexión con el servidor';
  }
  return 'Algo salió mal. Intenta de nuevo.';
}

export const codigoError = (err: unknown) =>
  err instanceof AxiosError
    ? (err.response?.data as { error?: ErrorApi } | undefined)?.error?.code
    : undefined;

export const detallesError = <T>(err: unknown) =>
  err instanceof AxiosError
    ? ((err.response?.data as { error?: ErrorApi } | undefined)?.error?.details as T | undefined)
    : undefined;

type ConReintento = InternalAxiosRequestConfig & { _reintento?: boolean };

/**
 * Cliente con renovación automática: si la API responde TOKEN_EXPIRADO, pide un token
 * nuevo (una sola vez aunque fallen varias peticiones a la vez) y repite la petición.
 */
function clienteConSesion(
  obtenerToken: () => string | null,
  renovar: () => Promise<string | null>,
): AxiosInstance {
  const cliente = axios.create({ baseURL: BASE, withCredentials: true });
  let enCurso: Promise<string | null> | null = null;

  cliente.interceptors.request.use((config) => {
    const token = obtenerToken();
    if (token) config.headers.set('Authorization', `Bearer ${token}`);
    return config;
  });

  cliente.interceptors.response.use(undefined, async (error: AxiosError) => {
    const original = error.config as ConReintento | undefined;
    if (
      error.response?.status === 401 &&
      original &&
      !original._reintento &&
      codigoError(error) === 'TOKEN_EXPIRADO'
    ) {
      original._reintento = true;
      enCurso ??= renovar().finally(() => {
        enCurso = null;
      });
      const nuevo = await enCurso;
      if (nuevo) {
        original.headers.set('Authorization', `Bearer ${nuevo}`);
        return cliente(original);
      }
    }
    throw error;
  });
  return cliente;
}

export async function renovarPersonal(): Promise<string | null> {
  try {
    const { data } = await axios.post(`${BASE}/auth/refresh`, null, { withCredentials: true });
    usePersonal.getState().fijar(data.accessToken, data.usuario);
    return data.accessToken;
  } catch {
    usePersonal.getState().cerrar();
    return null;
  }
}

export async function renovarCliente(): Promise<string | null> {
  try {
    const { data } = await axios.post(`${BASE}/clientes/auth/refresh`, null, {
      withCredentials: true,
    });
    useCliente.getState().fijar(data.accessToken, data.cliente);
    return data.accessToken;
  } catch {
    useCliente.getState().cerrar();
    return null;
  }
}

export const apiPersonal = clienteConSesion(() => usePersonal.getState().token, renovarPersonal);
export const apiCliente = clienteConSesion(() => useCliente.getState().token, renovarCliente);

export const apiDispositivo = axios.create({ baseURL: BASE });
apiDispositivo.interceptors.request.use((config) => {
  const token = useDispositivo.getState().token;
  if (token) config.headers.set('X-Device-Token', token);
  return config;
});
apiDispositivo.interceptors.response.use(undefined, (error) => {
  if (axios.isAxiosError(error) && error.response?.status === 401)
    useDispositivo.getState().olvidar(true);
  return Promise.reject(error);
});

export const apiPublica = axios.create({ baseURL: BASE, withCredentials: true });

export async function cerrarSesionPersonal() {
  await axios.post(`${BASE}/auth/logout`, null, { withCredentials: true }).catch(() => undefined);
  usePersonal.getState().cerrar();
}

export async function cerrarSesionCliente() {
  await axios
    .post(`${BASE}/clientes/auth/logout`, null, { withCredentials: true })
    .catch(() => undefined);
  useCliente.getState().cerrar();
}
