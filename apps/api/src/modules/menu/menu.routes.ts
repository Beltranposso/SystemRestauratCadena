import express from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { crearModulo } from '../../http/ruta';
import { booleanoQuery, idEntero, monto, paramsId, parcial } from '../../http/esquemas';
import { HttpError } from '../../utils/http-error';
import { MAX_IMAGEN_BYTES, TIPOS_IMAGEN, borrarImagen, guardarImagen } from '../../utils/imagenes';
import { asegurarPais, asegurarSede, obtenerSede, sedesFiltradas } from '../../auth/alcance';
import type { AuthPersonal } from '../../auth/tipos';
import { avisarCambioMenu, menuDeSede } from './menu.service';

export const moduloMenu = crearModulo('Catálogo y menú');
const { ruta } = moduloMenu;

// ───────────────────────────── Menú de una sede ─────────────────────────────

ruta(
  {
    metodo: 'get',
    ruta: '/menu',
    resumen: 'Menú de una sede (caja, kiosco y portal)',
    descripcion:
      'Público: productos y combos que se pueden vender ahora, agrupados por categoría, con precio en moneda local sin impuesto. ' +
      'Un combo se oculta si alguno de sus componentes está agotado. Incluye las promociones vigentes en la hora local de la sede.',
    auth: 'publico',
    query: z.object({ sedeId: idEntero }),
  },
  async ({ query }) => {
    const sede = await obtenerSede(query.sedeId);
    if (!sede.activa) throw HttpError.notFound('Sede');
    return menuDeSede(sede);
  },
);

ruta(
  {
    metodo: 'get',
    ruta: '/sedes/:sedeId/productos',
    resumen: 'Catálogo completo con la configuración de la sede (gestión de menú)',
    descripcion: '`enMenu: false` indica que el producto no se ofrece en esta sede.',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE'],
    params: z.object({ sedeId: idEntero }),
  },
  async ({ auth, params }) => {
    await asegurarSede(auth, params.sedeId);
    const productos = await prisma.producto.findMany({
      include: { categoria: true, sedes: { where: { sedeId: params.sedeId } } },
      orderBy: [{ categoria: { orden: 'asc' } }, { sku: 'asc' }],
    });
    return productos.map(({ sedes, ...p }) => ({
      ...p,
      enMenu: sedes.length > 0,
      precio: sedes[0]?.precio ?? null,
      disponible: sedes[0]?.disponible ?? false,
    }));
  },
);

ruta(
  {
    metodo: 'put',
    ruta: '/sedes/:sedeId/productos/:productoId',
    resumen: 'Agregar o actualizar un producto en el menú de la sede',
    descripcion:
      'El gerente de sede puede marcar disponible/agotado y ajustar el precio de su sede.',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE'],
    params: z.object({ sedeId: idEntero, productoId: idEntero }),
    body: z.object({
      precio: monto.optional(),
      disponible: z.boolean().optional(),
      orden: z.number().int().optional(),
    }),
  },
  async ({ auth, params, body }) => {
    await asegurarSede(auth, params.sedeId);
    const producto = await prisma.producto.findUnique({
      where: { id: params.productoId },
      include: { componentes: true },
    });
    if (!producto) throw HttpError.notFound('Producto');
    const existente = await prisma.productoSede.findUnique({
      where: { sedeId_productoId: { sedeId: params.sedeId, productoId: params.productoId } },
    });
    if (!existente && body.precio === undefined) {
      throw HttpError.badRequest('Para agregar el producto al menú indica su precio');
    }
    if (!existente && producto.esCombo) {
      if (auth.rol !== 'ADMIN_GLOBAL')
        throw HttpError.forbidden('Solo el admin global agrega combos al menú de una sede');
      await asegurarComponentesEnSedes(
        producto.componentes.map((c) => c.productoId),
        [params.sedeId],
      );
    }
    const fila = existente
      ? await prisma.productoSede.update({
          where: { sedeId_productoId: { sedeId: params.sedeId, productoId: params.productoId } },
          data: body,
        })
      : await prisma.productoSede.create({
          data: {
            sedeId: params.sedeId,
            productoId: params.productoId,
            precio: body.precio!,
            disponible: body.disponible ?? true,
            orden: body.orden,
          },
        });
    avisarCambioMenu([params.sedeId]);
    return fila;
  },
);

