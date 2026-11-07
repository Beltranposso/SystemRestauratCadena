import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as socketCliente, type Socket } from 'socket.io-client';
import { EVENTOS } from '@restaurantes/shared';
import { crearApp } from '../src/crear-app';
import { prisma } from '../src/db/prisma';
import { cerrarSocket, iniciarSocket } from '../src/realtime/socket';
import { como, comoDispositivo, crearEscenario, tokenPersonal, type Escenario } from './escenario';

const app = crearApp();
let e: Escenario;
let cajero: ReturnType<typeof como>;
let cocina: ReturnType<typeof como>;
let tokenCocina: string;

beforeAll(async () => {
  e = await crearEscenario();
  cajero = como(app, await tokenPersonal(app, e.usuarios.cajeroA.email));
  tokenCocina = await tokenPersonal(app, e.usuarios.cocinaA.email);
  cocina = como(app, tokenCocina);
});
afterAll(async () => {
  await e.limpiar();
  await prisma.$disconnect();
});

const pedidoBase = () => ({
  sedeId: e.sedeA.id,
  metodoPago: 'TARJETA',
  items: [
    { productoId: e.productos.p1.id, cantidad: 2, notas: 'Sin cebolla' },
    { productoId: e.productos.p2.id, cantidad: 1 },
  ],
});

describe('crear pedidos', () => {
  it('calcula totales con el impuesto del país, total en USD y código del día', async () => {
    const res = await cajero.post('/api/pedidos').send(pedidoBase()).expect(201);
    // 2 × 10 + 5.50 = 25.50; impuesto 10 % = 2.55; total 28.05; tasa USD 1
    expect(res.body).toMatchObject({
      subtotal: '25.5',
      impuestos: '2.55',
      total: '28.05',
      totalUsd: '28.05',
      moneda: 'USD',
      estado: 'RECIBIDO',
      canal: 'CAJA',
    });
    expect(res.body.codigo).toMatch(/^Q-\d{3}$/);
    expect(res.body.cajero.id).toBe(e.usuarios.cajeroA.id);
    expect(res.body.items).toHaveLength(2);
    expect(
      res.body.items.find((i: { notas: string | null }) => i.notas === 'Sin cebolla')
        .precioUnitario,
    ).toBe('10');
  });

  it('guarda el precio del momento aunque luego cambie el menú', async () => {
    const res = await cajero.post('/api/pedidos').send(pedidoBase()).expect(201);
    await prisma.productoSede.update({
      where: { sedeId_productoId: { sedeId: e.sedeA.id, productoId: e.productos.p2.id } },
      data: { precio: 99 },
    });
    const detalle = await cajero.get(`/api/pedidos/${res.body.id}`).expect(200);
    expect(
      detalle.body.items.find((i: { productoId: number }) => i.productoId === e.productos.p2.id)
        .precioUnitario,
    ).toBe('5.5');
    await prisma.productoSede.update({
      where: { sedeId_productoId: { sedeId: e.sedeA.id, productoId: e.productos.p2.id } },
      data: { precio: 5.5 },
    });
  });

  it('rechaza productos agotados o que no están en el menú de la sede', async () => {
    const res = await cajero
      .post('/api/pedidos')
      .send({ ...pedidoBase(), items: [{ productoId: e.productos.noDisponible.id, cantidad: 1 }] })
      .expect(422);
    expect(res.body.error.details.productoIds).toEqual([e.productos.noDisponible.id]);
  });

  it('20 pedidos simultáneos reciben códigos distintos y consecutivos', async () => {
    const respuestas = await Promise.all(
      Array.from({ length: 20 }, () => cajero.post('/api/pedidos').send(pedidoBase())),
    );
    expect(respuestas.every((r) => r.status === 201)).toBe(true);
    const numeros = respuestas.map((r) => Number(r.body.codigo.slice(2))).sort((a, b) => a - b);
    expect(new Set(numeros).size).toBe(20);
    expect(numeros.at(-1)! - numeros[0]!).toBe(19);
  });

  it('el kiosco crea pedidos de su sede con canal KIOSCO y la pantalla no puede crear', async () => {
    const { sedeId: _omitida, ...sinSede } = pedidoBase();
    const res = await comoDispositivo(app, e.tokens.kioscoA)
      .post('/api/pedidos')
      .send({ ...sinSede, clienteNombre: 'Ana' })
      .expect(201);
    expect(res.body).toMatchObject({
      canal: 'KIOSCO',
      sedeId: e.sedeA.id,
      cajeroId: null,
      clienteNombre: 'Ana',
    });
    await comoDispositivo(app, e.tokens.kioscoA)
      .post('/api/pedidos')
      .send({ ...pedidoBase(), sedeId: e.sedeB.id })
      .expect(403);
    await comoDispositivo(app, e.tokens.pantallaA)
      .post('/api/pedidos')
      .send(pedidoBase())
      .expect(403);
  });

  it('cocina no puede registrar pedidos y un cajero no vende en otra sede', async () => {
    await cocina.post('/api/pedidos').send(pedidoBase()).expect(403);
    const cajeroB = como(app, await tokenPersonal(app, e.usuarios.cajeroB.email));
    await cajeroB.post('/api/pedidos').send(pedidoBase()).expect(403);
  });
});

