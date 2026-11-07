import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { RolUsuario } from '@prisma/client';
import type { z, ZodType } from 'zod';
import { leerAuth } from '../auth/autenticacion';
import type { Auth, AuthCliente, AuthDispositivo, AuthPersonal } from '../auth/tipos';
import { HttpError } from '../utils/http-error';

/**
 * Definición declarativa de rutas: cada ruta declara su autenticación, roles y esquemas zod.
 * El mismo objeto sirve para (1) registrar la ruta en Express con validación y control de
 * acceso y (2) generar la documentación OpenAPI en /api/docs. Así la doc no se desactualiza.
 */

export type TipoAuth =
  | 'publico'
  | 'personal'
  | 'cliente'
  | 'dispositivo'
  | 'personal-o-dispositivo'
  | 'cliente-opcional';

type AuthPorTipo = {
  publico: undefined;
  personal: AuthPersonal;
  cliente: AuthCliente;
  dispositivo: AuthDispositivo;
  'personal-o-dispositivo': AuthPersonal | AuthDispositivo;
  'cliente-opcional': AuthCliente | undefined;
};

type Inferir<T> = T extends ZodType ? z.output<T> : undefined;
export type Metodo = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface DefRuta<
  K extends TipoAuth,
  B extends ZodType | undefined,
  Q extends ZodType | undefined,
  P extends ZodType | undefined,
> {
  metodo: Metodo;
  /** Ruta estilo Express relativa a /api, p. ej. '/sedes/:sedeId/mesas' */
  ruta: string;
  resumen: string;
  descripcion?: string;
  auth: K;
  /** Solo para auth 'personal' / 'personal-o-dispositivo'. Vacío = cualquier rol del personal. */
  roles?: readonly RolUsuario[];
  /** Solo para 'personal-o-dispositivo' / 'dispositivo': tipos de dispositivo admitidos */
  dispositivos?: readonly ('PANTALLA' | 'KIOSCO')[];
  body?: B;
  query?: Q;
  params?: P;
  /** Status de éxito (200 por defecto; 201 al crear; 204 si el handler no devuelve nada) */
  status?: number;
  middlewares?: RequestHandler[];
}

export interface Ctx<K extends TipoAuth, B, Q, P> {
  req: Request;
  res: Response;
  auth: AuthPorTipo[K];
  body: Inferir<B>;
  query: Inferir<Q>;
  params: Inferir<P>;
}

export interface RutaRegistrada {
  etiqueta: string;
  def: DefRuta<TipoAuth, ZodType | undefined, ZodType | undefined, ZodType | undefined>;
}

/** Registro global que lee el generador de OpenAPI. */
export const registroRutas: RutaRegistrada[] = [];

function comprobarAcceso(def: DefRuta<TipoAuth, never, never, never>, auth: Auth | undefined) {
  const { auth: tipo } = def;
  if (tipo === 'publico') return;
  if (tipo === 'cliente-opcional') {
    if (auth && auth.tipo !== 'cliente') throw HttpError.forbidden('Solo para clientes del portal');
    return;
  }
  if (!auth) throw HttpError.unauthorized();

  const esPersonal = auth.tipo === 'usuario';
  const esDispositivo = auth.tipo === 'dispositivo';
  const admitido =
    (tipo === 'personal' && esPersonal) ||
    (tipo === 'cliente' && auth.tipo === 'cliente') ||
    (tipo === 'dispositivo' && esDispositivo) ||
    (tipo === 'personal-o-dispositivo' && (esPersonal || esDispositivo));
  if (!admitido) throw HttpError.forbidden('Tu tipo de cuenta no puede usar este recurso');

  if (esPersonal && def.roles?.length && !def.roles.includes(auth.rol)) {
    throw HttpError.forbidden('Tu rol no tiene permiso para esta acción');
  }
  if (esDispositivo && def.dispositivos?.length && !def.dispositivos.includes(auth.dispositivo)) {
    throw HttpError.forbidden('Este dispositivo no puede usar este recurso');
  }
}

export function crearModulo(etiqueta: string) {
  const router = Router();

  function ruta<
    K extends TipoAuth,
    B extends ZodType | undefined = undefined,
    Q extends ZodType | undefined = undefined,
    P extends ZodType | undefined = undefined,
  >(def: DefRuta<K, B, Q, P>, handler: (ctx: Ctx<K, B, Q, P>) => Promise<unknown> | unknown) {
    registroRutas.push({ etiqueta, def: def as unknown as RutaRegistrada['def'] });

    const manejador: RequestHandler = async (req, res) => {
      const auth = def.auth === 'publico' ? undefined : await leerAuth(req);
      comprobarAcceso(def as unknown as DefRuta<TipoAuth, never, never, never>, auth);
      req.auth = auth;

      const ctx = {
        req,
        res,
        auth,
        params: def.params ? def.params.parse(req.params) : undefined,
        query: def.query ? def.query.parse(req.query) : undefined,
        body: def.body ? def.body.parse(req.body ?? {}) : undefined,
      } as Ctx<K, B, Q, P>;

      const resultado = await handler(ctx);
      if (res.headersSent) return;
      if (resultado === undefined) {
        res.status(def.status ?? 204).end();
      } else {
        res.status(def.status ?? 200).json(resultado);
      }
    };

    router[def.metodo](def.ruta, ...(def.middlewares ?? []), manejador);
  }

  return { router, ruta };
}