ruta(
  {
    metodo: 'delete',
    ruta: '/sedes/:sedeId/productos/:productoId',
    resumen: 'Quitar un producto del menú de la sede',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL', 'GERENTE_PAIS'],
    params: z.object({ sedeId: idEntero, productoId: idEntero }),
  },
  async ({ auth, params }) => {
    await asegurarSede(auth, params.sedeId);
    const producto = await prisma.producto.findUnique({ where: { id: params.productoId } });
    if (producto?.esCombo && auth.rol !== 'ADMIN_GLOBAL')
      throw HttpError.forbidden('Solo el admin global quita combos del menú');
    const enCombos = await prisma.comboComponente.findMany({
      where: {
        productoId: params.productoId,
        combo: { sedes: { some: { sedeId: params.sedeId } } },
      },
      select: { combo: { select: { nombre: true } } },
    });
    if (enCombos.length)
      throw HttpError.conflict(
        `El producto es parte de combos de esta sede (${enCombos.map((c) => c.combo.nombre).join(', ')}). Quítalos primero o márcalo agotado.`,
      );
    await prisma.productoSede.deleteMany({ where: params });
    avisarCambioMenu([params.sedeId]);
  },
);

ruta(
  {
    metodo: 'put',
    ruta: '/paises/:id/precios',
    resumen: 'Aplicar precio y disponibilidad a todas las sedes de un país',
    descripcion: 'Agrega el producto al menú de las sedes que aún no lo tienen.',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL', 'GERENTE_PAIS'],
    params: paramsId,
    body: z.object({ productoId: idEntero, precio: monto, disponible: z.boolean().default(true) }),
  },
  async ({ auth, params, body }) => {
    await asegurarPais(auth, params.id);
    const sedes = await prisma.sede.findMany({
      where: { ciudad: { paisId: params.id } },
      select: { id: true },
    });
    await prisma.$transaction(
      sedes.map((s) =>
        prisma.productoSede.upsert({
          where: { sedeId_productoId: { sedeId: s.id, productoId: body.productoId } },
          create: {
            sedeId: s.id,
            productoId: body.productoId,
            precio: body.precio,
            disponible: body.disponible,
          },
          update: { precio: body.precio, disponible: body.disponible },
        }),
      ),
    );
    avisarCambioMenu(sedes.map((s) => s.id));
    return { sedesActualizadas: sedes.length };
  },
);

// ───────────────────────────── Catálogo global ─────────────────────────────

ruta(
  { metodo: 'get', ruta: '/categorias', resumen: 'Categorías del catálogo', auth: 'publico' },
  async () => prisma.categoria.findMany({ orderBy: { orden: 'asc' } }),
);

const cuerpoCategoria = z.object({
  nombre: z.string().trim().min(2).max(60),
  icono: z.string().trim().min(1).max(40).describe('Nombre de ícono de lucide-react'),
  orden: z.number().int().default(0),
});

ruta(
  {
    metodo: 'post',
    ruta: '/categorias',
    resumen: 'Crear categoría',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL'],
    body: cuerpoCategoria,
    status: 201,
  },
  async ({ body }) => prisma.categoria.create({ data: body }),
);

ruta(
  {
    metodo: 'patch',
    ruta: '/categorias/:id',
    resumen: 'Editar categoría',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL'],
    params: paramsId,
    body: parcial(cuerpoCategoria),
  },
  async ({ params, body }) => prisma.categoria.update({ where: { id: params.id }, data: body }),
);

const cuerpoProducto = z.object({
  categoriaId: idEntero,
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,30}$/),
  nombre: z.string().trim().min(2).max(120),
  descripcion: z.string().trim().max(300).default(''),
  imagenUrl: z.string().trim().max(300).nullable().optional(),
  activo: z.boolean().default(true),
});

