import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  MARCA_POR_DEFECTO,
  coloresDominantes,
  contraste,
  evaluarColores,
  rgbAHex,
  sugerirPaletas,
} from '@restaurantes/shared';
import { crearApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { como, crearEscenario, tokenPersonal, type Escenario } from './escenario';

const app = crearApp();
let e: Escenario;
let admin: ReturnType<typeof como>;
let original: Awaited<ReturnType<typeof prisma.marca.findUnique>>;

// PNG de 1×1 px en base64
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

beforeAll(async () => {
  e = await crearEscenario();
  admin = como(app, await tokenPersonal(app, e.usuarios.admin.email));
  original = await prisma.marca.findUnique({ where: { id: 1 } });
});
afterAll(async () => {
  if (original) {
    const { id: _id, actualizadoEn: _a, ...datos } = original;
    await prisma.marca.update({ where: { id: 1 }, data: datos });
  }
  await e.limpiar();
  await prisma.$disconnect();
});

describe('marca (apariencia)', () => {
  it('cualquiera la lee, sin sesión', async () => {
    const res = await request(app).get('/api/marca').expect(200);
    expect(res.body).toHaveProperty('colorPrimario');
    expect(res.body).not.toHaveProperty('id');
  });

  it('el admin global cambia nombre, logo y colores', async () => {
    const res = await admin
      .put('/api/marca')
      .send({ nombre: 'Brasa Azul', logo: PNG, colorPrimario: '#1450c8', colorAcento: '#FAD228' })
      .expect(200);
    expect(res.body).toMatchObject({
      nombre: 'Brasa Azul',
      logo: PNG,
      colorPrimario: '#1450C8',
      colorAcento: '#FAD228',
    });
    const quitar = await admin.put('/api/marca').send({ logo: null }).expect(200);
    expect(quitar.body).toMatchObject({ logo: null, nombre: 'Brasa Azul' });
  });

  it('rechaza colores ilegibles y logos que no son imagen', async () => {
    // Amarillo de botón: el texto blanco no se lee
    const r = await admin.put('/api/marca').send({ colorPrimario: '#FFE000' }).expect(422);
    expect(r.body.error.message).toContain('primario');
    await admin.put('/api/marca').send({ colorAcento: '#202020' }).expect(422);
    await admin.put('/api/marca').send({ colorPrimario: 'rojo' }).expect(400);
    await admin
      .put('/api/marca')
      .send({ logo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })
      .expect(400);
  });

  it('solo el admin global la cambia', async () => {
    const gp = como(app, await tokenPersonal(app, e.usuarios.gerentePaisA.email));
    await gp.put('/api/marca').send({ nombre: 'Otra' }).expect(403);
    await request(app).put('/api/marca').send({ nombre: 'Otra' }).expect(401);
  });

  it('restablecer vuelve a la apariencia por defecto', async () => {
    const res = await admin.delete('/api/marca').expect(200);
    expect(res.body).toMatchObject({ ...MARCA_POR_DEFECTO, logo: null });
  });
});

describe('sugerencias de color (shared)', () => {
  // Logo sintético: azul dominante, amarillo secundario, fondo blanco y borde negro
  const pixeles: number[] = [];
  const pintar = (n: number, rgba: number[]) => {
    for (let i = 0; i < n; i++) pixeles.push(...rgba);
  };
  pintar(500, [20, 80, 200, 255]);
  pintar(250, [250, 210, 40, 255]);
  pintar(900, [255, 255, 255, 255]);
  pintar(200, [0, 0, 0, 255]);
  pintar(300, [255, 0, 0, 0]); // transparente: se ignora

  it('encuentra los colores del logo ignorando fondo, negro y transparencia', () => {
    expect(coloresDominantes(pixeles).map(rgbAHex)).toEqual(['#1450C8', '#FAD228']);
  });

  it('todas las sugerencias son legibles (AA 4.5:1)', () => {
    const s = sugerirPaletas(coloresDominantes(pixeles));
    expect(s[0]).toMatchObject({
      nombre: 'Del logo',
      colorPrimario: '#1450C8',
      colorAcento: '#FAD228',
    });
    expect(s.length).toBeGreaterThanOrEqual(3);
    for (const x of s) expect(evaluarColores(x.colorPrimario, x.colorAcento).optimo).toBe(true);
  });

  it('un logo en blanco y negro recibe paletas por defecto', () => {
    const bn = [255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255];
    const s = sugerirPaletas(coloresDominantes(bn));
    expect(s[0]?.colorPrimario).toBe(MARCA_POR_DEFECTO.colorPrimario);
  });

  it('el contraste sigue la fórmula WCAG', () => {
    expect(contraste('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contraste('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });
});
