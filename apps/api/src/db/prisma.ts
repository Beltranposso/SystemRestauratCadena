import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env';

/**
 * Cliente único de Prisma. Usa el motor "client" (sin binario de Rust) con el
 * driver `pg`, así que en producción no hay que descargar ni empaquetar motores.
 */
function crearCliente() {
  // TimeZone=UTC en cada conexión: el adaptador envía las fechas sin zona horaria, así que si el
  // servidor de PostgreSQL usa otra zona (p. ej. America/Bogota) las guardaría desplazadas.
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL, options: '-c TimeZone=UTC' });
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

// Vercel solo empaqueta los archivos que encuentra referenciados en el código. Prisma carga su
// motor (WebAssembly) en tiempo de ejecución, así que se nombra aquí para que no quede fuera.
try {
  require.resolve('.prisma/client/query_compiler_bg.wasm');
} catch {
  /* fuera de Vercel no importa */
}

// En desarrollo, `tsx watch` recarga módulos: se reutiliza la instancia para no abrir conexiones de más.
const globalParaPrisma = globalThis as unknown as { prisma?: ReturnType<typeof crearCliente> };

export const prisma = globalParaPrisma.prisma ?? crearCliente();

if (env.NODE_ENV !== 'production') globalParaPrisma.prisma = prisma;

/** Cliente de transacción interactiva (`prisma.$transaction(async (tx) => …)`). */
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