ruta(
  {
    metodo: 'get',
    ruta: '/productos',
    resumen: 'Catálogo global',
    auth: 'personal',
    query: z.object({ categoriaId: idEntero.optional(), activo: booleanoQuery.optional() }),
  },
  async ({ query }) =>
    prisma.producto.findMany({
      where: {
        ...(query.categoriaId ? { categoriaId: query.categoriaId } : {}),
        ...(query.activo !== undefined ? { activo: query.activo } : {}),
      },
      include: { categoria: true, _count: { select: { sedes: true } } },
      orderBy: [{ categoria: { orden: 'asc' } }, { sku: 'asc' }],
    }),
);

ruta(
  {
    metodo: 'post',
    ruta: '/productos',
    resumen: 'Crear producto',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL'],
    body: cuerpoProducto,
    status: 201,
  },
  async ({ body }) => prisma.producto.create({ data: body }),
);

ruta(
  {
    metodo: 'patch',
    ruta: '/productos/:id',
    resumen: 'Editar producto',
    descripcion: 'Desactivarlo lo saca de todos los menús sin borrar su historial de ventas.',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL'],
    params: paramsId,
    body: parcial(cuerpoProducto),
  },
  async ({ params, body }) => {
    const producto = await prisma.producto.update({
      where: { id: params.id },
      data: body,
      include: { sedes: { select: { sedeId: true } } },
    });
    avisarCambioMenu(producto.sedes.map((s) => s.sedeId));
    const { sedes: _sedes, ...resto } = producto;
    return resto;
  },
);

// ───────────────────────────── Combos ─────────────────────────────
// Un combo es un producto (esCombo = true) con contenido fijo. Solo el admin global los crea
// y decide en qué sedes se venden y a qué precio; cada sede puede marcarlo agotado.

/** Todos los componentes deben estar en el menú de cada sede donde se venderá el combo. */
async function asegurarComponentesEnSedes(componenteIds: number[], sedeIds: number[]) {
  if (!componenteIds.length || !sedeIds.length) return;
  const filas = await prisma.productoSede.findMany({
    where: { sedeId: { in: sedeIds }, productoId: { in: componenteIds } },
    select: { sedeId: true, productoId: true },
  });
  const faltan = sedeIds.flatMap((sedeId) =>
    componenteIds
      .filter((pid) => !filas.some((f) => f.sedeId === sedeId && f.productoId === pid))
      .map((productoId) => ({ sedeId, productoId })),
  );
  if (faltan.length) {
    const [sedes, productos] = await Promise.all([
      prisma.sede.findMany({
        where: { id: { in: faltan.map((f) => f.sedeId) } },
        select: { id: true, codigo: true },
      }),
      prisma.producto.findMany({
        where: { id: { in: faltan.map((f) => f.productoId) } },
        select: { id: true, nombre: true },
      }),
    ]);
    const texto = faltan
      .slice(0, 4)
      .map(
        (f) =>
          `${productos.find((p) => p.id === f.productoId)?.nombre} en ${sedes.find((s) => s.id === f.sedeId)?.codigo}`,
      )
      .join(', ');
    throw HttpError.unprocessable(
      `El combo lleva productos que esas sedes no ofrecen: ${texto}${faltan.length > 4 ? '…' : ''}`,
      { faltan },
    );
  }
}

async function validarComponentes(componentes: { productoId: number; cantidad: number }[]) {
  const ids = componentes.map((c) => c.productoId);
  if (new Set(ids).size !== ids.length)
    throw HttpError.badRequest('Un producto aparece dos veces en el combo; usa la cantidad');
  const productos = await prisma.producto.findMany({ where: { id: { in: ids } } });
  if (productos.length !== ids.length) throw HttpError.notFound('Producto del combo');
  const combos = productos.filter((p) => p.esCombo);
  if (combos.length)
    throw HttpError.unprocessable('Un combo no puede contener otro combo', {
      productoIds: combos.map((c) => c.id),
    });
  const unidades = componentes.reduce((s, c) => s + c.cantidad, 0);
  if (unidades < 2) throw HttpError.badRequest('Un combo lleva al menos dos unidades');
}

