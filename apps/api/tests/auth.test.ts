import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { crearApp } from '../src/app';
import { prisma } from '../src/db/prisma';
import {
  PASSWORD,
  como,
  comoDispositivo,
  crearEscenario,
  tokenPersonal,
  type Escenario,
} from './escenario';

const app = crearApp();
let e: Escenario;

beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  await e.limpiar();
  await prisma.$disconnect();
});

const cookieDe = (res: request.Response, nombre: string) =>
  (res.headers['set-cookie'] as unknown as string[] | undefined)
    ?.find((c) => c.startsWith(`${nombre}=`))
    ?.split(';')[0];

describe('login del personal', () => {
  it('entrega access token, datos del usuario y cookie httpOnly de refresh', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: e.usuarios.cajeroA.email, password: PASSWORD })
      .expect(200);
    expect(res.body.accessToken).toMatch(/^ey/);
    expect(res.body.usuario).toMatchObject({ rol: 'CAJERO', sedeId: e.sedeA.id });
    expect(res.body.usuario.passwordHash).toBeUndefined();
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('rt='),
    )!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Path=\/api\/auth/);
  });

  it('rechaza contraseña incorrecta y email inexistente con el mismo mensaje', async () => {
    const a = await request(app)
      .post('/api/auth/login')
      .send({ email: e.usuarios.cajeroA.email, password: 'mala' })
      .expect(401);
    const b = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nadie@test.demo', password: 'mala' })
      .expect(401);
    expect(a.body).toEqual(b.body);
  });

  it('rechaza cuentas desactivadas', async () => {
    const u = await prisma.usuario.create({
      data: {
        nombre: 'Inactivo',
        email: `inactivo.${e.sufijo.toLowerCase()}@test.demo`,
        passwordHash: (
          await prisma.usuario.findUniqueOrThrow({ where: { id: e.usuarios.cajeroA.id } })
        ).passwordHash,
        rol: 'CAJERO',
        sedeId: e.sedeA.id,
        activo: false,
      },
    });
    await request(app)
      .post('/api/auth/login')
      .send({ email: u.email, password: PASSWORD })
      .expect(403);
  });

  it('GET /auth/me exige token y devuelve el alcance', async () => {
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/auth/me').set('Authorization', 'Bearer basura').expect(401);
    const token = await tokenPersonal(app, e.usuarios.gerentePaisA.email);
    const me = await como(app, token).get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({ rol: 'GERENTE_PAIS', pais: { id: e.paisA.id } });
  });
});

describe('refresh rotativo', () => {
  it('rota la cookie y detecta la reutilización de una cookie vieja', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: e.usuarios.cocinaA.email, password: PASSWORD });
    const c1 = cookieDe(login, 'rt')!;

    const r1 = await request(app).post('/api/auth/refresh').set('Cookie', c1).expect(200);
    const c2 = cookieDe(r1, 'rt')!;
    expect(c2).not.toEqual(c1);
    expect(r1.body.accessToken).toMatch(/^ey/);

    // Reusar c1 (robada) invalida toda la familia, incluida c2
    await request(app).post('/api/auth/refresh').set('Cookie', c1).expect(401);
    await request(app).post('/api/auth/refresh').set('Cookie', c2).expect(401);
  });

  it('logout revoca la sesión', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: e.usuarios.cocinaA.email, password: PASSWORD });
    const c = cookieDe(login, 'rt')!;
    await request(app).post('/api/auth/logout').set('Cookie', c).expect(204);
    await request(app).post('/api/auth/refresh').set('Cookie', c).expect(401);
  });
});

describe('clientes del portal', () => {
  const nuevo = () => ({
    nombre: 'Laura Nueva',
    email: `nueva.${e.sufijo.toLowerCase()}@test.demo`,
    telefono: '+57 3001112233',
    password: 'ClaveSegura1',
  });

  it('registro, login y perfil', async () => {
    const reg = await request(app).post('/api/clientes/auth/registro').send(nuevo()).expect(201);
    expect(reg.body.cliente.email).toBe(nuevo().email);
    expect(cookieDe(reg, 'rt_cliente')).toBeDefined();
    await request(app).post('/api/clientes/auth/registro').send(nuevo()).expect(409);

    const login = await request(app)
      .post('/api/clientes/auth/login')
      .send({ email: nuevo().email, password: 'ClaveSegura1' })
      .expect(200);
    const perfil = await como(app, login.body.accessToken).get('/api/clientes/me').expect(200);
    expect(perfil.body.nombre).toBe('Laura Nueva');
  });

  it('un token de cliente no sirve para rutas del personal y viceversa', async () => {
    const login = await request(app)
      .post('/api/clientes/auth/login')
      .send({ email: e.clientes.uno.email, password: PASSWORD });
    await como(app, login.body.accessToken).get('/api/pedidos').expect(403);
    const personal = await tokenPersonal(app, e.usuarios.admin.email);
    await como(app, personal).get('/api/clientes/me').expect(403);
  });
});

