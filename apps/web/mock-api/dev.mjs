/**
 * Arranca el mock (puerto 4000) y el frontend (Vite, puerto 5173) juntos.
 *
 *   npm run dev:all
 */
import { spawn } from 'node:child_process';

const esWindows = process.platform === 'win32';

const mock = spawn(process.execPath, ['mock-api/server.mjs'], { stdio: 'inherit' });
const web = spawn(esWindows ? 'cmd.exe' : 'npm', esWindows ? ['/c', 'npm run dev'] : ['run', 'dev'], {
  stdio: 'inherit',
});

let cerrando = false;
const cerrar = (codigo = 0) => {
  if (cerrando) return;
  cerrando = true;
  mock.kill();
  web.kill();
  process.exit(codigo);
};

const falloAlIniciar = (nombre) => (error) => {
  if (cerrando) return;
  console.error(`\nNo se pudo iniciar ${nombre}: ${error.message}`);
  cerrar(1);
};

process.on('SIGINT', () => cerrar(0));
process.on('SIGTERM', () => cerrar(0));
mock.on('error', falloAlIniciar('el mock'));
web.on('error', falloAlIniciar('Vite'));
web.on('exit', (codigo) => cerrar(codigo ?? 0));
mock.on('exit', (codigo) => {
  if (codigo && !cerrando) {
    console.error(`\nEl mock terminó con código ${codigo}.`);
    cerrar(codigo);
  }
});
