import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as socketCliente } from 'socket.io-client';
import { EVENTOS } from '@restaurantes/shared';
import { crearApp } from '../src/crear-app';
import { prisma } from '../src/db/prisma';
import { cerrarSocket, iniciarSocket } from '../src/realtime/socket';
import {
  como,
  crearEscenario,
  manana,
  tokenCliente,
  tokenPersonal,
  type Escenario,
} from './escenario';

const app = crearApp();
let e: Escenario;
let cliente1: ReturnType<typeof como>;
let cliente2: ReturnType<typeof como>;
let cajero: ReturnType<typeof como>;
let gerente: ReturnType<typeof como>;
let dia: string;

beforeAll(async () => {
  e = await crearEscenario();
  cliente1 = como(app, await tokenCliente(app, e.clientes.uno.email));
  cliente2 = como(app, await tokenCliente(app, e.clientes.dos.email));
  cajero = como(app, await tokenPersonal(app, e.usuarios.cajeroA.email));
  gerente = como(app, await tokenPersonal(app, e.usuarios.gerenteSedeA.email));
  dia = manana('America/Bogota');
});
afterAll(async () => {
  await e.limpiar();
  await prisma.$disconnect();
});

const reservar = (c: ReturnType<typeof como>, hora: string, personas: number, fecha = dia) =>
  c.post('/api/reservas').send({ sedeId: e.sedeA.id, fecha, hora, personas });

describe('mesas y mapa del salón', () => {
  it('lista mesas con resumen de estados', async () => {
    const res = await cajero.get(`/api/sedes/${e.sedeA.id}/mesas`).expect(200);
    expect(res.body.mesas.map((m: { codigo: string }) => m.codigo)).toEqual(['A2', 'A4', 'A6']);
    expect(res.body.resumen).toMatchObject({ LIBRE: 3, OCUPADA: 0, total: 3, ocupacionPct: 0 });
    expect(res.body.lienzo).toEqual({ ancho: 1000, alto: 700 });
  });

  it('ocupar y liberar una mesa abre y cierra su sesión', async () => {
    await cajero
      .patch(`/api/mesas/${e.mesas.a2.id}/estado`)
      .send({ estado: 'OCUPADA', personas: 3 })
      .expect(422);
    await cajero
      .patch(`/api/mesas/${e.mesas.a2.id}/estado`)
      .send({ estado: 'OCUPADA', personas: 2 })
      .expect(200);
    const sesion = await prisma.sesionMesa.findFirstOrThrow({
      where: { mesaId: e.mesas.a2.id, fin: null },
    });
    expect(sesion).toMatchObject({ origen: 'DIRECTO', personas: 2 });

    await cajero
      .patch(`/api/mesas/${e.mesas.a2.id}/estado`)
      .send({ estado: 'RESERVADA' })
      .expect(422);
    await cajero
      .patch(`/api/mesas/${e.mesas.a2.id}/estado`)
      .send({ estado: 'LIMPIEZA' })
      .expect(200);
    expect(
      (await prisma.sesionMesa.findUniqueOrThrow({ where: { id: sesion.id } })).fin,
    ).not.toBeNull();
    await cajero.patch(`/api/mesas/${e.mesas.a2.id}/estado`).send({ estado: 'LIBRE' }).expect(200);
  });

  it('el gerente guarda el plano; no acepta mesas de otra sede ni códigos repetidos', async () => {
    await gerente
      .put(`/api/sedes/${e.sedeA.id}/plano`)
      .send({ mesas: [{ id: e.mesas.a2.id, posX: 600, posY: 400, ancho: 90, alto: 90 }] })
      .expect(200);
    expect((await prisma.mesa.findUniqueOrThrow({ where: { id: e.mesas.a2.id } })).posX).toBe(600);
    await gerente
      .put(`/api/sedes/${e.sedeA.id}/plano`)
      .send({ mesas: [{ id: e.mesas.b4.id, posX: 1, posY: 1, ancho: 90, alto: 90 }] })
      .expect(422);
    await gerente
      .post(`/api/sedes/${e.sedeA.id}/mesas`)
      .send({
        codigo: 'A2',
        capacidad: 2,
        zona: 'Terraza',
        forma: 'REDONDA',
        posX: 1,
        posY: 1,
        ancho: 80,
        alto: 80,
      })
      .expect(409);
    await cajero
      .put(`/api/sedes/${e.sedeA.id}/plano`)
      .send({ mesas: [{ id: e.mesas.a2.id, posX: 1, posY: 1, ancho: 90, alto: 90 }] })
      .expect(403);
  });
});

