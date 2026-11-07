import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { crearApp } from '../src/crear-app';
import { prisma } from '../src/db/prisma';
import { siguienteConsecutivo } from '../src/db/secuencias';
import { crearEscenario, type Escenario } from './escenario';

const app = crearApp();
let e: Escenario;

beforeAll(async () => {
  e = await crearEscenario();
});
afterAll(async () => {
  await e.limpiar();
  await prisma.$disconnect();
});

describe('infraestructura HTTP', () => {
  it('GET /api/health responde ok con la BD conectada', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body).toMatchObject({ estado: 'ok', bd: 'ok' });
  });

  it('errores con forma uniforme', async () => {
    const res = await request(app).get('/api/no-existe').expect(404);
    expect(res.body).toEqual({
      error: { code: 'RUTA_NO_ENCONTRADA', message: 'No existe GET /api/no-existe' },
    });
    const json = await request(app)
      .post('/api/auth/login')
      .set('content-type', 'application/json')
      .send('{roto')
      .expect(400);
    expect(json.body.error.code).toBe('JSON_INVALIDO');
  });

  it('validación con detalle por campo', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'no-es-email' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDACION');
    expect(res.body.error.details.map((d: { campo: string }) => d.campo).sort()).toEqual([
      'email',
      'password',
    ]);
  });

  it('cabeceras de seguridad', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('publica la documentación OpenAPI', async () => {
    const doc = await request(app).get('/api/openapi.json').expect(200);
    expect(doc.body.openapi).toBe('3.0.3');
    expect(doc.body.paths['/api/pedidos'].post.summary).toBeTruthy();
    expect(doc.body.paths['/api/reservas'].post.requestBody).toBeDefined();
    await request(app).get('/api/docs/').expect(200);
  });
});

describe('consecutivo diario', () => {
  it('no repite números con 40 pedidos simultáneos', async () => {
    const numeros = await Promise.all(
      Array.from({ length: 40 }, () =>
        prisma.$transaction((tx) => siguienteConsecutivo(tx, e.sedeA.id, '2030-01-15')),
      ),
    );
    expect([...numeros].sort((a, b) => a - b)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
  });

  it('reinicia cada día y separa pedidos de cola de espera', async () => {
    expect(await siguienteConsecutivo(prisma, e.sedeA.id, '2030-01-16')).toBe(1);
    expect(await siguienteConsecutivo(prisma, e.sedeA.id, '2030-01-16')).toBe(2);
    expect(await siguienteConsecutivo(prisma, e.sedeA.id, '2030-01-16', 'ESPERA')).toBe(1);
  });

  it('revierte el número si la transacción falla', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await siguienteConsecutivo(tx, e.sedeA.id, '2030-01-17');
        throw new Error('falla');
      }),
    ).rejects.toThrow('falla');
    expect(await siguienteConsecutivo(prisma, e.sedeA.id, '2030-01-17')).toBe(1);
  });
});
