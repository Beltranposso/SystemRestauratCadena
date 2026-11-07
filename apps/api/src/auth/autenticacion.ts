import type { Request } from 'express';
import { prisma } from '../db/prisma';
import { HttpError } from '../utils/http-error';
import type { Auth, AuthDispositivo } from './tipos';
import { sha256, verificarAcceso } from './tokens';

export const CABECERA_DISPOSITIVO = 'x-device-token';

const cacheDispositivos = new Map<string, { auth: AuthDispositivo | null; hasta: number }>();
const TTL_DISPOSITIVO_MS = 30_000;

/** Busca un dispositivo activo por su token (con caché de 30 s para no consultar en cada petición del monitor). */
export async function autenticarDispositivo(token: string): Promise<AuthDispositivo | null> {
  const hash = sha256(token);
  const enCache = cacheDispositivos.get(hash);
  if (enCache && enCache.hasta > Date.now()) return enCache.auth;

  const d = await prisma.dispositivo.findUnique({ where: { tokenHash: hash } });
  const auth: AuthDispositivo | null =
    d && d.activo ? { tipo: 'dispositivo', id: d.id, sedeId: d.sedeId, dispositivo: d.tipo } : null;
  cacheDispositivos.set(hash, { auth, hasta: Date.now() + TTL_DISPOSITIVO_MS });
  // Registro de actividad (como máximo cada 30 s por la caché): permite ver qué equipos se usan
  if (auth)
    void prisma.dispositivo
      .update({ where: { id: auth.id }, data: { ultimaConexionEn: new Date() } })
      .catch(() => undefined);
  return auth;
}

export function invalidarCacheDispositivos() {
  cacheDispositivos.clear();
}

/** Credencial a partir de un JWT (Bearer) — se usa en HTTP y en Socket.IO. */
export function authDesdeJwt(token: string): Auth {
  const p = verificarAcceso(token);
  return p.tipo === 'usuario'
    ? { tipo: 'usuario', id: p.sub, rol: p.rol, paisId: p.paisId, sedeId: p.sedeId }
    : { tipo: 'cliente', id: p.sub };
}

/**
 * Lee la credencial de la petición: `Authorization: Bearer <jwt>` o `X-Device-Token`.
 * Devuelve undefined si no viene ninguna; lanza 401 si viene una inválida.
 */
export async function leerAuth(req: Request): Promise<Auth | undefined> {
  const cabecera = req.headers.authorization;
  if (cabecera?.startsWith('Bearer ')) return authDesdeJwt(cabecera.slice(7).trim());

  const tokenDispositivo = req.headers[CABECERA_DISPOSITIVO];
  if (typeof tokenDispositivo === 'string' && tokenDispositivo) {
    const auth = await autenticarDispositivo(tokenDispositivo);
    if (!auth)
      throw new HttpError(401, 'DISPOSITIVO_INVALIDO', 'Token de dispositivo inválido o inactivo');
    return auth;
  }
  return undefined;
}
