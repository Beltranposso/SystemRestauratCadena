import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { esTest } from '../../config/env';
import { prisma } from '../../db/prisma';
import { crearModulo } from '../../http/ruta';
import { HttpError } from '../../utils/http-error';
import {
  borrarCookieRefresh,
  COOKIES,
  emitirRefresh,
  firmarAcceso,
  hashPassword,
  ponerCookieRefresh,
  revocarRefresh,
  rotarRefresh,
  verificarPassword,
} from '../../auth/tokens';

/** 10 intentos de login por IP cada 15 minutos (desactivado en pruebas). */
const limiteLogin = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  skip: () => esTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'DEMASIADOS_INTENTOS', message: 'Demasiados intentos, espera unos minutos' },
    });
  },
});

const credenciales = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

const camposUsuario = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  paisId: true,
  sedeId: true,
  activo: true,
} as const;

async function sesionUsuario(usuarioId: string) {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { ...camposUsuario, sede: { select: { id: true, codigo: true, nombre: true } } },
  });
  if (!usuario || !usuario.activo)
    throw HttpError.unauthorized('La cuenta no existe o está inactiva');
  const accessToken = firmarAcceso({
    tipo: 'usuario',
    sub: usuario.id,
    rol: usuario.rol,
    paisId: usuario.paisId,
    sedeId: usuario.sedeId,
  });
  return { accessToken, usuario };
}

async function sesionCliente(clienteId: string) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { id: true, nombre: true, email: true, telefono: true },
  });
  if (!cliente) throw HttpError.unauthorized('La cuenta no existe');
  return { accessToken: firmarAcceso({ tipo: 'cliente', sub: cliente.id }), cliente };
}

// ───────────────────────────── Personal ─────────────────────────────

export const moduloAuth = crearModulo('Autenticación del personal');
const { ruta } = moduloAuth;

ruta(
  {
    metodo: 'post',
    ruta: '/auth/login',
    resumen: 'Iniciar sesión (personal)',
    descripcion:
      'Devuelve un access token (15 min) y deja el refresh token en una cookie httpOnly.',
    auth: 'publico',
    body: credenciales,
    middlewares: [limiteLogin],
  },
  async ({ body, res }) => {
    const usuario = await prisma.usuario.findUnique({ where: { email: body.email } });
    const ok = await verificarPassword(body.password, usuario?.passwordHash);
    if (!ok || !usuario)
      throw new HttpError(401, 'CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos');
    if (!usuario.activo) throw HttpError.forbidden('Tu cuenta está desactivada');
    ponerCookieRefresh(res, 'personal', await emitirRefresh({ usuarioId: usuario.id }));
    return sesionUsuario(usuario.id);
  },
);

ruta(
  {
    metodo: 'post',
    ruta: '/auth/refresh',
    resumen: 'Renovar el access token (personal)',
    descripcion:
      'Usa la cookie de refresh y la rota. Reutilizar una cookie vieja cierra todas las sesiones.',
    auth: 'publico',
  },
  async ({ req, res }) => {
    const { dueno, nuevo } = await rotarRefresh(req.cookies?.[COOKIES.personal.nombre]);
    if (!('usuarioId' in dueno)) throw new HttpError(401, 'SESION_INVALIDA', 'Sesión inválida');
    const sesion = await sesionUsuario(dueno.usuarioId);
    ponerCookieRefresh(res, 'personal', nuevo);
    return sesion;
  },
);

ruta(
  { metodo: 'post', ruta: '/auth/logout', resumen: 'Cerrar sesión (personal)', auth: 'publico' },
  async ({ req, res }) => {
    await revocarRefresh(req.cookies?.[COOKIES.personal.nombre]);
    borrarCookieRefresh(res, 'personal');
  },
);

