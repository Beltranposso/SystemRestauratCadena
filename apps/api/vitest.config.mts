import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Las pruebas de integración usan la BD de apps/api/.env (la del docker-compose).
    // Cada archivo crea su propio escenario aislado (sedes TST-*) y lo borra al terminar.
    env: { NODE_ENV: 'test', UPLOADS_DIR: 'tests/.uploads' },
    globalSetup: ['tests/setup-global.ts'],
    // Un archivo a la vez: la configuración de la cadena (reservas, fila) es global y
    // configuracion.test.ts la apaga y prende; en paralelo afectaría a las demás pruebas.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
