import { createApi } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn } from '@reduxjs/toolkit/query';
import {
  codigoError,
  detallesError,
  mensajeError,
  normalizarError,
  type ErrorApi,
} from '../application/errores';
import type { Cliente, Usuario } from '../domain/tipos';
import {
  cerrarCliente as cerrarClienteSesion,
  cerrarPersonal as cerrarPersonalSesion,
  despachar,
  estadoSesion,
  fijarCliente as fijarClienteSesion,
  fijarPersonal as fijarPersonalSesion,
  olvidarDispositivo,
} from './sesion-puente';

const BASE = import.meta.env.VITE_API_URL ?? '/api';

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Contexto = 'personal' | 'cliente' | 'dispositivo' | 'publica';

/** Petición genérica que entienden las cuatro APIs de RTK Query. */
export interface Peticion {
  url: string;
  metodo?: Metodo;
  cuerpo?: unknown;
  cabeceras?: Record<string, string>;
  sinAuth?: boolean;
  sinRefresco?: boolean;
}

type Resultado = { data: unknown } | { error: ErrorApi };
type Base = BaseQueryFn<Peticion, unknown, ErrorApi>;

const renovaciones: Partial<Record<'personal' | 'cliente', Promise<string | null>>> = {};

async function renovar(contexto: 'personal' | 'cliente'): Promise<string | null> {
  const enCurso = renovaciones[contexto];
  if (enCurso) return enCurso;
  const promesa = (async () => {
    try {
      const ruta = contexto === 'personal' ? '/auth/refresh' : '/clientes/auth/refresh';
      const respuesta = await fetch(`${BASE}${ruta}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!respuesta.ok) throw new Error('SIN_SESION');
      const datos = (await respuesta.json()) as {
        accessToken: string;
        usuario?: Usuario;
        cliente?: Cliente;
      };
      if (contexto === 'personal' && datos.usuario)
        fijarPersonalSesion(datos.accessToken, datos.usuario);
      if (contexto === 'cliente' && datos.cliente)
        fijarClienteSesion(datos.accessToken, datos.cliente);
      return datos.accessToken;
    } catch {
      if (contexto === 'personal') cerrarPersonalSesion();
      else cerrarClienteSesion();
      return null;
    }
  })().finally(() => {
    delete renovaciones[contexto];
  });
  renovaciones[contexto] = promesa;
  return promesa;
}

/** BaseQuery propio: controla Authorization, cookies, refresh y errores. */
function crearBaseQuery(contexto: Contexto): Base {
  return async (peticion) => {
    const ejecutar = async (reintento: boolean): Promise<Resultado> => {
      const cabeceras = new Headers(peticion.cabeceras ?? {});
      const token =
        contexto === 'publica' ? null : (estadoSesion()[contexto]?.token ?? null);
      if (token && !peticion.sinAuth) {
        if (contexto === 'dispositivo') cabeceras.set('X-Device-Token', token);
        else cabeceras.set('Authorization', `Bearer ${token}`);
      }

      const metodo = peticion.metodo ?? 'GET';
      let cuerpo: BodyInit | undefined;
      if (peticion.cuerpo !== undefined && metodo !== 'GET') {
        if (
          peticion.cuerpo instanceof FormData ||
          peticion.cuerpo instanceof Blob ||
          peticion.cuerpo instanceof URLSearchParams ||
          peticion.cuerpo instanceof ArrayBuffer ||
          typeof peticion.cuerpo === 'string'
        ) {
          cuerpo = peticion.cuerpo as BodyInit;
        } else {
          cuerpo = JSON.stringify(peticion.cuerpo);
          if (!cabeceras.has('Content-Type')) cabeceras.set('Content-Type', 'application/json');
        }
      }

      let respuesta: Response;
      try {
        respuesta = await fetch(`${BASE}${peticion.url}`, {
          method: metodo,
          headers: cabeceras,
          body: cuerpo,
          credentials: contexto === 'dispositivo' ? 'same-origin' : 'include',
        });
      } catch {
        return { error: { status: 0, message: 'No hay conexión con el servidor' } };
      }

      const texto = await respuesta.text();
      let datos: unknown;
      if (texto) {
        try {
          datos = JSON.parse(texto);
        } catch {
          datos = texto;
        }
      }

      if (!respuesta.ok) {
        const error: ErrorApi = {
          status: respuesta.status,
          data: datos,
          code: codigoError(datos) ?? codigoError({ data: datos }),
          message: mensajeError(datos),
          details: undefined,
        };
        const original = extraerDetalles(datos);
        if (original) {
          error.code = original.code ?? error.code;
          error.message = original.message ?? error.message;
          error.details = original.details;
        }
        if (contexto === 'dispositivo' && respuesta.status === 401) olvidarDispositivo(true);
        if (
          contexto !== 'dispositivo' &&
          respuesta.status === 401 &&
          !reintento &&
          !peticion.sinRefresco &&
          error.code === 'TOKEN_EXPIRADO'
        ) {
          const tokenNuevo =
            contexto === 'personal' ? await renovar('personal') : await renovar('cliente');
          if (tokenNuevo) return ejecutar(true);
        }
        return { error };
      }
      return { data: datos };
    };
    return ejecutar(false);
  };
}

function extraerDetalles(datos: unknown): ErrorApi | undefined {
  if (typeof datos !== 'object' || datos === null) return undefined;
  const caja = datos as Record<string, unknown>;
  const error = caja.error;
  if (typeof error !== 'object' || error === null) return undefined;
  return error as ErrorApi;
}

const configuracionApi = {
  keepUnusedDataFor: 0,
  endpoints: (builder: Parameters<Parameters<typeof createApi>[0]['endpoints']>[0]) => ({
    consultar: builder.query<unknown, Peticion>({
      query: (peticion) => ({ ...peticion, metodo: 'GET' as Metodo }),
    }),
    ejecutar: builder.mutation<unknown, Peticion>({
      query: (peticion) => peticion,
    }),
  }),
};

/** Una API de RTK Query por contexto de autenticación. */
export const apiPersonalRTK = createApi({
  reducerPath: 'apiPersonal',
  baseQuery: crearBaseQuery('personal'),
  ...configuracionApi,
});

export const apiClienteRTK = createApi({
  reducerPath: 'apiCliente',
  baseQuery: crearBaseQuery('cliente'),
  ...configuracionApi,
});

export const apiDispositivoRTK = createApi({
  reducerPath: 'apiDispositivo',
  baseQuery: crearBaseQuery('dispositivo'),
  ...configuracionApi,
});

export const apiPublicaRTK = createApi({
  reducerPath: 'apiPublica',
  baseQuery: crearBaseQuery('publica'),
  ...configuracionApi,
});

export const apisRTK = [
  apiPersonalRTK,
  apiClienteRTK,
  apiDispositivoRTK,
  apiPublicaRTK,
] as const;

type ApiRTK = (typeof apisRTK)[number];

interface ConfiguracionLlamada {
  headers?: Record<string, string>;
}

export interface ClienteHttp {
  get<T>(url: string, config?: ConfiguracionLlamada): Promise<{ data: T }>;
  post<T>(url: string, cuerpo?: unknown, config?: ConfiguracionLlamada): Promise<{ data: T }>;
  put<T>(url: string, cuerpo?: unknown, config?: ConfiguracionLlamada): Promise<{ data: T }>;
  patch<T>(url: string, cuerpo?: unknown, config?: ConfiguracionLlamada): Promise<{ data: T }>;
  delete<T>(url: string, config?: ConfiguracionLlamada): Promise<{ data: T }>;
}

/**
 * Pequeño adaptador con la misma forma de los antiguos clientes HTTP.
 * Cada llamada se ejecuta despachando el endpoint correspondiente de RTK Query,
 * de modo que peticiones, estados y caché siguen viviendo en el store de Redux.
 */
function crearCliente(api: ApiRTK): ClienteHttp {
  async function pedir<T>(peticion: Peticion): Promise<{ data: T }> {
    const args = { ...peticion, metodo: peticion.metodo ?? ('GET' as Metodo) };
    const accion =
      args.metodo === 'GET'
        ? api.endpoints.consultar.initiate(args, { forceRefetch: true })
        : api.endpoints.ejecutar.initiate(args);
    const promesa = despachar(accion) as { unwrap: () => Promise<unknown> };
    return { data: (await promesa.unwrap()) as T };
  }
  return {
    get: (url, config) => pedir({ url, metodo: 'GET', cabeceras: config?.headers }),
    post: (url, cuerpo, config) =>
      pedir({ url, metodo: 'POST', cuerpo, cabeceras: config?.headers }),
    put: (url, cuerpo, config) =>
      pedir({ url, metodo: 'PUT', cuerpo, cabeceras: config?.headers }),
    patch: (url, cuerpo, config) =>
      pedir({ url, metodo: 'PATCH', cuerpo, cabeceras: config?.headers }),
    delete: (url, config) => pedir({ url, metodo: 'DELETE', cabeceras: config?.headers }),
  };
}

export const apiPersonal = crearCliente(apiPersonalRTK);
export const apiCliente = crearCliente(apiClienteRTK);
export const apiDispositivo = crearCliente(apiDispositivoRTK);
export const apiPublica = crearCliente(apiPublicaRTK);

export { codigoError, detallesError, mensajeError };
export type { ErrorApi };
export { normalizarError };

export async function renovarPersonal(): Promise<string | null> {
  return renovar('personal');
}

export async function renovarCliente(): Promise<string | null> {
  return renovar('cliente');
}

export async function cerrarSesionPersonal(): Promise<void> {
  await fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(
    () => undefined,
  );
  cerrarPersonalSesion();
}

export async function cerrarSesionCliente(): Promise<void> {
  await fetch(`${BASE}/clientes/auth/logout`, { method: 'POST', credentials: 'include' }).catch(
    () => undefined,
  );
  cerrarClienteSesion();
}
