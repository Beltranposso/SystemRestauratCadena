import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { crearApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { DIR_UPLOADS } from '../src/utils/imagenes';
import { como, crearEscenario, tokenPersonal, type Escenario } from './escenario';

const app = crearApp();
let e: Escenario;
let tokenAdmin: string;

// PNG de 1×1 px y un WebP mínimo (solo cuentan las firmas del archivo)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x1a, 0, 0, 0]),
  Buffer.from('WEBPVP8L'),
  Buffer.alloc(14, 1),
]);

const subir = (id: number, datos: Buffer, tipo: string, token = tokenAdmin) =>
  request(app)
    .put(`/api/productos/${id}/imagen`)
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', tipo)
    .send(datos);

beforeAll(async () => {
  e = await crearEscenario();
  tokenAdmin = await tokenPersonal(app, e.usuarios.admin.email);
});
afterAll(async () => {
  await e.limpiar();
  await prisma.$disconnect();
  rmSync(DIR_UPLOADS, { recursive: true, force: true });
});

const archivo = (url: string) => path.join(DIR_UPLOADS, url.slice('/uploads/'.length));

describe('fotos de productos', () => {
  it('el admin sube la foto; se sirve en /uploads y llega al menú', async () => {
    const res = await subir(e.productos.p1.id, PNG, 'image/png').expect(200);
    expect(res.body.imagenUrl).toMatch(
      new RegExp(`^/uploads/productos/${e.productos.p1.id}-[0-9a-f]{12}\\.png$`),
    );

    const img = await request(app).get(res.body.imagenUrl).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['cache-control']).toContain('immutable');

    const menu = await request(app).get(`/api/menu?sedeId=${e.sedeA.id}`).expect(200);
    const p1 = menu.body.categorias
      .flatMap((c: { productos: unknown[] }) => c.productos)
      .find((p: { id: number }) => p.id === e.productos.p1.id);
    expect(p1.imagenUrl).toBe(res.body.imagenUrl);
  });

  it('reemplazar la foto borra la anterior del disco', async () => {
    const antes = (await prisma.producto.findUniqueOrThrow({ where: { id: e.productos.p1.id } }))
      .imagenUrl!;
    const res = await subir(e.productos.p1.id, WEBP, 'image/webp').expect(200);
    expect(res.body.imagenUrl).toMatch(/\.webp$/);
    expect(existsSync(archivo(antes))).toBe(false);
    expect(existsSync(archivo(res.body.imagenUrl))).toBe(true);
  });

  it('rechaza lo que no es imagen aunque diga que sí', async () => {
    const r = await subir(
      e.productos.p2.id,
      Buffer.from('<svg onload="x()"></svg>'),
      'image/png',
    ).expect(415);
    expect(r.body.error.code).toBe('IMAGEN_INVALIDA');
    await subir(e.productos.p2.id, PNG, 'application/json').expect(415);
  });

  it('solo el admin global; quitar la foto la borra', async () => {
    const gerente = await tokenPersonal(app, e.usuarios.gerenteSedeA.email);
    await subir(e.productos.p2.id, PNG, 'image/png', gerente).expect(403);

    const url = (await prisma.producto.findUniqueOrThrow({ where: { id: e.productos.p1.id } }))
      .imagenUrl!;
    await como(app, tokenAdmin).delete(`/api/productos/${e.productos.p1.id}/imagen`).expect(204);
    expect(existsSync(archivo(url))).toBe(false);
    const p = await prisma.producto.findUniqueOrThrow({ where: { id: e.productos.p1.id } });
    expect(p.imagenUrl).toBeNull();
  });

  it('una foto que no existe da 404', async () => {
    await request(app).get('/uploads/productos/no-existe.webp').expect(404);
  });
});
