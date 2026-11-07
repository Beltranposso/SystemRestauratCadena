import { z } from 'zod';
import { EVENTOS, MARCA_POR_DEFECTO, esHex, evaluarColores } from '@restaurantes/shared';
import { prisma } from '../../db/prisma';
import { crearModulo } from '../../http/ruta';
import { HttpError } from '../../utils/http-error';
import { emitirATodos } from '../../realtime/socket';

/**
 * Apariencia de la app: nombre, logo y colores de la cadena. La lee cualquier pantalla
 * (incluidos kioscos y portal, sin sesión) y solo la cambia el admin global.
 */
export const moduloMarca = crearModulo('Apariencia');
const { ruta } = moduloMarca;

/** ~88 KB de imagen: la web reduce el logo a 320 px antes de subirlo. */
const MAX_LOGO = 120_000;

const campos = {
  id: false,
  nombre: true,
  logo: true,
  colorPrimario: true,
  colorAcento: true,
  actualizadoEn: true,
} as const;

async function leerMarca() {
  return prisma.marca.upsert({ where: { id: 1 }, create: { id: 1 }, update: {}, select: campos });
}

ruta(
  {
    metodo: 'get',
    ruta: '/marca',
    resumen: 'Nombre, logo y colores de la aplicación',
    descripcion: 'Público: lo usan también el kiosco, la pantalla de pedidos y el portal.',
    auth: 'publico',
  },
  async ({ res }) => {
    res.setHeader('Cache-Control', 'no-cache');
    return leerMarca();
  },
);

const color = z
  .string()
  .trim()
  .refine(esHex, 'Usa el formato #RRGGBB')
  .transform((v) => v.toUpperCase());

ruta(
  {
    metodo: 'put',
    ruta: '/marca',
    resumen: 'Cambiar nombre, logo y colores',
    descripcion:
      'Solo el admin global. Los colores deben leerse: texto blanco sobre el primario y texto oscuro sobre el acento con contraste de al menos 3:1 (WCAG AA texto grande). `logo: null` quita el logo.',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL'],
    body: z.object({
      nombre: z.string().trim().min(2).max(40).optional(),
      logo: z
        .string()
        .max(MAX_LOGO, 'El logo pesa demasiado; usa una imagen más pequeña')
        .regex(
          /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/,
          'El logo debe ser PNG, JPG o WebP',
        )
        .nullable()
        .optional(),
      colorPrimario: color.optional(),
      colorAcento: color.optional(),
    }),
  },
  async ({ auth, body }) => {
    const actual = await leerMarca();
    const primario = body.colorPrimario ?? actual.colorPrimario;
    const acento = body.colorAcento ?? actual.colorAcento;
    const e = evaluarColores(primario, acento);
    if (!e.aceptable)
      throw HttpError.unprocessable(
        e.sobrePrimario < 3
          ? 'El color primario es muy claro: el texto blanco de los botones no se leería'
          : 'El color de acento es muy oscuro: el texto de las insignias no se leería',
        { sobrePrimario: e.sobrePrimario, sobreAcento: e.sobreAcento },
      );
    const marca = await prisma.marca.update({
      where: { id: 1 },
      data: { ...body, colorPrimario: primario, colorAcento: acento, actualizadoPor: auth.id },
      select: campos,
    });
    emitirATodos(EVENTOS.marcaActualizada, { actualizadoEn: marca.actualizadoEn });
    return marca;
  },
);

ruta(
  {
    metodo: 'delete',
    ruta: '/marca',
    resumen: 'Volver a la apariencia por defecto',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL'],
  },
  async ({ auth }) => {
    const marca = await prisma.marca.update({
      where: { id: 1 },
      data: { ...MARCA_POR_DEFECTO, logo: null, actualizadoPor: auth.id },
      select: campos,
    });
    emitirATodos(EVENTOS.marcaActualizada, { actualizadoEn: marca.actualizadoEn });
    return marca;
  },
);
