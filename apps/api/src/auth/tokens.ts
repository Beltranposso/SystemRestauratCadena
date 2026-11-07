import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { CookieOptions, Response } from 'express';
import type { RolUsuario } from '@prisma/client';
import { env, esProduccion } from '../config/env';
import { prisma } from '../db/prisma';
import { HttpError } from '../utils/http-error';

const EMISOR = 'restaurantes-api';

/** Convierte '15m', '7d'… a milisegundos. */
export function duracionMs(valor: string): number {
  const n = Number(valor.slice(0, -1));
  const unidad = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[valor.slice(-1)];
  if (!unidad || !Number.isFinite(n)) throw new Error(`Duración inválida: ${valor}`);
  return n * unidad;
}

export const sha256 = (valor: string) => createHash('sha256').update(valor).digest('hex');

// ─────────────────────────── Contraseñas ───────────────────────────

const COSTO_BCRYPT = 10;
/** Hash ficticio para comparar cuando el email no existe y no revelar qué cuentas existen por tiempo de respuesta. */
const HASH_FICTICIO = bcrypt.hashSync('contraseña-que-nunca-coincide', COSTO_BCRYPT);

export const hashPassword = (password: string) => bcrypt.hash(password, COSTO_BCRYPT);

export async function verificarPassword(password: string, hash: string | null | undefined) {
  const ok = await bcrypt.compare(password, hash ?? HASH_FICTICIO);
  return Boolean(hash) && ok;
}

// ─────────────────────────── Access token (JWT) ───────────────────────────

export type PayloadAcceso =
  | { tipo: 'usuario'; sub: string; rol: RolUsuario; paisId: number | null; sedeId: number | null }
  | { tipo: 'cliente'; sub: string };

export function firmarAcceso(payload: PayloadAcceso): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: Math.floor(duracionMs(env.JWT_ACCESS_TTL) / 1000),
    issuer: EMISOR,
    audience: payload.tipo,
  });
}

export function verificarAcceso(token: string): PayloadAcceso {
  try {
    const datos = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: EMISOR,
      audience: ['usuario', 'cliente'],
    });
    if (typeof datos !== 'object' || !('tipo' in datos)) throw new Error('payload');
    return datos as unknown as PayloadAcceso;
  } catch (e) {
    const expirado = e instanceof jwt.TokenExpiredError;
    throw new HttpError(
      401,
      expirado ? 'TOKEN_EXPIRADO' : 'TOKEN_INVALIDO',
      expirado ? 'La sesión expiró, renueva el token' : 'Token inválido',
    );
  }
}

// ─────────────────────────── Refresh token rotativo ───────────────────────────

export type Dueno = { usuarioId: string } | { clienteId: string };

export const COOKIES = {
  personal: { nombre: 'rt', ruta: '/api/auth' },
  cliente: { nombre: 'rt_cliente', ruta: '/api/clientes/auth' },
} as const;

function opcionesCookie(ruta: string): CookieOptions {
  return {
    httpOnly: true,
    secure: esProduccion,
    sameSite: 'lax',
    path: ruta,
    maxAge: duracionMs(env.JWT_REFRESH_TTL),
  };
}

export async function emitirRefresh(dueno: Dueno): Promise<string> {
  const token = randomBytes(48).toString('base64url');
  await prisma.refreshToken.create({
    data: {
      ...dueno,
      tokenHash: sha256(token),
      expiraEn: new Date(Date.now() + duracionMs(env.JWT_REFRESH_TTL)),
    },
  });
  return token;
}

export function ponerCookieRefresh(res: Response, tipo: keyof typeof COOKIES, token: string) {
  res.cookie(COOKIES[tipo].nombre, token, opcionesCookie(COOKIES[tipo].ruta));
}

export function borrarCookieRefresh(res: Response, tipo: keyof typeof COOKIES) {
  const { maxAge: _maxAge, ...opciones } = opcionesCookie(COOKIES[tipo].ruta);
  res.clearCookie(COOKIES[tipo].nombre, opciones);
}

/**
 * Canjea un refresh token por uno nuevo (rotación). Si alguien presenta un token ya
 * usado, se asume robo: se revocan todas las sesiones de ese dueño.
 */
export async function rotarRefresh(
  token: string | undefined,
): Promise<{ dueno: Dueno; nuevo: string }> {
  if (!token) throw HttpError.unauthorized('No hay sesión activa');
  const registro = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!registro) throw new HttpError(401, 'SESION_INVALIDA', 'Sesión inválida');

  const dueno: Dueno = registro.usuarioId
    ? { usuarioId: registro.usuarioId }
    : { clienteId: registro.clienteId! };

  // updateMany con revocadoEn: null hace el canje atómico: solo una petición lo gana.
  const canje = await prisma.refreshToken.updateMany({
    where: { id: registro.id, revocadoEn: null, expiraEn: { gt: new Date() } },
    data: { revocadoEn: new Date() },
  });

  if (canje.count === 0) {
    if (registro.revocadoEn) await revocarTodas(dueno);
    throw new HttpError(401, 'SESION_INVALIDA', 'La sesión expiró o fue cerrada');
  }

  return { dueno, nuevo: await emitirRefresh(dueno) };
}

export async function revocarRefresh(token: string | undefined) {
  if (!token) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(token), revocadoEn: null },
    data: { revocadoEn: new Date() },
  });
}

export async function revocarTodas(dueno: Dueno) {
  await prisma.refreshToken.updateMany({
    where: { ...dueno, revocadoEn: null },
    data: { revocadoEn: new Date() },
  });
}

/** Token de dispositivo nuevo (se muestra una sola vez; en BD queda el hash). */
export const generarTokenDispositivo = () => `dsp_${randomBytes(24).toString('base64url')}`;
