import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Express } from 'express';
import type { RolUsuario } from '@prisma/client';
import { prisma } from '../src/db/prisma';

/**
 * Escenario aislado para pruebas de integración: dos países con una sede cada uno,
 * menú, mesas, personal de todos los roles, clientes y dispositivos.
 * Todo lleva un sufijo aleatorio y se borra al final; no toca los datos del seed.
 */

export const PASSWORD = 'Test1234!';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const sha = (t: string) => createHash('sha256').update(t).digest('hex');

const letras = 'ABCDEFGHJKLMNPRSTUVWXZ';
const aleatorio = (n: number) =>
  Array.from({ length: n }, () => letras[randomBytes(1)[0]! % letras.length]).join('');

async function codigoPaisLibre() {
  for (;;) {
    const c = aleatorio(2);
    if (['CO', 'MX', 'PE'].includes(c)) continue;
    if (!(await prisma.pais.findUnique({ where: { codigoIso: c } }))) return c;
  }
}

export async function crearEscenario() {
  const s = aleatorio(5);
  const email = (n: string) => `${n}.${s.toLowerCase()}@test.demo`;

  const paisA = await prisma.pais.create({
    data: {
      codigoIso: await codigoPaisLibre(),
      nombre: `Test ${s} A`,
      moneda: 'USD',
      tasaUsd: 1,
      tasaImpuesto: 0.1,
    },
  });
  const paisB = await prisma.pais.create({
    data: {
      codigoIso: await codigoPaisLibre(),
      nombre: `Test ${s} B`,
      moneda: 'EUR',
      tasaUsd: 0.5,
      tasaImpuesto: 0.2,
    },
  });
  const ciudadA = await prisma.ciudad.create({
    data: { paisId: paisA.id, nombre: `Ciudad ${s} A` },
  });
  const ciudadB = await prisma.ciudad.create({
    data: { paisId: paisB.id, nombre: `Ciudad ${s} B` },
  });

  const horario = {
    horaApertura: '00:00',
    horaCierre: '23:59',
    duracionReservaMin: 60,
    horasMinimasCancelacion: 2,
  };
  const sedeA = await prisma.sede.create({
    data: {
      ciudadId: ciudadA.id,
      codigo: `TST-${s}A`,
      nombre: `Sede ${s} A`,
      direccion: 'Calle 1',
      zonaHoraria: 'America/Bogota',
      prefijoPedido: 'Q',
      ...horario,
    },
  });
  const sedeB = await prisma.sede.create({
    data: {
      ciudadId: ciudadB.id,
      codigo: `TST-${s}B`,
      nombre: `Sede ${s} B`,
      direccion: 'Calle 2',
      zonaHoraria: 'Europe/Madrid',
      prefijoPedido: 'Z',
      ...horario,
    },
  });

  const categoria = await prisma.categoria.create({
    data: { nombre: `Test ${s}`, icono: 'star', orden: 99 },
  });
  const crearProducto = (n: number) =>
    prisma.producto.create({
      data: {
        categoriaId: categoria.id,
        sku: `TST-${s}-${n}`,
        nombre: `Producto ${n}`,
        descripcion: '',
      },
    });
  const [p1, p2, p3] = await Promise.all([crearProducto(1), crearProducto(2), crearProducto(3)]);
  await prisma.productoSede.createMany({
    data: [
      { sedeId: sedeA.id, productoId: p1.id, precio: 10 },
      { sedeId: sedeA.id, productoId: p2.id, precio: 5.5 },
      { sedeId: sedeA.id, productoId: p3.id, precio: 3, disponible: false },
      { sedeId: sedeB.id, productoId: p1.id, precio: 8 },
    ],
  });

  const crearMesa = (sedeId: number, codigo: string, capacidad: number, posX: number) =>
    prisma.mesa.create({
      data: {
        sedeId,
        codigo,
        capacidad,
        zona: 'Salón',
        forma: 'CUADRADA',
        posX,
        posY: 50,
        ancho: 100,
        alto: 100,
      },
    });
  const mesaA2 = await crearMesa(sedeA.id, 'A2', 2, 50);
  const mesaA4 = await crearMesa(sedeA.id, 'A4', 4, 200);
  const mesaA6 = await crearMesa(sedeA.id, 'A6', 6, 350);
  const mesaB4 = await crearMesa(sedeB.id, 'B4', 4, 50);

  const usuario = (
    nombre: string,
    rol: RolUsuario,
    alcance: { paisId?: number; sedeId?: number },
  ) =>
    prisma.usuario.create({
      data: {
        nombre,
        email: email(nombre),
        passwordHash: HASH,
        rol,
        paisId: alcance.paisId ?? null,
        sedeId: alcance.sedeId ?? null,
      },
    });

  const usuarios = {
    admin: await usuario('admin', 'ADMIN_GLOBAL', {}),
    gerentePaisA: await usuario('gerentepaisa', 'GERENTE_PAIS', { paisId: paisA.id }),
    gerentePaisB: await usuario('gerentepaisb', 'GERENTE_PAIS', { paisId: paisB.id }),
    gerenteSedeA: await usuario('gerentesedea', 'GERENTE_SEDE', { sedeId: sedeA.id }),
    cajeroA: await usuario('cajeroa', 'CAJERO', { sedeId: sedeA.id }),
    cocinaA: await usuario('cocinaa', 'COCINA', { sedeId: sedeA.id }),
    cajeroB: await usuario('cajerob', 'CAJERO', { sedeId: sedeB.id }),
  };

  const clientes = {
    uno: await prisma.cliente.create({
      data: {
        nombre: 'Cliente Uno',
        email: email('cliente1'),
        telefono: '+57 3000000001',
        passwordHash: HASH,
      },
    }),
    dos: await prisma.cliente.create({
      data: {
        nombre: 'Cliente Dos',
        email: email('cliente2'),
        telefono: '+57 3000000002',
        passwordHash: HASH,
      },
    }),
  };

  const tokens = {
    kioscoA: `kiosco-${s}`,
    pantallaA: `pantalla-${s}`,
    pantallaB: `pantalla-b-${s}`,
  };
  await prisma.dispositivo.createMany({
    data: [
      { sedeId: sedeA.id, nombre: 'Kiosco', tipo: 'KIOSCO', tokenHash: sha(tokens.kioscoA) },
      { sedeId: sedeA.id, nombre: 'Pantalla', tipo: 'PANTALLA', tokenHash: sha(tokens.pantallaA) },
      { sedeId: sedeB.id, nombre: 'Pantalla', tipo: 'PANTALLA', tokenHash: sha(tokens.pantallaB) },
    ],
  });

  return {
    sufijo: s,
    paisA,
    paisB,
    sedeA,
    sedeB,
    categoria,
    productos: { p1, p2, noDisponible: p3 },
    mesas: { a2: mesaA2, a4: mesaA4, a6: mesaA6, b4: mesaB4 },
    usuarios,
    clientes,
    tokens,
    limpiar: () => limpiarDatosDePrueba(s),
  };
}

