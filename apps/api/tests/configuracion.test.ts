import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { crearApp } from '../src/app';
import { prisma } from '../src/db/prisma';
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
let admin: ReturnType<typeof como>;
let cliente: ReturnType<typeof como>;

beforeAll(async () => {
  e = await crearEscenario();
  admin = como(app, await tokenPersonal(app, e.usuarios.admin.email));
  cliente = como(app, await tokenCliente(app, e.clientes.uno.email));
});
afterAll(async () => {
  await admin
    .put('/api/configuracion')
    .send({ reservasHabilitadas: true, salirFilaHabilitado: true });
  await e.limpiar();
  await prisma.$disconnect();
});

const reservar = () =>
  cliente
    .post('/api/reservas')
    .send({ sedeId: e.sedeA.id, fecha: manana(e.sedeA.zonaHoraria), hora: '13:00', personas: 2 });

describe('configuración de la cadena', () => {
  it('cualquiera la lee; solo el admin global la cambia', async () => {
    const res = await request(app).get('/api/configuracion').expect(200);
    expect(res.body).toMatchObject({ reservasHabilitadas: true, salirFilaHabilitado: true });
    const gp = como(app, await tokenPersonal(app, e.usuarios.gerentePaisA.email));
    await gp.put('/api/configuracion').send({ reservasHabilitadas: false }).expect(403);
    await admin.put('/api/configuracion').send({}).expect(400);
  });

  it('con las reservas apagadas no se consultan franjas ni se reserva; las existentes se conservan', async () => {
    const hecha = await reservar().expect(201);

    const res = await admin
      .put('/api/configuracion')
      .send({ reservasHabilitadas: false })
      .expect(200);
    expect(res.body.reservasHabilitadas).toBe(false);

    const r = await reservar().expect(403);
    expect(r.body.error.code).toBe('RESERVAS_DESHABILITADAS');
    await request(app)
      .get(
        `/api/sedes/${e.sedeA.id}/disponibilidad?fecha=${manana(e.sedeA.zonaHoraria)}&personas=2`,
      )
      .expect(403);
    await cliente.patch(`/api/reservas/${hecha.body.id}`).send({ personas: 3 }).expect(403);

    // Lo ya reservado sigue visible y se puede cancelar
    await cliente.get(`/api/clientes/me/reservas/${hecha.body.id}`).expect(200);
    await cliente.post(`/api/clientes/me/reservas/${hecha.body.id}/cancelar`).expect(200);

    await admin.put('/api/configuracion').send({ reservasHabilitadas: true }).expect(200);
    await reservar().expect(201);
  });

  it('sin "salir de la fila", el comensal no puede salir solo; el personal sí lo marca', async () => {
    const turno = await request(app)
      .post(`/api/sedes/${e.sedeA.id}/espera`)
      .send({ nombre: 'Lucía', telefono: '+57 3001112233', personas: 2 })
      .expect(201);
    await admin.put('/api/configuracion').send({ salirFilaHabilitado: false }).expect(200);

    const r = await request(app).post(`/api/espera/${turno.body.id}/salir`).expect(403);
    expect(r.body.error.code).toBe('SALIR_FILA_DESHABILITADO');
    const gerente = como(app, await tokenPersonal(app, e.usuarios.gerenteSedeA.email));
    await gerente.post(`/api/espera/${turno.body.id}/abandono`).expect(200);

    await admin.put('/api/configuracion').send({ salirFilaHabilitado: true }).expect(200);
  });
});
