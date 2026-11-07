import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { crearModulo } from '../../http/ruta';
import { booleanoQuery, hora, idEntero, paramsId, parcial } from '../../http/esquemas';
import { HttpError } from '../../utils/http-error';
import {
  asegurarPais,
  asegurarSede,
  invalidarCacheSedes,
  paisDelUsuario,
  whereSedesDelAlcance,
} from '../../auth/alcance';

export const moduloGeografia = crearModulo('Países, ciudades y sedes');
const { ruta } = moduloGeografia;

const zonaHorariaValida = z.string().refine((z) => {
  try {
    new Intl.DateTimeFormat('es', { timeZone: z });
    return true;
  } catch {
    return false;
  }
}, 'Zona horaria IANA inválida (ej. America/Bogota)');

// ───────────────────────────── Países ─────────────────────────────

const cuerpoPais = z.object({
  codigoIso: z.string().trim().toUpperCase().length(2),
  nombre: z.string().trim().min(2).max(80),
  moneda: z.string().trim().toUpperCase().length(3),
  tasaUsd: z.coerce.number().positive().describe('Unidades de moneda local por 1 USD'),
  tasaImpuesto: z.coerce.number().min(0).max(0.99).describe('0.08 = 8 %'),
});

ruta(
  { metodo: 'get', ruta: '/paises', resumen: 'Listar países visibles', auth: 'personal' },
  async ({ auth }) => {
    const propio = await paisDelUsuario(auth);
    return prisma.pais.findMany({
      where: propio === null ? {} : { id: propio },
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { ciudades: true } } },
    });
  },
);

ruta(
  {
    metodo: 'post',
    ruta: '/paises',
    resumen: 'Crear país',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL'],
    body: cuerpoPais,
    status: 201,
  },
  async ({ body }) => prisma.pais.create({ data: body }),
);

ruta(
  {
    metodo: 'patch',
    ruta: '/paises/:id',
    resumen: 'Editar país (tasa de cambio, impuesto…)',
    descripcion:
      'Cambiar la tasa no altera pedidos ya registrados: cada pedido guarda su total en USD.',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL'],
    params: paramsId,
    body: parcial(cuerpoPais),
  },
  async ({ params, body }) => {
    const pais = await prisma.pais.update({ where: { id: params.id }, data: body });
    invalidarCacheSedes();
    return pais;
  },
);

// ───────────────────────────── Ciudades ─────────────────────────────

ruta(
  {
    metodo: 'get',
    ruta: '/ciudades',
    resumen: 'Listar ciudades visibles',
    auth: 'personal',
    query: z.object({ paisId: idEntero.optional() }),
  },
  async ({ auth, query }) => {
    if (query.paisId) await asegurarPais(auth, query.paisId);
    const propio = await paisDelUsuario(auth);
    return prisma.ciudad.findMany({
      where: {
        ...(query.paisId ? { paisId: query.paisId } : {}),
        ...(propio !== null ? { paisId: propio } : {}),
        ...(auth.sedeId && auth.rol !== 'GERENTE_PAIS'
          ? { sedes: { some: { id: auth.sedeId } } }
          : {}),
      },
      orderBy: [{ paisId: 'asc' }, { nombre: 'asc' }],
    });
  },
);

ruta(
  {
    metodo: 'post',
    ruta: '/ciudades',
    resumen: 'Crear ciudad',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL'],
    status: 201,
    body: z.object({ paisId: idEntero, nombre: z.string().trim().min(2).max(80) }),
  },
  async ({ body }) => prisma.ciudad.create({ data: body }),
);

ruta(
  {
    metodo: 'patch',
    ruta: '/ciudades/:id',
    resumen: 'Renombrar ciudad',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL'],
    params: paramsId,
    body: z.object({ nombre: z.string().trim().min(2).max(80) }),
  },
  async ({ params, body }) => prisma.ciudad.update({ where: { id: params.id }, data: body }),
);

// ───────────────────────────── Sedes ─────────────────────────────

const incluirSede = { ciudad: { include: { pais: true } } } as const;