describe('reservas', () => {
  let reservaUno: { id: string; codigoConfirmacion: string };

  it('muestra la disponibilidad por franjas', async () => {
    const res = await request(app)
      .get(`/api/sedes/${e.sedeA.id}/disponibilidad?fecha=${dia}&personas=2`)
      .expect(200);
    expect(res.body.duracionMin).toBe(60);
    const diez = res.body.franjas.find((f: { hora: string }) => f.hora === '10:00');
    expect(diez).toMatchObject({ disponible: true, mesasLibres: 3 });
  });

  it('asigna la mesa más ajustada, confirma con código y notifica', async () => {
    const res = await reservar(cliente1, '10:00', 2).expect(201);
    reservaUno = res.body;
    expect(res.body).toMatchObject({
      estado: 'CONFIRMADA',
      fecha: dia,
      hora: '10:00',
      personas: 2,
      mesa: { codigo: 'A2' },
    });
    expect(res.body.codigoConfirmacion).toMatch(/^[A-Z2-9]{6}$/);

    const notif = await prisma.notificacion.findMany({ where: { reservaId: res.body.id } });
    expect(notif.map((n) => n.canal).sort()).toEqual(['EMAIL', 'EN_APP']);
    expect(notif.every((n) => n.estado === 'ENVIADA' && n.tipo === 'CONFIRMACION_RESERVA')).toBe(
      true,
    );
  });

  it('nunca asigna dos reservas cruzadas a la misma mesa', async () => {
    const b = await reservar(cliente2, '10:30', 2).expect(201);
    expect(b.body.mesa.codigo).toBe('A4');
    const c = await reservar(cliente2, '10:00', 4).expect(201);
    expect(c.body.mesa.codigo).toBe('A6');

    const sinMesa = await reservar(cliente2, '10:15', 5).expect(409);
    expect(sinMesa.body.error.code).toBe('SIN_DISPONIBILIDAD');
    expect(sinMesa.body.error.details.alternativas).toEqual(
      expect.arrayContaining(['09:00', '11:00']),
    );
    expect(sinMesa.body.error.details.alternativas).not.toContain('10:00');
  });

  it('con reservas simultáneas por la última mesa, solo una gana', async () => {
    const fecha = new Date(Date.parse(`${dia}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10); // pasado mañana
    const respuestas = await Promise.all([
      reservar(cliente1, '15:00', 6, fecha),
      reservar(cliente2, '15:00', 6, fecha),
      reservar(cliente2, '15:30', 6, fecha),
    ]);
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409, 409]);
  });

  it('valida antelación y horario', async () => {
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    const ahora = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Bogota',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date());
    if (ahora > '00:10') await reservar(cliente1, '00:00', 2, hoy).expect(422);
    await reservar(cliente1, '23:30', 2).expect(422); // terminaría después del cierre (23:59)
    const lejos = new Date(Date.now() + 70 * 86_400_000).toISOString().slice(0, 10);
    await reservar(cliente1, '12:00', 2, lejos).expect(422);
    await request(app)
      .post('/api/reservas')
      .send({ sedeId: e.sedeA.id, fecha: dia, hora: '12:00', personas: 2 })
      .expect(401);
  });

  it('el cliente modifica su reserva y otro cliente no puede verla', async () => {
    await cliente2.patch(`/api/reservas/${reservaUno.id}`).send({ hora: '13:00' }).expect(404);
    const sinLugar = await cliente1
      .patch(`/api/reservas/${reservaUno.id}`)
      .send({ personas: 4 })
      .expect(409);
    expect(sinLugar.body.error.message).toMatch(/sigue igual/);

    const ok = await cliente1
      .patch(`/api/reservas/${reservaUno.id}`)
      .send({ hora: '13:00', personas: 4 })
      .expect(200);
    expect(ok.body).toMatchObject({ hora: '13:00', personas: 4, mesa: { codigo: 'A4' } });
    expect(
      await prisma.notificacion.count({
        where: { reservaId: reservaUno.id, tipo: 'CAMBIO_RESERVA' },
      }),
    ).toBe(2);

    const mias = await cliente1.get('/api/clientes/me/reservas?vigentes=true').expect(200);
    const mia = mias.body.find((r: { id: string }) => r.id === reservaUno.id);
    expect(mia).toMatchObject({ puedeModificar: true, puedeCalificar: false });
  });

  it('el cliente no cancela pasado el límite; el personal sí', async () => {
    const pronto = await prisma.reserva.create({
      data: {
        sedeId: e.sedeA.id,
        clienteId: e.clientes.uno.id,
        mesaId: e.mesas.a6.id,
        inicio: new Date(Date.now() + 60 * 60_000),
        duracionMin: 60,
        personas: 2,
        estado: 'CONFIRMADA',
        codigoConfirmacion: `T${e.sufijo}`,
      },
    });
    const r = await cliente1.post(`/api/clientes/me/reservas/${pronto.id}/cancelar`).expect(422);
    expect(r.body.error.message).toMatch(/2 h/);
    const ok = await cajero.post(`/api/reservas/${pronto.id}/cancelar`).expect(200);
    expect(ok.body.estado).toBe('CANCELADA');
    await cajero.post(`/api/reservas/${pronto.id}/cancelar`).expect(422);
  });

  it('agenda del día para el personal, buscable por código', async () => {
    const agenda = await cajero.get(`/api/reservas?fecha=${dia}`).expect(200);
    expect(agenda.body.datos.length).toBeGreaterThanOrEqual(3);
    const porCodigo = await cajero
      .get(`/api/reservas?codigo=${reservaUno.codigoConfirmacion}`)
      .expect(200);
    expect(porCodigo.body.datos).toHaveLength(1);
  });

  it('avisa mesa lista, sienta, libera la mesa y el cliente califica', async () => {
    const aviso = await cajero
      .post(`/api/reservas/${reservaUno.id}/notificar-mesa-lista`)
      .expect(200);
    expect(aviso.body.id).toBe(reservaUno.id);
    expect((await prisma.mesa.findUniqueOrThrow({ where: { id: e.mesas.a4.id } })).estado).toBe(
      'RESERVADA',
    );
    expect(
      await prisma.notificacion.count({ where: { reservaId: reservaUno.id, tipo: 'MESA_LISTA' } }),
    ).toBe(2);

    const sentada = await cajero.post(`/api/reservas/${reservaUno.id}/sentar`).send({}).expect(200);
    expect(sentada.body.estado).toBe('SENTADA');
    const panel = await cajero.get(`/api/sedes/${e.sedeA.id}/mesas`).expect(200);
    const a4 = panel.body.mesas.find((m: { codigo: string }) => m.codigo === 'A4');
    expect(a4.estado).toBe('OCUPADA');
    expect(a4.sesionActual).toMatchObject({ origen: 'RESERVA', personas: 4 });

    await cliente1
      .post('/api/calificaciones')
      .send({ reservaId: reservaUno.id, puntaje: 5 })
      .expect(422);
    await cajero.patch(`/api/mesas/${e.mesas.a4.id}/estado`).send({ estado: 'LIBRE' }).expect(200);
    expect((await prisma.reserva.findUniqueOrThrow({ where: { id: reservaUno.id } })).estado).toBe(
      'COMPLETADA',
    );

    await cliente2
      .post('/api/calificaciones')
      .send({ reservaId: reservaUno.id, puntaje: 5 })
      .expect(404);
    await cliente1
      .post('/api/calificaciones')
      .send({ reservaId: reservaUno.id, puntaje: 5, comentario: 'Excelente' })
      .expect(201);
    await cliente1
      .post('/api/calificaciones')
      .send({ reservaId: reservaUno.id, puntaje: 4 })
      .expect(409);
  });

  it('no-show: el cajero espera 15 minutos; el gerente puede marcarlo', async () => {
    const r = await reservar(cliente2, '18:00', 2).expect(201);
    await cajero.post(`/api/reservas/${r.body.id}/no-show`).expect(422);
    const ok = await gerente.post(`/api/reservas/${r.body.id}/no-show`).expect(200);
    expect(ok.body.estado).toBe('NO_SHOW');
  });
});

describe('cola de espera', () => {
  let servidor: HttpServer;
  let url: string;
  let primero: { id: string; numeroTurno: number };
  let segundo: { id: string };

  beforeAll(async () => {
    servidor = createServer(app);
    iniciarSocket(servidor);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    url = `http://localhost:${(servidor.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await cerrarSocket();
    await new Promise((ok) => servidor.close(ok));
  });

  it('cualquiera se une con nombre y teléfono y recibe turno, posición y espera estimada', async () => {
    const a = await request(app)
      .post(`/api/sedes/${e.sedeA.id}/espera`)
      .send({ nombre: 'Sin Cuenta', telefono: '+57 3110000001', personas: 2 })
      .expect(201);
    primero = a.body;
    expect(a.body).toMatchObject({ estado: 'ESPERANDO', posicion: 1 });
    expect(a.body.esperaEstimadaMin).toBeGreaterThanOrEqual(5);

    const b = await request(app)
      .post(`/api/sedes/${e.sedeA.id}/espera`)
      .send({ nombre: 'Otra Persona', telefono: '+57 3110000002', personas: 4 })
      .expect(201);
    segundo = b.body;
    expect(b.body).toMatchObject({ numeroTurno: a.body.numeroTurno + 1, posicion: 2 });

    await request(app)
      .post(`/api/sedes/${e.sedeA.id}/espera`)
      .send({ nombre: 'Repetido', telefono: '+57 3110000001', personas: 2 })
      .expect(409);
    await request(app)
      .post(`/api/sedes/${e.sedeA.id}/espera`)
      .send({ nombre: 'Grupo', telefono: '+57 3110000009', personas: 12 })
      .expect(422);
    await request(app).post(`/api/sedes/${e.sedeA.id}/espera`).send({ personas: 2 }).expect(400);
  });

  it('un cliente registrado se une sin repetir sus datos', async () => {
    const res = await cliente2
      .post(`/api/sedes/${e.sedeA.id}/espera`)
      .send({ personas: 2 })
      .expect(201);
    expect(res.body).toMatchObject({ nombre: 'Cliente Dos', posicion: 3 });
    await request(app).post(`/api/espera/${res.body.id}/salir`).expect(200);
  });

  it('el personal ve la cola, avisa con mesa apartada y sienta', async () => {
    const cola = await cajero.get(`/api/sedes/${e.sedeA.id}/espera`).expect(200);
    expect(cola.body.esperando).toBe(2);
    expect(cola.body.datos[0].telefono).toBe('+57 3110000001');

    // El comensal sin cuenta sigue su turno por Socket.IO
    const s = socketCliente(url, { transports: ['websocket'] });
    const unido = await new Promise<{ ok: boolean }>((ok) =>
      s.emit(EVENTOS.unirseEspera, { entradaId: primero.id }, ok),
    );
    expect(unido.ok).toBe(true);
    const aviso = new Promise<{ tipo: string; datos: { mesa: string } }>((ok) =>
      s.once(EVENTOS.notificacion, ok),
    );

    const notificado = await cajero
      .post(`/api/espera/${primero.id}/notificar`)
      .send({ mesaId: e.mesas.a2.id })
      .expect(200);
    expect(notificado.body).toMatchObject({ estado: 'NOTIFICADO', mesa: 'A2' });
    expect(await aviso).toMatchObject({ tipo: 'MESA_LISTA', datos: { mesa: 'A2' } });
    expect((await prisma.mesa.findUniqueOrThrow({ where: { id: e.mesas.a2.id } })).estado).toBe(
      'RESERVADA',
    );
    s.close();

    const sentado = await cajero.post(`/api/espera/${primero.id}/sentar`).send({}).expect(200);
    expect(sentado.body.estado).toBe('SENTADO');
    const sesion = await prisma.sesionMesa.findFirstOrThrow({
      where: { entradaEsperaId: primero.id },
    });
    expect(sesion).toMatchObject({ origen: 'ESPERA', mesaId: e.mesas.a2.id, fin: null });

    // El segundo avanza al primer lugar
    const turno = await request(app).get(`/api/espera/${segundo.id}`).expect(200);
    expect(turno.body.posicion).toBe(1);

    await cajero.patch(`/api/mesas/${e.mesas.a2.id}/estado`).send({ estado: 'LIBRE' }).expect(200);
  });

  it('salir de la cola libera el lugar', async () => {
    const r = await request(app).post(`/api/espera/${segundo.id}/salir`).expect(200);
    expect(r.body.estado).toBe('ABANDONO');
    await request(app).post(`/api/espera/${segundo.id}/salir`).expect(422);
  });
});

describe('calificación de pedidos', () => {
  it('se califica un pedido entregado una sola vez, sin cuenta', async () => {
    const cocina = como(app, await tokenPersonal(app, e.usuarios.cocinaA.email));
    const { body: p } = await cajero
      .post('/api/pedidos')
      .send({
        sedeId: e.sedeA.id,
        metodoPago: 'EFECTIVO',
        items: [{ productoId: e.productos.p1.id, cantidad: 1 }],
      })
      .expect(201);
    await request(app).post('/api/calificaciones').send({ pedidoId: p.id, puntaje: 4 }).expect(422);
    for (const estado of ['EN_PREPARACION', 'LISTO', 'ENTREGADO']) {
      await cocina.patch(`/api/pedidos/${p.id}/estado`).send({ estado }).expect(200);
    }
    await request(app).post('/api/calificaciones').send({ pedidoId: p.id, puntaje: 4 }).expect(201);
    await request(app).post('/api/calificaciones').send({ pedidoId: p.id, puntaje: 1 }).expect(409);
    await request(app).post('/api/calificaciones').send({ puntaje: 3 }).expect(400);
  });
});
