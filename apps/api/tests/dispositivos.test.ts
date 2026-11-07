import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/crear-app';
import { prisma } from '../src/db/prisma';
import { como, comoDispositivo, crearEscenario, tokenPersonal, type Escenario } from './escenario';

/**
 * Cupos de pantallas y kioscos. La sede A del escenario arranca con cupo 1/1 y
 * ya tiene un kiosco y una pantalla activos (cupo lleno).
 */
const app = crearApp();
let e: Escenario;
let gerenteSede: ReturnType<typeof como>;
let gerentePais: ReturnType<typeof como>;

beforeAll(async () => {
  e = await crearEscenario();
  gerenteSede = como(app, await tokenPersonal(app, e.usuarios.gerenteSedeA.email));
  gerentePais = como(app, await tokenPersonal(app, e.usuarios.gerentePaisA.email));
});
afterAll(async () => {
  await e.limpiar();
  await prisma.$disconnect();
});

const nuevoKiosco = (nombre = 'Kiosco nuevo') =>
  gerenteSede.post(`/api/sedes/${e.sedeA.id}/dispositivos`).send({ nombre, tipo: 'KIOSCO' });

describe('cupos de dispositivos', () => {
  it('con el cupo lleno no se puede registrar otro kiosco', async () => {
    const res = await nuevoKiosco().expect(422);
    expect(res.body.error).toMatchObject({
      code: 'CUPO_AGOTADO',
      details: { tipo: 'KIOSCO', cupo: 1 },
    });
  });

  it('solo el gerente de país (de esa sede) o el admin asigna cupos', async () => {
    await gerenteSede.put(`/api/sedes/${e.sedeA.id}/cupos`).send({ cupoKioscos: 5 }).expect(403);
    const otroPais = como(app, await tokenPersonal(app, e.usuarios.gerentePaisB.email));
    await otroPais.put(`/api/sedes/${e.sedeA.id}/cupos`).send({ cupoKioscos: 5 }).expect(403);

    const res = await gerentePais
      .put(`/api/sedes/${e.sedeA.id}/cupos`)
      .send({ cupoKioscos: 3 })
      .expect(200);
    expect(res.body).toEqual({
      KIOSCO: { activos: 1, cupo: 3 },
      PANTALLA: { activos: 1, cupo: 1 },
    });
  });

  it('dentro del cupo se registran equipos; al llenarse se rechaza el siguiente', async () => {
    await nuevoKiosco('Kiosco 2').expect(201);
    await nuevoKiosco('Kiosco 3').expect(201);
    await nuevoKiosco('Kiosco 4').expect(422);

    const lista = await gerenteSede.get(`/api/sedes/${e.sedeA.id}/dispositivos`).expect(200);
    expect(lista.body.cupos.KIOSCO).toEqual({ activos: 3, cupo: 3 });
    expect(lista.body.dispositivos).toHaveLength(4);
    expect(lista.body.dispositivos[0]).toHaveProperty('enLinea', false);
  });

  it('no deja bajar el cupo por debajo de los equipos activos', async () => {
    const res = await gerentePais
      .put(`/api/sedes/${e.sedeA.id}/cupos`)
      .send({ cupoKioscos: 1 })
      .expect(422);
    expect(res.body.error.code).toBe('CUPO_EN_USO');
  });

  it('desactivar libera el cupo y corta el token; reactivar exige cupo libre', async () => {
    const kiosco = await prisma.dispositivo.findFirstOrThrow({
      where: { sedeId: e.sedeA.id, nombre: 'Kiosco' },
    });
    await comoDispositivo(app, e.tokens.kioscoA).get('/api/dispositivos/yo').expect(200);

    await gerenteSede.patch(`/api/dispositivos/${kiosco.id}`).send({ activo: false }).expect(200);
    await comoDispositivo(app, e.tokens.kioscoA).get('/api/dispositivos/yo').expect(401);

    // El cupo liberado lo toma otro equipo…
    await nuevoKiosco('Kiosco 5').expect(201);
    // …y ya no se puede reactivar el anterior
    const res = await gerenteSede
      .patch(`/api/dispositivos/${kiosco.id}`)
      .send({ activo: true })
      .expect(422);
    expect(res.body.error.code).toBe('CUPO_AGOTADO');
  });

  it('cambiar el token invalida el anterior', async () => {
    const pantalla = await prisma.dispositivo.findFirstOrThrow({
      where: { sedeId: e.sedeA.id, tipo: 'PANTALLA' },
    });
    const res = await gerenteSede.post(`/api/dispositivos/${pantalla.id}/token`).expect(200);
    expect(res.body.token).toMatch(/^dsp_/);
    await comoDispositivo(app, e.tokens.pantallaA).get('/api/dispositivos/yo').expect(401);
    await comoDispositivo(app, res.body.token).get('/api/dispositivos/yo').expect(200);
  });

  it('altas simultáneas nunca superan el cupo', async () => {
    const kioscos = await prisma.dispositivo.findMany({
      where: { sedeId: e.sedeA.id, tipo: 'KIOSCO', activo: true },
    });
    await gerenteSede.delete(`/api/dispositivos/${kioscos[0]!.id}`).expect(204);

    const respuestas = await Promise.all(
      Array.from({ length: 6 }, (_, i) => nuevoKiosco(`Carrera ${i}`)),
    );
    expect(respuestas.filter((r) => r.status === 201)).toHaveLength(1);
    expect(respuestas.filter((r) => r.status === 422)).toHaveLength(5);
    expect(
      await prisma.dispositivo.count({
        where: { sedeId: e.sedeA.id, tipo: 'KIOSCO', activo: true },
      }),
    ).toBe(3);
  });

  it('el resumen de cupos respeta el alcance', async () => {
    const res = await gerentePais.get('/api/dispositivos/cupos').expect(200);
    const ids = res.body.map((s: { id: number }) => s.id);
    expect(ids).toContain(e.sedeA.id);
    expect(ids).not.toContain(e.sedeB.id);
    const fila = res.body.find((s: { id: number }) => s.id === e.sedeA.id);
    expect(fila.cupos.KIOSCO).toEqual({ activos: 3, cupo: 3 });
    expect(fila).toHaveProperty('enLinea', 0);

    const cajero = como(app, await tokenPersonal(app, e.usuarios.cajeroA.email));
    await cajero.get('/api/dispositivos/cupos').expect(403);
  });
});