const baseSede = z.object({
  ciudadId: idEntero,
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,12}$/, 'Solo letras, números y guiones'),
  nombre: z.string().trim().min(3).max(120),
  direccion: z.string().trim().min(3).max(200),
  zonaHoraria: zonaHorariaValida,
  prefijoPedido: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,3}$/),
  horaApertura: hora.default('12:00'),
  horaCierre: hora.default('22:30'),
  duracionReservaMin: z.number().int().min(30).max(240).default(90),
  horasMinimasCancelacion: z.number().int().min(0).max(72).default(2),
  activa: z.boolean().default(true),
});
const cuerpoSede = baseSede.refine((s) => s.horaApertura < s.horaCierre, {
  message: 'La apertura debe ser antes del cierre',
  path: ['horaCierre'],
});

ruta(
  {
    metodo: 'get',
    ruta: '/sedes',
    resumen: 'Listar sedes visibles',
    auth: 'personal',
    query: z.object({
      paisId: idEntero.optional(),
      ciudadId: idEntero.optional(),
      activa: booleanoQuery.optional(),
    }),
  },
  async ({ auth, query }) =>
    prisma.sede.findMany({
      where: {
        AND: [
          whereSedesDelAlcance(auth),
          query.paisId ? { ciudad: { paisId: query.paisId } } : {},
          query.ciudadId ? { ciudadId: query.ciudadId } : {},
          query.activa !== undefined ? { activa: query.activa } : {},
        ],
      },
      include: incluirSede,
      orderBy: { codigo: 'asc' },
    }),
);

ruta(
  {
    metodo: 'get',
    ruta: '/sedes/publicas',
    resumen: 'Sedes activas para el portal de reservas',
    auth: 'publico',
    query: z.object({ paisId: idEntero.optional() }),
  },
  async ({ query }) =>
    prisma.sede.findMany({
      where: { activa: true, ...(query.paisId ? { ciudad: { paisId: query.paisId } } : {}) },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        direccion: true,
        zonaHoraria: true,
        horaApertura: true,
        horaCierre: true,
        duracionReservaMin: true,
        horasMinimasCancelacion: true,
        ciudad: {
          select: {
            nombre: true,
            pais: { select: { nombre: true, codigoIso: true, moneda: true } },
          },
        },
      },
      orderBy: { codigo: 'asc' },
    }),
);

ruta(
  {
    metodo: 'get',
    ruta: '/sedes/:id',
    resumen: 'Detalle de sede',
    auth: 'personal',
    params: paramsId,
  },
  async ({ auth, params }) => {
    await asegurarSede(auth, params.id);
    return prisma.sede.findUniqueOrThrow({ where: { id: params.id }, include: incluirSede });
  },
);

ruta(
  {
    metodo: 'post',
    ruta: '/sedes',
    resumen: 'Crear sede',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL'],
    body: cuerpoSede,
    status: 201,
  },
  async ({ body }) => {
    const sede = await prisma.sede.create({ data: body, include: incluirSede });
    invalidarCacheSedes();
    return sede;
  },
);

ruta(
  {
    metodo: 'patch',
    ruta: '/sedes/:id',
    resumen: 'Editar sede',
    descripcion:
      'El gerente de país puede editar las sedes de su país, pero no moverlas de ciudad.',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL', 'GERENTE_PAIS'],
    params: paramsId,
    body: parcial(baseSede),
  },
  async ({ auth, params, body }) => {
    const actual = await asegurarSede(auth, params.id);
    if (body.ciudadId && auth.rol !== 'ADMIN_GLOBAL')
      throw HttpError.forbidden('Solo el admin global mueve sedes de ciudad');
    const apertura = body.horaApertura ?? actual.horaApertura;
    const cierre = body.horaCierre ?? actual.horaCierre;
    if (apertura >= cierre) throw HttpError.badRequest('La apertura debe ser antes del cierre');
    const sede = await prisma.sede.update({
      where: { id: params.id },
      data: body,
      include: incluirSede,
    });
    invalidarCacheSedes();
    return sede;
  },
);