ruta(
  { metodo: 'get', ruta: '/auth/me', resumen: 'Usuario actual', auth: 'personal' },
  async ({ auth }) => {
    const usuario = await prisma.usuario.findUnique({
      where: { id: auth.id },
      select: {
        ...camposUsuario,
        pais: { select: { id: true, nombre: true, codigoIso: true } },
        sede: { select: { id: true, codigo: true, nombre: true, zonaHoraria: true } },
      },
    });
    if (!usuario) throw HttpError.unauthorized('La cuenta no existe');
    return usuario;
  },
);

ruta(
  {
    metodo: 'post',
    ruta: '/auth/cambiar-password',
    resumen: 'Cambiar mi contraseña',
    auth: 'personal',
    body: z.object({ actual: z.string().min(1), nueva: z.string().min(8).max(100) }),
  },
  async ({ auth, body }) => {
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: auth.id } });
    if (!(await verificarPassword(body.actual, usuario.passwordHash))) {
      throw new HttpError(401, 'CREDENCIALES_INVALIDAS', 'La contraseña actual no coincide');
    }
    await prisma.usuario.update({
      where: { id: auth.id },
      data: { passwordHash: await hashPassword(body.nueva) },
    });
  },
);

// ───────────────────────────── Clientes ─────────────────────────────

export const moduloAuthClientes = crearModulo('Autenticación de clientes');

moduloAuthClientes.ruta(
  {
    metodo: 'post',
    ruta: '/clientes/auth/registro',
    resumen: 'Registrarse en el portal de reservas',
    auth: 'publico',
    status: 201,
    body: z.object({
      nombre: z.string().trim().min(2).max(120),
      email: z.string().trim().toLowerCase().email().max(160),
      telefono: z
        .string()
        .trim()
        .regex(/^\+?[0-9 ()-]{7,20}$/, 'Teléfono inválido'),
      password: z.string().min(8, 'Mínimo 8 caracteres').max(100),
    }),
    middlewares: [limiteLogin],
  },
  async ({ body, res }) => {
    const existe = await prisma.cliente.findUnique({ where: { email: body.email } });
    if (existe) throw HttpError.conflict('Ya existe una cuenta con ese email');
    const cliente = await prisma.cliente.create({
      data: {
        nombre: body.nombre,
        email: body.email,
        telefono: body.telefono,
        passwordHash: await hashPassword(body.password),
      },
    });
    ponerCookieRefresh(res, 'cliente', await emitirRefresh({ clienteId: cliente.id }));
    return sesionCliente(cliente.id);
  },
);

moduloAuthClientes.ruta(
  {
    metodo: 'post',
    ruta: '/clientes/auth/login',
    resumen: 'Iniciar sesión (cliente)',
    auth: 'publico',
    body: credenciales,
    middlewares: [limiteLogin],
  },
  async ({ body, res }) => {
    const cliente = await prisma.cliente.findUnique({ where: { email: body.email } });
    if (!(await verificarPassword(body.password, cliente?.passwordHash)) || !cliente) {
      throw new HttpError(401, 'CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos');
    }
    ponerCookieRefresh(res, 'cliente', await emitirRefresh({ clienteId: cliente.id }));
    return sesionCliente(cliente.id);
  },
);

moduloAuthClientes.ruta(
  {
    metodo: 'post',
    ruta: '/clientes/auth/refresh',
    resumen: 'Renovar el access token (cliente)',
    auth: 'publico',
  },
  async ({ req, res }) => {
    const { dueno, nuevo } = await rotarRefresh(req.cookies?.[COOKIES.cliente.nombre]);
    if (!('clienteId' in dueno)) throw new HttpError(401, 'SESION_INVALIDA', 'Sesión inválida');
    const sesion = await sesionCliente(dueno.clienteId);
    ponerCookieRefresh(res, 'cliente', nuevo);
    return sesion;
  },
);

moduloAuthClientes.ruta(
  {
    metodo: 'post',
    ruta: '/clientes/auth/logout',
    resumen: 'Cerrar sesión (cliente)',
    auth: 'publico',
  },
  async ({ req, res }) => {
    await revocarRefresh(req.cookies?.[COOKIES.cliente.nombre]);
    borrarCookieRefresh(res, 'cliente');
  },
);
