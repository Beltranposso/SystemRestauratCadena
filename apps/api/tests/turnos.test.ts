import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/crear-app';
import { prisma } from '../src/db/prisma';
import { como, crearEscenario, manana, tokenPersonal, type Escenario } from './escenario';

const app = crearApp();
let e: Escenario;
let gerente: ReturnType<typeof como>;
let cajero: ReturnType<typeof como>;
let dia: string;

beforeAll(async () => {
  e = await crearEscenario();
  gerente = como(app, await tokenPersonal(app, e.usuarios.gerenteSedeA.email));
  cajero = como(app, await tokenPersonal(app, e.usuarios.cajeroA.email));
  dia = manana('America/Bogota');
});
afterAll(async () => {
  await e.limpiar();
  await prisma.$disconnect();
});

const turno = (usuarioId: string, horaInicio: string, horaFin: string, fecha = dia) => ({
  sedeId: e.sedeA.id,
  usuarioId,
  fecha,
  horaInicio,
  horaFin,
});

describe('programación de turnos', () => {
  it('crea turnos en hora local con el puesto según el rol', async () => {
    const res = await gerente
      .post('/api/turnos')
      .send(turno(e.usuarios.cajeroA.id, '08:00', '16:00'))
      .expect(201);
    expect(res.body).toMatchObject({
      fecha: dia,
      horaInicio: '08:00',
      horaFin: '16:00',
      horas: 8,
      puesto: 'CAJA',
      estado: 'PROGRAMADO',
    });
    // 08:00 en Bogotá = 13:00 UTC
    expect(res.body.inicio).toBe(`${dia}T13:00:00.000Z`);
  });

  it('rechaza cruces para la misma persona pero acepta turnos contiguos', async () => {
    const cruce = await gerente
      .post('/api/turnos')
      .send(turno(e.usuarios.cajeroA.id, '15:00', '20:00'))
      .expect(409);
    expect(cruce.body.error.details.turno).toBeDefined();
    await gerente
      .post('/api/turnos')
      .send(turno(e.usuarios.cajeroA.id, '16:00', '20:00'))
      .expect(201);
  });

  it('un turno nocturno termina al día siguiente', async () => {
    const res = await gerente
      .post('/api/turnos')
      .send(turno(e.usuarios.cocinaA.id, '22:00', '06:00'))
      .expect(201);
    expect(res.body.horas).toBe(8);
    expect(new Date(res.body.fin).getTime() - new Date(res.body.inicio).getTime()).toBe(
      8 * 3_600_000,
    );
  });

  it('valida duración, sede de la persona y permisos', async () => {
    await gerente
      .post('/api/turnos')
      .send(turno(e.usuarios.cocinaA.id, '10:00', '10:30'))
      .expect(422);
    await gerente
      .post('/api/turnos')
      .send(turno(e.usuarios.cocinaA.id, '01:00', '19:00'))
      .expect(422);
    await gerente
      .post('/api/turnos')
      .send(turno(e.usuarios.cajeroB.id, '10:00', '12:00'))
      .expect(422);
    await cajero
      .post('/api/turnos')
      .send(turno(e.usuarios.cajeroA.id, '21:00', '23:00'))
      .expect(403);
  });

  it('dos altas simultáneas que se cruzan: solo una entra', async () => {
    const fecha = new Date(Date.parse(`${dia}T12:00:00Z`) + 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const r = await Promise.all([
      gerente.post('/api/turnos').send(turno(e.usuarios.cocinaA.id, '09:00', '13:00', fecha)),
      gerente.post('/api/turnos').send(turno(e.usuarios.cocinaA.id, '11:00', '15:00', fecha)),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
  });

  it('el gerente ve la semana con horas por persona; el cajero solo sus turnos', async () => {
    const semana = await gerente.get(`/api/turnos?desde=${dia}&hasta=${dia}`).expect(200);
    const horasCajero = semana.body.resumen.find(
      (r: { usuarioId: string }) => r.usuarioId === e.usuarios.cajeroA.id,
    );
    expect(horasCajero).toMatchObject({ horas: 12, turnos: 2 });
    expect(
      semana.body.datos.some((t: { usuarioId: string }) => t.usuarioId === e.usuarios.cocinaA.id),
    ).toBe(true);

    const propios = await cajero
      .get(`/api/turnos?desde=${dia}&hasta=${dia}&usuarioId=${e.usuarios.cocinaA.id}`)
      .expect(200);
    expect(
      propios.body.datos.every((t: { usuarioId: string }) => t.usuarioId === e.usuarios.cajeroA.id),
    ).toBe(true);
  });

  it('editar, marcar ausencia y eliminar', async () => {
    const { body: t } = await gerente
      .post('/api/turnos')
      .send(turno(e.usuarios.gerenteSedeA.id, '10:00', '18:00'))
      .expect(201);
    expect(t.puesto).toBe('GERENCIA');
    const movido = await gerente
      .patch(`/api/turnos/${t.id}`)
      .send({ horaInicio: '11:00', horaFin: '19:00' })
      .expect(200);
    expect(movido.body).toMatchObject({ horaInicio: '11:00', horaFin: '19:00' });
    await gerente
      .patch(`/api/turnos/${t.id}`)
      .send({ estado: 'AUSENTE', notas: 'Incapacidad' })
      .expect(200);
    await gerente.delete(`/api/turnos/${t.id}`).expect(422);

    const { body: otro } = await gerente
      .post('/api/turnos')
      .send(turno(e.usuarios.gerenteSedeA.id, '20:00', '23:00'))
      .expect(201);
    await gerente.delete(`/api/turnos/${otro.id}`).expect(204);
  });
});

describe('marcación de entrada y salida', () => {
  it('la persona marca entrada y salida de su turno en curso', async () => {
    const enCurso = await prisma.turno.create({
      data: {
        sedeId: e.sedeA.id,
        usuarioId: e.usuarios.cajeroA.id,
        puesto: 'CAJA',
        inicio: new Date(Date.now() - 10 * 60_000),
        fin: new Date(Date.now() + 4 * 3_600_000),
      },
    });
    const cocina = como(app, await tokenPersonal(app, e.usuarios.cocinaA.email));
    await cocina.post(`/api/turnos/${enCurso.id}/entrada`).expect(403);
    await cajero.post(`/api/turnos/${enCurso.id}/salida`).expect(422);

    const entrada = await cajero.post(`/api/turnos/${enCurso.id}/entrada`).expect(200);
    expect(entrada.body.estado).toBe('EN_CURSO');
    expect(entrada.body.entradaReal).toBeTruthy();
    await cajero.post(`/api/turnos/${enCurso.id}/entrada`).expect(422);

    const salida = await cajero.post(`/api/turnos/${enCurso.id}/salida`).expect(200);
    expect(salida.body.estado).toBe('COMPLETADO');
    await gerente.patch(`/api/turnos/${enCurso.id}`).send({ horaInicio: '07:00' }).expect(422);
  });

  it('no permite marcar entrada mucho antes del turno', async () => {
    const semana = await cajero.get(`/api/turnos?desde=${dia}&hasta=${dia}`).expect(200);
    await cajero.post(`/api/turnos/${semana.body.datos[0].id}/entrada`).expect(422);
  });
});