const componenteCombo = z.object({
  productoId: idEntero,
  cantidad: z.number().int().min(1).max(20).default(1),
});
const sedeCombo = z.object({
  sedeId: idEntero,
  precio: monto,
  disponible: z.boolean().default(true),
});

const cuerpoCombo = z.object({
  categoriaId: idEntero,
  sku: cuerpoProducto.shape.sku,
  nombre: cuerpoProducto.shape.nombre,
  descripcion: cuerpoProducto.shape.descripcion,
  imagenUrl: cuerpoProducto.shape.imagenUrl,
  activo: z.boolean().default(true),
  componentes: z.array(componenteCombo).min(1).max(12),
  sedes: z
    .array(sedeCombo)
    .max(500)
    .default([])
    .describe('Sedes donde se vende y su precio en moneda local (reemplaza la lista al editar)'),
});

async function detalleCombos(auth: AuthPersonal, where: { id?: number } = {}) {
  const visibles = (await sedesFiltradas(auth, {})).map((s) => s.id);
  const combos = await prisma.producto.findMany({
    where: { esCombo: true, ...where },
    include: {
      categoria: true,
      componentes: {
        include: { producto: { select: { id: true, nombre: true, sku: true } } },
        orderBy: { productoId: 'asc' },
      },
      sedes: {
        where: { sedeId: { in: visibles } },
        include: { sede: { select: { id: true, codigo: true, nombre: true } } },
        orderBy: { sedeId: 'asc' },
      },
    },
    orderBy: { sku: 'asc' },
  });
  // Precio de los componentes por separado en cada sede, para mostrar el ahorro
  const ids = [...new Set(combos.flatMap((c) => c.componentes.map((x) => x.productoId)))];
  const precios = await prisma.productoSede.findMany({
    where: { sedeId: { in: visibles }, productoId: { in: ids } },
    select: { sedeId: true, productoId: true, precio: true },
  });
  return combos.map(({ sedes, ...c }) => ({
    ...c,
    sedes: sedes.map((s) => {
      const suelto = c.componentes.reduce(
        (acc, comp) =>
          acc +
          Number(
            precios.find((p) => p.sedeId === s.sedeId && p.productoId === comp.productoId)
              ?.precio ?? 0,
          ) *
            comp.cantidad,
        0,
      );
      return {
        sede: s.sede,
        precio: s.precio,
        disponible: s.disponible,
        precioSuelto: Math.round(suelto * 100) / 100,
      };
    }),
  }));
}

ruta(
  {
    metodo: 'get',
    ruta: '/combos',
    resumen: 'Combos con su contenido y las sedes donde se venden',
    descripcion: 'Cada sede trae el precio del combo y lo que costaría su contenido por separado.',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE'],
  },
  async ({ auth }) => detalleCombos(auth),
);

ruta(
  {
    metodo: 'post',
    ruta: '/combos',
    resumen: 'Crear un combo y publicarlo en sedes',
    descripcion:
      'Solo el admin global. Cada componente debe estar en el menú de todas las sedes elegidas.',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL'],
    body: cuerpoCombo,
    status: 201,
  },
  async ({ auth, body }) => {
    const { componentes, sedes, ...datos } = body;
    await validarComponentes(componentes);
    await asegurarComponentesEnSedes(
      componentes.map((c) => c.productoId),
      sedes.map((s) => s.sedeId),
    );
    if (await prisma.producto.findUnique({ where: { sku: datos.sku } }))
      throw HttpError.conflict(`Ya existe un producto con el SKU ${datos.sku}`);
    const combo = await prisma.producto.create({
      data: {
        ...datos,
        esCombo: true,
        componentes: { create: componentes },
        sedes: { create: sedes },
      },
    });
    avisarCambioMenu(sedes.map((s) => s.sedeId));
    return (await detalleCombos(auth, { id: combo.id }))[0];
  },
);

