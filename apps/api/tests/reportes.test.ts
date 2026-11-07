import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/crear-app';
import { prisma } from '../src/db/prisma';
import { fechaOperacion } from '../src/utils/fechas';
import { como, comoDispositivo, crearEscenario, tokenPersonal, type Escenario } from './escenario';

/**
 * Los reportes se verifican sobre datos conocidos del escenario:
 *   Sede A (USD, impuesto 10 %): 3 pedidos de 1 × 10 → total 11 USD c/u; uno se cancela.
 *   Sede B (EUR, tasa 0.5 por USD, impuesto 20 %): 1 pedido de 1 × 8 € → 9.60 € = 19.20 USD.
 */
const app = crearApp();
let e: Escenario;
let admin: ReturnType<typeof como>;
let gerentePais: ReturnType<typeof como>;
let hoyA: string;
let hoyB: string;

beforeAll(async () => {
  e = await crearEscenario();
  admin = como(app, await tokenPersonal(app, e.usuarios.admin.email));
  gerentePais = como(app, await tokenPersonal(app, e.usuarios.gerentePaisA.email));
  const cajeroA = como(app, await tokenPersonal(app, e.usuarios.cajeroA.email));
  const cajeroB = como(app, await tokenPersonal(app, e.usuarios.cajeroB.email));
  hoyA = fechaOperacion(new Date(), 'America/Bogota');
  hoyB = fechaOperacion(new Date(), 'Europe/Madrid');

  const item = (productoId: number) => [{ productoId, cantidad: 1 }];
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const r = await cajeroA
      .post('/api/pedidos')
      .send({ sedeId: e.sedeA.id, metodoPago: 'TARJETA', items: item(e.productos.p1.id) })
      .expect(201);
    ids.push(r.body.id);
  }
  await cajeroA.patch(`/api/pedidos/${ids[2]}/estado`).send({ estado: 'CANCELADO' }).expect(200);
  await comoDispositivo(app, e.tokens.kioscoA)
    .post('/api/pedidos')
    .send({ metodoPago: 'EFECTIVO', items: item(e.productos.p2.id) })
    .expect(201)
    .then((r) => prisma.pedido.update({ where: { id: r.body.id }, data: { estado: 'CANCELADO' } }));
  await cajeroB
    .post('/api/pedidos')
    .send({ sedeId: e.sedeB.id, metodoPago: 'TARJETA', items: item(e.productos.p1.id) })
    .expect(201);

  await prisma.calificacion.createMany({
    data: [
      { sedeId: e.sedeA.id, puntaje: 4, comentario: 'Bien' },
      { sedeId: e.sedeA.id, puntaje: 2 },
    ],
  });

  // Una sesión de mesa de 60 minutos que ya terminó
  await prisma.sesionMesa.create({
    data: {
      mesaId: e.mesas.a4.id,
      origen: 'DIRECTO',
      personas: 3,
      inicio: new Date(Date.now() - 61 * 60_000),
      fin: new Date(Date.now() - 60_000),
    },
  });
});
afterAll(async () => {
  await e.limpiar();
  await prisma.$disconnect();
});

describe('KPIs', () => {
  it('calcula ventas en USD, ticket, cancelaciones y calificación de una sede', async () => {
    const res = await admin
      .get(`/api/reportes/kpis?sedeId=${e.sedeA.id}&desde=${hoyA}&hasta=${hoyA}`)
      .expect(200);
    expect(res.body).toMatchObject({
      sedes: 1,
      pedidos: 2,
      ventasUsd: 22,
      ticketPromedioUsd: 11,
      tasaCancelacionPct: 50,
      calificacionPromedio: 3,
      calificaciones: 2,
      periodo: { desde: hoyA, hasta: hoyA, dias: 1 },
    });
    expect(res.body.anterior.pedidos).toBe(0);
    expect(res.body.variacionPct.ventasUsd).toBeNull();
  });

  it('suma países con monedas distintas en USD', async () => {
    const b = await admin
      .get(`/api/reportes/kpis?paisId=${e.paisB.id}&desde=${hoyB}&hasta=${hoyB}`)
      .expect(200);
    expect(b.body).toMatchObject({ pedidos: 1, ventasUsd: 19.2 });
  });

  it('respeta el alcance: el gerente de país ve solo su país y no puede pedir otro', async () => {
    const propio = await gerentePais
      .get(`/api/reportes/kpis?desde=${hoyA}&hasta=${hoyA}`)
      .expect(200);
    expect(propio.body).toMatchObject({ sedes: 1, pedidos: 2, ventasUsd: 22 });
    await gerentePais.get(`/api/reportes/kpis?paisId=${e.paisB.id}`).expect(403);
    await gerentePais.get(`/api/reportes/kpis?sedeId=${e.sedeB.id}`).expect(403);
    const cajero = como(app, await tokenPersonal(app, e.usuarios.cajeroA.email));
    await cajero.get('/api/reportes/kpis').expect(403);
  });

  it('valida el rango de fechas', async () => {
    await admin.get('/api/reportes/kpis?desde=2026-05-10&hasta=2026-05-01').expect(400);
    await admin.get('/api/reportes/kpis?desde=2024-01-01&hasta=2026-01-01').expect(400);
  });
});

