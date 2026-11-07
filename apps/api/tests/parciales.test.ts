import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { como, crearEscenario, tokenPersonal, type Escenario } from './escenario';

/**
 * Zod 4 aplica los `.default()` aunque el campo sea opcional. Las rutas PATCH usan `parcial()`
 * para que un campo que no viene en el cuerpo no se reescriba con su valor por defecto.
 */
const app = crearApp();
let e: Escenario;
let admin: ReturnType<typeof como>;

beforeAll(async () => {
  e = await crearEscenario();
  admin = como(app, await tokenPersonal(app, e.usuarios.admin.email));
});
afterAll(async () => {
  await prisma.promocion.deleteMany({ where: { nombre: { startsWith: `Parcial ${e.sufijo}` } } });
  await e.limpiar();
  await prisma.$disconnect();
});

describe('PATCH no reescribe con valores por defecto', () => {
  it('producto: cambiar el nombre conserva descripción y estado', async () => {
    await prisma.producto.update({
      where: { id: e.productos.p1.id },
      data: { descripcion: 'Con queso', activo: false },
    });
    const res = await admin
      .patch(`/api/productos/${e.productos.p1.id}`)
      .send({ nombre: 'Producto renombrado' })
      .expect(200);
    expect(res.body).toMatchObject({
      nombre: 'Producto renombrado',
      descripcion: 'Con queso',
      activo: false,
    });
  });

  it('sede: cambiar el horario de cierre conserva apertura, duración y estado', async () => {
    await prisma.sede.update({
      where: { id: e.sedeA.id },
      data: { horaApertura: '07:00', duracionReservaMin: 45 },
    });
    const res = await admin
      .patch(`/api/sedes/${e.sedeA.id}`)
      .send({ horaCierre: '21:00' })
      .expect(200);
    expect(res.body).toMatchObject({
      horaApertura: '07:00',
      horaCierre: '21:00',
      duracionReservaMin: 45,
      activa: true,
    });
    await admin.patch(`/api/sedes/${e.sedeA.id}`).send({ horaCierre: '06:00' }).expect(400);
  });

  it('promoción: cambiar el nombre conserva días y estado', async () => {
    const creada = await admin
      .post('/api/promociones')
      .send({
        nombre: `Parcial ${e.sufijo}`,
        tipo: 'PORCENTAJE',
        productoId: e.productos.p2.id,
        porcentaje: 10,
        fechaInicio: '2020-01-01',
        diasSemana: [1, 3],
        activa: false,
        sedeIds: [e.sedeA.id],
      })
      .expect(201);
    const res = await admin
      .patch(`/api/promociones/${creada.body.id}`)
      .send({ nombre: `Parcial ${e.sufijo} 2` })
      .expect(200);
    expect(res.body).toMatchObject({ diasSemana: [1, 3], activa: false });
  });
});