ruta(
  {
    metodo: 'patch',
    ruta: '/combos/:id',
    resumen: 'Editar un combo, su contenido o sus sedes',
    descripcion:
      '`componentes` y `sedes` reemplazan la lista completa: una sede que no venga deja de vender el combo.',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL'],
    params: paramsId,
    body: parcial(cuerpoCombo.omit({ sku: true })),
  },
  async ({ auth, params, body }) => {
    const actual = await prisma.producto.findUnique({
      where: { id: params.id },
      include: { componentes: true, sedes: { select: { sedeId: true } } },
    });
    if (!actual || !actual.esCombo) throw HttpError.notFound('Combo');
    const { componentes, sedes, ...datos } = body;
    if (componentes) await validarComponentes(componentes);
    const idsComponentes = (componentes ?? actual.componentes).map((c) => c.productoId);
    const idsSedes = sedes ? sedes.map((s) => s.sedeId) : actual.sedes.map((s) => s.sedeId);
    await asegurarComponentesEnSedes(idsComponentes, idsSedes);

    await prisma.$transaction(async (tx) => {
      await tx.producto.update({ where: { id: actual.id }, data: datos });
      if (componentes) {
        await tx.comboComponente.deleteMany({ where: { comboId: actual.id } });
        await tx.comboComponente.createMany({
          data: componentes.map((c) => ({ ...c, comboId: actual.id })),
        });
      }
      if (sedes) {
        await tx.productoSede.deleteMany({
          where: { productoId: actual.id, sedeId: { notIn: idsSedes } },
        });
        for (const s of sedes)
          await tx.productoSede.upsert({
            where: { sedeId_productoId: { sedeId: s.sedeId, productoId: actual.id } },
            create: { ...s, productoId: actual.id },
            update: { precio: s.precio, disponible: s.disponible },
          });
      }
    });
    avisarCambioMenu([...actual.sedes.map((s) => s.sedeId), ...idsSedes]);
    return (await detalleCombos(auth, { id: actual.id }))[0];
  },
);

// ───────────────────────────── Foto del producto o combo ─────────────────────────────

ruta(
  {
    metodo: 'put',
    ruta: '/productos/:id/imagen',
    resumen: 'Subir la foto de un producto o combo',
    descripcion:
      'Solo el admin global. Cuerpo binario (Content-Type image/webp, image/png o image/jpeg), máximo 2 MB. ' +
      'La web la recorta cuadrada y la reduce a 600 px en WebP antes de subirla. Reemplaza la anterior.',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL'],
    params: paramsId,
    middlewares: [express.raw({ type: TIPOS_IMAGEN, limit: MAX_IMAGEN_BYTES })],
  },
  async ({ params, req }) => {
    const actual = await prisma.producto.findUnique({
      where: { id: params.id },
      include: { sedes: { select: { sedeId: true } } },
    });
    if (!actual) throw HttpError.notFound('Producto');
    const imagenUrl = await guardarImagen('productos', String(actual.id), req.body);
    await prisma.producto.update({ where: { id: actual.id }, data: { imagenUrl } });
    if (actual.imagenUrl !== imagenUrl) await borrarImagen(actual.imagenUrl);
    avisarCambioMenu(actual.sedes.map((s) => s.sedeId));
    return { id: actual.id, imagenUrl };
  },
);

ruta(
  {
    metodo: 'delete',
    ruta: '/productos/:id/imagen',
    resumen: 'Quitar la foto de un producto o combo',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL'],
    params: paramsId,
  },
  async ({ params }) => {
    const actual = await prisma.producto.findUnique({
      where: { id: params.id },
      include: { sedes: { select: { sedeId: true } } },
    });
    if (!actual) throw HttpError.notFound('Producto');
    await prisma.producto.update({ where: { id: actual.id }, data: { imagenUrl: null } });
    await borrarImagen(actual.imagenUrl);
    avisarCambioMenu(actual.sedes.map((s) => s.sedeId));
  },
);