describe('dispositivos', () => {
  it('el dispositivo consulta su propia sede', async () => {
    const yo = await comoDispositivo(app, e.tokens.kioscoA).get('/api/dispositivos/yo').expect(200);
    expect(yo.body).toMatchObject({ tipo: 'KIOSCO', sede: { id: e.sedeA.id } });
    const token = await tokenPersonal(app, e.usuarios.admin.email);
    await como(app, token).get('/api/dispositivos/yo').expect(403);
  });

  it('acepta tokens válidos y rechaza los inválidos o de otra sede', async () => {
    await comoDispositivo(app, e.tokens.pantallaA)
      .get(`/api/pantalla/${e.sedeA.id}/pedidos`)
      .expect(200);
    await comoDispositivo(app, 'token-falso')
      .get(`/api/pantalla/${e.sedeA.id}/pedidos`)
      .expect(401);
    await comoDispositivo(app, e.tokens.pantallaB)
      .get(`/api/pantalla/${e.sedeA.id}/pedidos`)
      .expect(403);
  });

  it('un gerente registra un dispositivo y recibe el token una sola vez', async () => {
    const token = await tokenPersonal(app, e.usuarios.gerenteSedeA.email);
    const admin = await tokenPersonal(app, e.usuarios.admin.email);
    await como(app, admin)
      .put(`/api/sedes/${e.sedeA.id}/cupos`)
      .send({ cupoPantallas: 2 })
      .expect(200);
    const res = await como(app, token)
      .post(`/api/sedes/${e.sedeA.id}/dispositivos`)
      .send({ nombre: 'Pantalla 2', tipo: 'PANTALLA' })
      .expect(201);
    expect(res.body.token).toMatch(/^dsp_/);
    await comoDispositivo(app, res.body.token)
      .get(`/api/pantalla/${e.sedeA.id}/pedidos`)
      .expect(200);
    const lista = await como(app, token).get(`/api/sedes/${e.sedeA.id}/dispositivos`).expect(200);
    expect(JSON.stringify(lista.body)).not.toContain('token');
  });
});

describe('alcance geográfico', () => {
  it('cada rol ve solo sus sedes', async () => {
    const admin = await tokenPersonal(app, e.usuarios.admin.email);
    const gp = await tokenPersonal(app, e.usuarios.gerentePaisA.email);
    const cajero = await tokenPersonal(app, e.usuarios.cajeroB.email);

    const todas = (await como(app, admin).get('/api/sedes').expect(200)).body.map(
      (s: { id: number }) => s.id,
    );
    expect(todas).toEqual(expect.arrayContaining([e.sedeA.id, e.sedeB.id]));

    const delPais = (await como(app, gp).get('/api/sedes').expect(200)).body.map(
      (s: { id: number }) => s.id,
    );
    expect(delPais).toEqual([e.sedeA.id]);

    const propia = (await como(app, cajero).get('/api/sedes').expect(200)).body.map(
      (s: { id: number }) => s.id,
    );
    expect(propia).toEqual([e.sedeB.id]);

    await como(app, gp).get(`/api/sedes/${e.sedeB.id}`).expect(403);
    await como(app, cajero).get(`/api/sedes/${e.sedeA.id}`).expect(403);
  });

  it('un usuario de una sede recibe 403 al consultar otra', async () => {
    const cajeroB = await tokenPersonal(app, e.usuarios.cajeroB.email);
    await como(app, cajeroB).get(`/api/sedes/${e.sedeA.id}/pedidos/activos`).expect(403);
    await como(app, cajeroB).get(`/api/pedidos?sedeId=${e.sedeA.id}`).expect(403);
    await como(app, cajeroB).get(`/api/sedes/${e.sedeA.id}/mesas`).expect(403);
    await como(app, cajeroB).get(`/api/reservas?sedeId=${e.sedeA.id}`).expect(403);
  });

  it('los gerentes solo crean usuarios de roles inferiores dentro de su alcance', async () => {
    const gs = await tokenPersonal(app, e.usuarios.gerenteSedeA.email);
    const base = { nombre: 'Nuevo Cajero', password: 'ClaveSegura1', sedeId: e.sedeA.id };
    await como(app, gs)
      .post('/api/usuarios')
      .send({ ...base, email: `nc.${e.sufijo.toLowerCase()}@test.demo`, rol: 'CAJERO' })
      .expect(201);
    await como(app, gs)
      .post('/api/usuarios')
      .send({ ...base, email: `ng.${e.sufijo.toLowerCase()}@test.demo`, rol: 'GERENTE_SEDE' })
      .expect(403);
    await como(app, gs)
      .post('/api/usuarios')
      .send({
        ...base,
        email: `nb.${e.sufijo.toLowerCase()}@test.demo`,
        rol: 'CAJERO',
        sedeId: e.sedeB.id,
      })
      .expect(403);

    const lista = await como(app, gs).get('/api/usuarios').expect(200);
    expect(lista.body.datos.every((u: { sedeId: number }) => u.sedeId === e.sedeA.id)).toBe(true);
  });

  it('desactivar a un usuario cierra sus sesiones', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: e.usuarios.cajeroA.email, password: PASSWORD });
    const cookie = cookieDe(login, 'rt')!;
    const gs = await tokenPersonal(app, e.usuarios.gerenteSedeA.email);
    await como(app, gs)
      .patch(`/api/usuarios/${e.usuarios.cajeroA.id}`)
      .send({ activo: false })
      .expect(200);
    await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    await como(app, gs)
      .patch(`/api/usuarios/${e.usuarios.cajeroA.id}`)
      .send({ activo: true })
      .expect(200);
  });
});
