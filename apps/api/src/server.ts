import { createServer } from 'node:http';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './db/prisma';
import { crearApp } from './app';
import { cerrarSocket, iniciarSocket } from './realtime/socket';

const app = crearApp();
const servidor = createServer(app);
iniciarSocket(servidor);

servidor.listen(env.PORT, () => {
  logger.info(`API escuchando en http://localhost:${env.PORT}/api (${env.NODE_ENV})`);
});

let cerrando = false;
async function apagar(senal: string) {
  if (cerrando) return;
  cerrando = true;
  logger.info(`${senal} recibido, cerrando conexiones…`);
  const forzar = setTimeout(() => process.exit(1), 10_000).unref();
  await cerrarSocket();
  servidor.close(async () => {
    await prisma.$disconnect();
    clearTimeout(forzar);
    process.exit(0);
  });
}

process.on('SIGINT', () => void apagar('SIGINT'));
process.on('SIGTERM', () => void apagar('SIGTERM'));
process.on('unhandledRejection', (razon) =>
  logger.error({ razon }, 'Promesa rechazada sin manejar'),
);
