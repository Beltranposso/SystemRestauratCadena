import 'dotenv/config';
import { z } from 'zod';

const duracion = z
  .string()
  .regex(/^\d+[smhd]$/, 'Usa un número seguido de s, m, h o d (ej. 15m, 7d)');

const esquemaEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32, 'Debe tener al menos 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'Debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL: duracion.default('15m'),
  JWT_REFRESH_TTL: duracion.default('7d'),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  /** Carpeta donde se guardan las fotos de productos (relativa a apps/api o absoluta) */
  UPLOADS_DIR: z.string().default('uploads'),
  /**
   * Redis para Socket.IO con varias instancias (Vercel, varios servidores). Sin él, los eventos
   * solo llegan a los clientes conectados a la misma instancia (suficiente en local).
   */
  REDIS_URL: z.string().url().optional(),
  /** Token de Vercel Blob: si existe, las fotos se guardan ahí en vez de en UPLOADS_DIR. */
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const resultado = esquemaEnv.safeParse(process.env);

if (!resultado.success) {
  const detalle = resultado.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // El logger aún no existe: se usa console a propósito.
  console.error(`\nVariables de entorno inválidas (revisa apps/api/.env):\n${detalle}\n`);
  process.exit(1);
}

export const env = resultado.data;
export const esProduccion = env.NODE_ENV === 'production';
export const esTest = env.NODE_ENV === 'test';
