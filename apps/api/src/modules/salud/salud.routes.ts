import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { esProduccion } from '../../config/env';

export const rutasSalud = Router();

const inicio = Date.now();

/**
 * GET /api/health
 * 200 si la API y la base de datos responden; 503 si la BD no está disponible.
 * Fuera de producción incluye un conteo de datos para verificar el seed.
 */
rutasSalud.get('/', async (_req, res) => {
  const base = {
    servicio: 'restaurantes-api',
    version: process.env.npm_package_version ?? '0.1.0',
    uptimeSeg: Math.round((Date.now() - inicio) / 1000),
    hora: new Date().toISOString(),
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    res.status(503).json({ ...base, estado: 'degradado', bd: 'sin conexión' });
    return;
  }

  if (esProduccion) {
    res.json({ ...base, estado: 'ok', bd: 'ok' });
    return;
  }

  const [paises, sedes, productos, usuarios, clientes, mesas, pedidos, reservas, turnos] =
    await Promise.all([
      prisma.pais.count(),
      prisma.sede.count(),
      prisma.producto.count(),
      prisma.usuario.count(),
      prisma.cliente.count(),
      prisma.mesa.count(),
      prisma.pedido.count(),
      prisma.reserva.count(),
      prisma.turno.count(),
    ]);

  res.json({
    ...base,
    estado: 'ok',
    bd: 'ok',
    datos: { paises, sedes, productos, usuarios, clientes, mesas, pedidos, reservas, turnos },
  });
});