describe('flujo de estados', () => {
  it('cocina prepara y marca listo; caja entrega; queda el historial', async () => {
    const { body: p } = await cajero.post('/api/pedidos').send(pedidoBase()).expect(201);
    await cocina
      .patch(`/api/pedidos/${p.id}/estado`)
      .send({ estado: 'EN_PREPARACION' })
      .expect(200);
    const listo = await cocina
      .patch(`/api/pedidos/${p.id}/estado`)
      .send({ estado: 'LISTO' })
      .expect(200);
    expect(listo.body.listoEn).toBeTruthy();
    const entregado = await cajero
      .patch(`/api/pedidos/${p.id}/estado`)
      .send({ estado: 'ENTREGADO' })
      .expect(200);
    expect(entregado.body.entregadoEn).toBeTruthy();

    const detalle = await cajero.get(`/api/pedidos/${p.id}`).expect(200);
    expect(detalle.body.historial.map((h: { estado: string }) => h.estado)).toEqual([
      'RECIBIDO',
      'EN_PREPARACION',
      'LISTO',
      'ENTREGADO',
    ]);
  });

  it('valida transiciones y permisos por rol', async () => {
    const { body: p } = await cajero.post('/api/pedidos').send(pedidoBase()).expect(201);
    const salto = await cocina
      .patch(`/api/pedidos/${p.id}/estado`)
      .send({ estado: 'LISTO' })
      .expect(422);
    expect(salto.body.error.details.permitidos).toEqual(['EN_PREPARACION', 'CANCELADO']);
    await cocina.patch(`/api/pedidos/${p.id}/estado`).send({ estado: 'CANCELADO' }).expect(403);
    await cajero
      .patch(`/api/pedidos/${p.id}/estado`)
      .send({ estado: 'EN_PREPARACION' })
      .expect(403);
    await cajero.patch(`/api/pedidos/${p.id}/estado`).send({ estado: 'CANCELADO' }).expect(200);
    await cajero.patch(`/api/pedidos/${p.id}/estado`).send({ estado: 'ENTREGADO' }).expect(422);
  });

  it('si dos pantallas avanzan el mismo pedido a la vez, solo una gana', async () => {
    const { body: p } = await cajero.post('/api/pedidos').send(pedidoBase()).expect(201);
    const [a, b] = await Promise.all([
      cocina.patch(`/api/pedidos/${p.id}/estado`).send({ estado: 'EN_PREPARACION' }),
      cocina.patch(`/api/pedidos/${p.id}/estado`).send({ estado: 'EN_PREPARACION' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it('pedidos activos y pantalla de clientes', async () => {
    const activos = await cocina.get(`/api/sedes/${e.sedeA.id}/pedidos/activos`).expect(200);
    expect(activos.body.length).toBeGreaterThan(0);
    expect(
      activos.body.every((p: { estado: string }) =>
        ['RECIBIDO', 'EN_PREPARACION', 'LISTO'].includes(p.estado),
      ),
    ).toBe(true);

    const pantalla = await comoDispositivo(app, e.tokens.pantallaA)
      .get(`/api/pantalla/${e.sedeA.id}/pedidos`)
      .expect(200);
    expect(pantalla.body.preparando.length).toBeGreaterThan(0);
    expect(pantalla.body.preparando[0].total).toBeUndefined();
    expect(pantalla.body.preparando[0].items).toBeUndefined();
  });

  it('historial filtrable por estado y código', async () => {
    const lista = await cajero.get(`/api/pedidos?estado=CANCELADO&porPagina=5`).expect(200);
    expect(lista.body.meta.porPagina).toBe(5);
    expect(lista.body.datos.every((p: { estado: string }) => p.estado === 'CANCELADO')).toBe(true);
    await cajero.get('/api/pedidos?estado=INVENTADO').expect(400);
  });
});

describe('tiempo real', () => {
  let servidor: HttpServer;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    servidor = createServer(app);
    iniciarSocket(servidor);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    url = `http://localhost:${(servidor.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await cerrarSocket();
    await new Promise((ok) => servidor.close(ok));
  });

  const conectar = (auth: Record<string, string>) => {
    const s = socketCliente(url, { transports: ['websocket'], auth });
    sockets.push(s);
    return s;
  };
  const unir = (s: Socket, sedeId: number, canal: string) =>
    new Promise<{ ok: boolean; error?: string }>((ok) =>
      s.emit(EVENTOS.unirseSede, { sedeId, canal }, ok),
    );

  it('solo el personal y dispositivos de la sede pueden unirse a sus salas', async () => {
    expect(await unir(conectar({ token: tokenCocina }), e.sedeA.id, 'cocina')).toMatchObject({
      ok: true,
    });
    expect(
      await unir(conectar({ deviceToken: e.tokens.pantallaA }), e.sedeA.id, 'pantalla'),
    ).toMatchObject({ ok: true });
    expect(
      await unir(conectar({ deviceToken: e.tokens.pantallaA }), e.sedeA.id, 'cocina'),
    ).toMatchObject({ ok: false });
    expect(
      await unir(conectar({ deviceToken: e.tokens.pantallaB }), e.sedeA.id, 'pantalla'),
    ).toMatchObject({ ok: false });
    expect(await unir(conectar({}), e.sedeA.id, 'pantalla')).toMatchObject({ ok: false });
    const cajeroB = await tokenPersonal(app, e.usuarios.cajeroB.email);
    expect(await unir(conectar({ token: cajeroB }), e.sedeA.id, 'cocina')).toMatchObject({
      ok: false,
    });
  });

  it('un pedido creado llega a cocina con detalle y a la pantalla sin montos', async () => {
    const sCocina = conectar({ token: tokenCocina });
    const sPantalla = conectar({ deviceToken: e.tokens.pantallaA });
    await unir(sCocina, e.sedeA.id, 'cocina');
    await unir(sPantalla, e.sedeA.id, 'pantalla');

    const enCocina = new Promise<Record<string, unknown>>((ok) =>
      sCocina.once(EVENTOS.pedidoCreado, ok),
    );
    const enPantalla = new Promise<Record<string, unknown>>((ok) =>
      sPantalla.once(EVENTOS.pedidoCreado, ok),
    );
    const inicio = Date.now();
    const { body } = await cajero.post('/api/pedidos').send(pedidoBase()).expect(201);

    const [c, p] = await Promise.all([enCocina, enPantalla]);
    expect(Date.now() - inicio).toBeLessThan(1000);
    expect(c).toMatchObject({ id: body.id, total: body.total });
    expect(p).toMatchObject({ id: body.id, codigo: body.codigo });
    expect(p.total).toBeUndefined();

    const actualizado = new Promise<Record<string, unknown>>((ok) =>
      sPantalla.once(EVENTOS.pedidoActualizado, ok),
    );
    await cocina
      .patch(`/api/pedidos/${body.id}/estado`)
      .send({ estado: 'EN_PREPARACION' })
      .expect(200);
    expect(await actualizado).toMatchObject({ id: body.id, estado: 'EN_PREPARACION' });
  });

  it('rechaza conexiones con token inválido', async () => {
    const s = conectar({ token: 'basura' });
    const error = await new Promise<Error>((ok) => s.once('connect_error', ok));
    expect(error.message).toBe('TOKEN_INVALIDO');
  });
});
