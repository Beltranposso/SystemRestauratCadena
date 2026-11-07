/**
 * Seed de demostración. Borra TODOS los datos y genera una cadena con 3 países y 9 sedes.
 * Uso: npm run db:seed   (o automáticamente tras `prisma migrate reset`)
 *
 * Variables opcionales:
 *   SEED_DIAS_PEDIDOS  días de pedidos sintéticos (por defecto 90)
 *   SEED_SEMILLA       semilla del generador aleatorio (por defecto 20261025)
 */
import { prisma } from '../../src/db/prisma';
import { crearRng } from './aleatorio';
import {
  limpiar,
  sembrarGeografiaYCatalogo,
  sembrarMesas,
  sembrarPersonas,
  sembrarPromociones,
  sembrarTurnos,
} from './base';
import { PASSWORD_DEMO } from './datos';
import { sembrarPedidos } from './pedidos';
import { sembrarSalon } from './salon';

async function main() {
  const inicio = Date.now();
  const ahora = new Date();
  const dias = Number(process.env.SEED_DIAS_PEDIDOS ?? 90);
  const rng = crearRng(Number(process.env.SEED_SEMILLA ?? 20261025));
  const paso = (msg: string) => console.log(`\n▸ ${msg}`);

  paso('Limpiando la base de datos');
  await limpiar(prisma);

  paso('Geografía, catálogo y menús por sede');
  const sedes = await sembrarGeografiaYCatalogo(prisma, rng);

  paso('Promociones');
  await sembrarPromociones(prisma, sedes, ahora);

  paso('Personal, clientes y dispositivos');
  const { clientes, credenciales, tokens } = await sembrarPersonas(prisma, rng, sedes);

  paso('Mesas del salón');
  await sembrarMesas(prisma, sedes);

  paso('Turnos del personal');
  const turnos = await sembrarTurnos(prisma, rng, sedes, ahora);

  paso(`Pedidos de los últimos ${dias} días`);
  const pedidos = await sembrarPedidos(prisma, rng, sedes, ahora, dias);

  paso('Reservas, cola de espera, ocupación y calificaciones');
  const salon = await sembrarSalon(prisma, rng, sedes, clientes, ahora);

  const seg = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(`
✔ Seed completo en ${seg} s
  Sedes: ${sedes.length} · Turnos: ${turnos} · Clientes: ${clientes.length}
  Pedidos: ${pedidos.pedidos.toLocaleString('es-CO')} (${pedidos.items.toLocaleString('es-CO')} ítems, ${pedidos.activosHoy} activos ahora)
  Reservas: ${salon.reservas.toLocaleString('es-CO')} · Sesiones de mesa: ${salon.sesiones.toLocaleString('es-CO')} · En cola ahora: ${salon.esperandoAhora}

Cuentas de prueba (contraseña: ${PASSWORD_DEMO})`);
  console.table(credenciales);
  console.log('Tokens de dispositivo (solo demo):');
  console.table(tokens.filter((t) => t.sede === 'CTG-01'));
  console.log(
    'El resto sigue el patrón <pantalla|kiosco>-<codigo-sede>-demo, p. ej. pantalla-bog-01-demo.\n' +
      'CTG-01 tiene cupo para 3 kioscos y 2 pantallas: usa 2 kioscos (kiosco-… y kiosco2-…) y 1 pantalla.\n',
  );
}

main()
  .catch((e) => {
    console.error('\n✘ El seed falló:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
