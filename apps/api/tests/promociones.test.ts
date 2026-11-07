import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { aplicarPromociones, promocionVigente, type ReglaPromocion } from '@restaurantes/shared';
import { crearApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import { como, comoDispositivo, crearEscenario, tokenPersonal, type Escenario } from './escenario';

/**
 * Menú por sede: combos de contenido fijo y promociones.
 * Sede A (USD, impuesto 10 %): p1 = 10, p2 = 5.50, p3 agotado. Sede B (EUR): solo p1 = 8.
 */
const app = crearApp();
let e: Escenario;
let admin: ReturnType<typeof como>;
let kiosco: ReturnType<typeof comoDispositivo>;

beforeAll(async () => {
  e = await crearEscenario();
  admin = como(app, await tokenPersonal(app, e.usuarios.admin.email));
  kiosco = comoDispositivo(app, e.tokens.kioscoA);
});
afterAll(async () => {
  await e.limpiar();
  await prisma.$disconnect();
});

const menuA = async () =>
  (await kiosco.get(`/api/menu?sedeId=${e.sedeA.id}`).expect(200)).body as {
    categorias: { productos: Record<string, unknown>[] }[];
    promociones: { id: number; nombre: string }[];
  };
const productosMenu = async () => (await menuA()).categorias.flatMap((c) => c.productos);

const pedir = (items: { productoId: number; cantidad: number; notas?: string }[]) =>
  kiosco.post('/api/pedidos').send({ metodoPago: 'TARJETA', items });

describe('combos', () => {
  let comboId: number;

  it('el admin crea un combo de contenido fijo y el kiosco lo ve con el ahorro', async () => {
    const res = await admin
      .post('/api/combos')
      .send({
        categoriaId: e.categoria.id,
        sku: `TST-${e.sufijo}-C1`,
        nombre: 'Combo Prueba',
        descripcion: 'Producto 1 y dos Producto 2',
        componentes: [
          { productoId: e.productos.p1.id, cantidad: 1 },
          { productoId: e.productos.p2.id, cantidad: 2 },
        ],
        sedes: [{ sedeId: e.sedeA.id, precio: 18 }],
      })
      .expect(201);
    comboId = res.body.id;
    expect(res.body).toMatchObject({ esCombo: true, sedes: [{ precio: '18', precioSuelto: 21 }] });

    const combo = (await productosMenu()).find((p) => p.id === comboId);
    expect(combo).toMatchObject({
      esCombo: true,
      precio: '18',
      precioSuelto: 21,
      componentes: [
        { nombre: 'Producto 1', cantidad: 1 },
        { nombre: 'Producto 2', cantidad: 2 },
      ],
    });
  });

  it('el pedido guarda el contenido del combo para cocina', async () => {
    const res = await pedir([{ productoId: comboId, cantidad: 1 }]).expect(201);
    expect(res.body.items[0]).toMatchObject({
      nombreProducto: 'Combo Prueba',
      precioUnitario: '18',
      componentes: [
        { nombre: 'Producto 1', cantidad: 1 },
        { nombre: 'Producto 2', cantidad: 2 },
      ],
    });
    expect(res.body.total).toBe('19.8');
  });

  it('no se publica en una sede que no ofrece sus componentes', async () => {
    const res = await admin
      .patch(`/api/combos/${comboId}`)
      .send({
        sedes: [
          { sedeId: e.sedeA.id, precio: 18 },
          { sedeId: e.sedeB.id, precio: 15 },
        ],
      })
      .expect(422);
    expect(res.body.error.message).toContain('Producto 2');
  });

  it('si un componente se agota, el combo desaparece del menú y no se puede vender', async () => {
    const gerente = como(app, await tokenPersonal(app, e.usuarios.gerenteSedeA.email));
    const url = `/api/sedes/${e.sedeA.id}/productos/${e.productos.p2.id}`;
    await gerente.put(url).send({ disponible: false }).expect(200);
    expect((await productosMenu()).some((p) => p.id === comboId)).toBe(false);
    await pedir([{ productoId: comboId, cantidad: 1 }]).expect(422);
    await gerente.put(url).send({ disponible: true }).expect(200);
    expect((await productosMenu()).some((p) => p.id === comboId)).toBe(true);
  });

  it('un producto que es parte de un combo de la sede no se puede quitar del menú', async () => {
    await admin.delete(`/api/sedes/${e.sedeA.id}/productos/${e.productos.p2.id}`).expect(409);
  });

  it('solo el admin global crea combos y los agrega a una sede', async () => {
    const gp = como(app, await tokenPersonal(app, e.usuarios.gerentePaisA.email));
    await gp.post('/api/combos').send({}).expect(403);
    const gs = como(app, await tokenPersonal(app, e.usuarios.gerenteSedeA.email));
    await gs.get('/api/combos').expect(200);
    // El gerente sí puede marcar agotado el combo de su sede
    await gs
      .put(`/api/sedes/${e.sedeA.id}/productos/${comboId}`)
      .send({ disponible: false })
      .expect(200);
    await gs
      .put(`/api/sedes/${e.sedeA.id}/productos/${comboId}`)
      .send({ disponible: true })
      .expect(200);
  });

  it('un combo no puede contener otro combo', async () => {
    await admin
      .post('/api/combos')
      .send({
        categoriaId: e.categoria.id,
        sku: `TST-${e.sufijo}-C2`,
        nombre: 'Combo de combos',
        componentes: [
          { productoId: comboId, cantidad: 1 },
          { productoId: e.productos.p1.id, cantidad: 1 },
        ],
      })
      .expect(422);
  });
});

describe('promociones', () => {
  const creadas: number[] = [];
  afterEach(async () => {
    await prisma.promocion.deleteMany({ where: { id: { in: creadas.splice(0) } } });
  });

  const crear = async (cuerpo: Record<string, unknown>, status = 201) => {
    const res = await admin
      .post('/api/promociones')
      .send({
        nombre: 'Promo de prueba',
        fechaInicio: '2020-01-01',
        sedeIds: [e.sedeA.id],
        ...cuerpo,
      })
      .expect(status);
    if (status === 201) creadas.push(res.body.id);
    return res.body;
  };

  it('un % de descuento se aplica al cobrar y queda en el ítem', async () => {
    await crear({
      nombre: 'Veinte',
      tipo: 'PORCENTAJE',
      productoId: e.productos.p1.id,
      porcentaje: 20,
    });
    const res = await pedir([
      { productoId: e.productos.p1.id, cantidad: 2 },
      { productoId: e.productos.p2.id, cantidad: 1 },
    ]).expect(201);
    // 2 × 10 − 20 % = 16; + 5.50 = 21.50; impuesto 2.15; total 23.65
    expect(res.body).toMatchObject({
      subtotal: '21.5',
      descuento: '4',
      impuestos: '2.15',
      total: '23.65',
    });
    const linea = res.body.items.find(
      (i: { productoId: number }) => i.productoId === e.productos.p1.id,
    );
    expect(linea).toMatchObject({ descuento: '4', subtotal: '16', promocionNombre: 'Veinte' });
  });

  it('no se acumulan: gana la que más descuenta', async () => {
    await crear({
      nombre: 'Veinte',
      tipo: 'PORCENTAJE',
      productoId: e.productos.p1.id,
      porcentaje: 20,
    });
    await crear({
      nombre: 'Dos por uno',
      tipo: 'LLEVA_PAGA',
      productoId: e.productos.p1.id,
      llevaN: 2,
      pagaM: 1,
    });
    const uno = await pedir([{ productoId: e.productos.p1.id, cantidad: 1 }]).expect(201);
    expect(uno.body.items[0]).toMatchObject({ descuento: '2', promocionNombre: 'Veinte' });
    // Dos unidades en líneas distintas cuentan juntas para el 2x1
    const dos = await pedir([
      { productoId: e.productos.p1.id, cantidad: 1, notas: 'Sin cebolla' },
      { productoId: e.productos.p1.id, cantidad: 1 },
    ]).expect(201);
    expect(dos.body).toMatchObject({ descuento: '10', subtotal: '10' });
  });

  it('precio especial: rebaja al precio fijado, solo en una moneda y menor al normal', async () => {
    await crear({ tipo: 'PRECIO_FIJO', productoId: e.productos.p2.id, precioEspecial: 4 });
    const res = await pedir([{ productoId: e.productos.p2.id, cantidad: 3 }]).expect(201);
    expect(res.body).toMatchObject({ descuento: '4.5', subtotal: '12' });

    await crear({ tipo: 'PRECIO_FIJO', productoId: e.productos.p2.id, precioEspecial: 6 }, 422);
    await crear(
      {
        tipo: 'PRECIO_FIJO',
        productoId: e.productos.p1.id,
        precioEspecial: 5,
        sedeIds: [e.sedeA.id, e.sedeB.id],
      },
      422,
    );
  });

  it('un % por categoría aplica a todos sus productos', async () => {
    await crear({ tipo: 'PORCENTAJE', categoriaId: e.categoria.id, porcentaje: 10 });
    const res = await pedir([
      { productoId: e.productos.p1.id, cantidad: 1 },
      { productoId: e.productos.p2.id, cantidad: 1 },
    ]).expect(201);
    expect(res.body).toMatchObject({ descuento: '1.55', subtotal: '13.95' });
  });

  it('respeta días, horario, vigencia, pausa y sedes', async () => {
    const hoy = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }),
    ).getDay();
    const otrosDias = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== hoy);
    const base = { tipo: 'PORCENTAJE', productoId: e.productos.p1.id, porcentaje: 50 };
    await crear({ ...base, nombre: 'Otro día', diasSemana: otrosDias });
    await crear({ ...base, nombre: 'Vencida', fechaInicio: '2020-01-01', fechaFin: '2020-12-31' });
    await crear({ ...base, nombre: 'Futura', fechaInicio: '2099-01-01' });
    await crear({ ...base, nombre: 'Pausada', activa: false });
    await crear({
      ...base,
      nombre: 'Otra sede',
      productoId: e.productos.p1.id,
      sedeIds: [e.sedeB.id],
    });

    expect((await menuA()).promociones).toEqual([]);
    const res = await pedir([{ productoId: e.productos.p1.id, cantidad: 1 }]).expect(201);
    expect(res.body.descuento).toBe('0');

    // Activar la pausada la hace aplicar de inmediato
    const pausada = await prisma.promocion.findFirstOrThrow({
      where: { id: { in: creadas }, nombre: 'Pausada' },
    });
    const editada = await admin
      .patch(`/api/promociones/${pausada.id}`)
      .send({ activa: true })
      .expect(200);
    expect(editada.body.estado).toBe('VIGENTE');
    expect((await menuA()).promociones.map((p) => p.nombre)).toEqual(['Pausada']);
  });

  it('el menú marca el producto con su promoción', async () => {
    await crear({ tipo: 'LLEVA_PAGA', productoId: e.productos.p2.id, llevaN: 3, pagaM: 2 });
    const p2 = (await productosMenu()).find((p) => p.id === e.productos.p2.id);
    expect(p2?.promocion).toMatchObject({ etiqueta: '3x2', precioConPromocion: null });
  });

  it('valida los campos de cada tipo', async () => {
    await crear({ tipo: 'PORCENTAJE', productoId: e.productos.p1.id }, 400);
    await crear(
      {
        tipo: 'PORCENTAJE',
        productoId: e.productos.p1.id,
        categoriaId: e.categoria.id,
        porcentaje: 5,
      },
      400,
    );
    await crear({ tipo: 'LLEVA_PAGA', productoId: e.productos.p1.id, llevaN: 2, pagaM: 2 }, 400);
    await crear(
      {
        tipo: 'PORCENTAJE',
        productoId: e.productos.p1.id,
        porcentaje: 5,
        horaInicio: '18:00',
        horaFin: '15:00',
      },
      400,
    );
    await crear(
      { tipo: 'PORCENTAJE', productoId: e.productos.p1.id, porcentaje: 5, sedeIds: [] },
      400,
    );
  });

  it('solo el admin crea; los gerentes ven las de su alcance', async () => {
    const promo = await crear({ tipo: 'PORCENTAJE', productoId: e.productos.p1.id, porcentaje: 5 });
    const gp = como(app, await tokenPersonal(app, e.usuarios.gerentePaisA.email));
    await gp.post('/api/promociones').send({}).expect(403);
    const lista = await gp.get('/api/promociones').expect(200);
    expect(lista.body.map((p: { id: number }) => p.id)).toContain(promo.id);
    const gpB = como(app, await tokenPersonal(app, e.usuarios.gerentePaisB.email));
    const listaB = await gpB.get('/api/promociones').expect(200);
    expect(listaB.body.map((p: { id: number }) => p.id)).not.toContain(promo.id);
    const cajero = como(app, await tokenPersonal(app, e.usuarios.cajeroA.email));
    await cajero.get('/api/promociones').expect(403);
  });
});