export type Escenario = Awaited<ReturnType<typeof crearEscenario>>;

/** Borra todo lo creado por las pruebas (de un escenario, o de todos si sufijo está vacío). */
export async function limpiarDatosDePrueba(sufijo = '') {
  const sedes = await prisma.sede.findMany({
    where: { codigo: { startsWith: `TST-${sufijo}` } },
    select: { id: true },
  });
  const sedeIds = sedes.map((x) => x.id);
  const correo = {
    endsWith: '@test.demo',
    ...(sufijo ? { contains: `.${sufijo.toLowerCase()}@` } : {}),
  };

  await prisma.reserva.deleteMany({
    where: { OR: [{ sedeId: { in: sedeIds } }, { cliente: { email: correo } }] },
  });
  await prisma.entradaEspera.deleteMany({ where: { sedeId: { in: sedeIds } } });
  await prisma.pedido.deleteMany({ where: { sedeId: { in: sedeIds } } });
  await prisma.usuario.deleteMany({ where: { email: correo } });
  await prisma.cliente.deleteMany({ where: { email: correo } });
  await prisma.sede.deleteMany({ where: { id: { in: sedeIds } } });
  // Primero los combos: sus componentes no se pueden borrar mientras un combo los use
  await prisma.producto.deleteMany({
    where: { sku: { startsWith: `TST-${sufijo}` }, esCombo: true },
  });
  await prisma.producto.deleteMany({ where: { sku: { startsWith: `TST-${sufijo}` } } });
  await prisma.categoria.deleteMany({ where: { nombre: { startsWith: `Test ${sufijo}` } } });
  await prisma.ciudad.deleteMany({ where: { pais: { nombre: { startsWith: `Test ${sufijo}` } } } });
  await prisma.pais.deleteMany({ where: { nombre: { startsWith: `Test ${sufijo}` } } });
}

// ───────────────────────────── Ayudas HTTP ─────────────────────────────

export async function tokenPersonal(app: Express, email: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200)
    throw new Error(`Login falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.accessToken;
}

export async function tokenCliente(app: Express, email: string): Promise<string> {
  const res = await request(app)
    .post('/api/clientes/auth/login')
    .send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`Login de cliente falló: ${res.status}`);
  return res.body.accessToken;
}

/** Cliente HTTP con el token puesto: api(token).get('/api/...') */
export function como(app: Express, token: string) {
  const conToken = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  return {
    get: (url: string) => conToken(request(app).get(url)),
    post: (url: string) => conToken(request(app).post(url)),
    put: (url: string) => conToken(request(app).put(url)),
    patch: (url: string) => conToken(request(app).patch(url)),
    delete: (url: string) => conToken(request(app).delete(url)),
  };
}

export function comoDispositivo(app: Express, token: string) {
  const conToken = (r: request.Test) => r.set('X-Device-Token', token);
  return {
    get: (url: string) => conToken(request(app).get(url)),
    post: (url: string) => conToken(request(app).post(url)),
  };
}

/** Fecha local (YYYY-MM-DD) de mañana en la zona indicada. */
export function manana(zona: string) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return f.format(new Date(Date.now() + 86_400_000));
}