describe('ventas agrupadas', () => {
  it('por sede incluye moneda local', async () => {
    const res = await admin
      .get(`/api/reportes/ventas?agrupar=sede&sedeId=${e.sedeB.id}&desde=${hoyB}&hasta=${hoyB}`)
      .expect(200);
    expect(res.body.datos).toEqual([
      expect.objectContaining({
        clave: e.sedeB.codigo,
        moneda: 'EUR',
        ventasLocal: 9.6,
        ventasUsd: 19.2,
        pedidos: 1,
        cancelados: 0,
      }),
    ]);
  });

  it('por producto: unidades y ventas sin impuesto', async () => {
    const res = await gerentePais
      .get(`/api/reportes/ventas?agrupar=producto&desde=${hoyA}&hasta=${hoyA}`)
      .expect(200);
    expect(res.body.datos).toEqual([
      expect.objectContaining({ sku: e.productos.p1.sku, unidades: 2, pedidos: 2, ventasUsd: 20 }),
    ]);
  });

  it('por día, hora, canal y método de pago', async () => {
    const q = `sedeId=${e.sedeA.id}&desde=${hoyA}&hasta=${hoyA}`;
    const dia = await admin.get(`/api/reportes/ventas?agrupar=dia&${q}`).expect(200);
    expect(dia.body.datos).toEqual([
      expect.objectContaining({ clave: hoyA, pedidos: 2, cancelados: 2, ventasUsd: 22 }),
    ]);
    const hora = await admin.get(`/api/reportes/ventas?agrupar=hora&${q}`).expect(200);
    expect(hora.body.datos[0].clave).toMatch(/^\d{2}:00$/);
    const canal = await admin.get(`/api/reportes/ventas?agrupar=canal&${q}`).expect(200);
    expect(canal.body.datos.map((d: { clave: string }) => d.clave).sort()).toEqual([
      'CAJA',
      'KIOSCO',
    ]);
    await admin.get(`/api/reportes/ventas?agrupar=inventado`).expect(400);
  });
});

describe('ocupación y calificaciones', () => {
  it('mide minutos ocupados, ocupación y rotación', async () => {
    const desde = fechaOperacion(new Date(Date.now() - 61 * 60_000), 'America/Bogota');
    const res = await admin
      .get(`/api/reportes/ocupacion?agrupar=sede&sedeId=${e.sedeA.id}&desde=${desde}&hasta=${hoyA}`)
      .expect(200);
    const dias = res.body.periodo.dias;
    expect(res.body.resumen).toMatchObject({ mesas: 3, sesiones: 1, comensales: 3 });
    const fila = res.body.datos[0];
    expect(fila).toMatchObject({ clave: e.sedeA.codigo, mesas: 3, minutos: 60, sesiones: 1 });
    // 60 min ocupados ÷ (3 mesas × 1439 min de 00:00 a 23:59 × días)
    expect(fila.ocupacionPct).toBeCloseTo((60 / (3 * 1439 * dias)) * 100, 1);

    const porMesa = await admin
      .get(`/api/reportes/ocupacion?agrupar=mesa&sedeId=${e.sedeA.id}&desde=${desde}&hasta=${hoyA}`)
      .expect(200);
    expect(porMesa.body.datos[0]).toMatchObject({ clave: `${e.sedeA.codigo} · A4`, minutos: 60 });
    const porHora = await admin
      .get(`/api/reportes/ocupacion?agrupar=hora&sedeId=${e.sedeA.id}&desde=${desde}&hasta=${hoyA}`)
      .expect(200);
    expect(
      porHora.body.datos.reduce((a: number, d: { minutos: number }) => a + d.minutos, 0),
    ).toBeGreaterThanOrEqual(59);
  });

  it('resume calificaciones con distribución y comentarios', async () => {
    const res = await admin
      .get(`/api/reportes/calificaciones?sedeId=${e.sedeA.id}&desde=${hoyA}&hasta=${hoyA}`)
      .expect(200);
    expect(res.body).toMatchObject({ promedio: 3, total: 2 });
    expect(res.body.distribucion).toEqual([
      { puntaje: 5, total: 0 },
      { puntaje: 4, total: 1 },
      { puntaje: 3, total: 0 },
      { puntaje: 2, total: 1 },
      { puntaje: 1, total: 0 },
    ]);
    expect(res.body.ultimosComentarios.map((c: { comentario: string }) => c.comentario)).toEqual([
      'Bien',
    ]);
  });
});