describe('reglas de promociones (shared)', () => {
  const regla = (r: Partial<ReglaPromocion>): ReglaPromocion => ({
    id: 1,
    nombre: 'x',
    tipo: 'PORCENTAJE',
    productoId: 1,
    categoriaId: null,
    porcentaje: null,
    precioEspecial: null,
    llevaN: null,
    pagaM: null,
    ...r,
  });

  it('reparte el 2x1 entre líneas del mismo producto sin perder centavos', () => {
    const r = aplicarPromociones(
      [
        { productoId: 1, categoriaId: 9, precio: '3.33', cantidad: 1 },
        { productoId: 1, categoriaId: 9, precio: '3.33', cantidad: 2 },
      ],
      [regla({ tipo: 'LLEVA_PAGA', llevaN: 2, pagaM: 1 })],
    );
    expect(r[0]!.descuento + r[1]!.descuento).toBeCloseTo(3.33, 10);
  });

  it('redondea el porcentaje a centavos (mitad hacia arriba)', () => {
    const [r] = aplicarPromociones(
      [{ productoId: 1, categoriaId: 9, precio: '0.25', cantidad: 1 }],
      [regla({ porcentaje: 10 })],
    );
    expect(r!.descuento).toBe(0.03);
  });

  it('la franja horaria incluye el inicio y excluye el fin', () => {
    const v = {
      fechaInicio: '2026-01-01',
      fechaFin: null,
      diasSemana: [],
      horaInicio: '15:00',
      horaFin: '18:00',
      activa: true,
    };
    expect(promocionVigente(v, '2026-10-25', 0, '15:00')).toBe(true);
    expect(promocionVigente(v, '2026-10-25', 0, '17:59')).toBe(true);
    expect(promocionVigente(v, '2026-10-25', 0, '18:00')).toBe(false);
  });
});
