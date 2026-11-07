/**
 * Se ejecuta una vez antes de todas las pruebas: borra restos de ejecuciones
 * interrumpidas (todo lo que lleve el prefijo TST- o el dominio @test.demo) y activa
 * las funciones opcionales (reservas, salir de la fila). Al terminar, deja la configuración
 * como estaba.
 */
export default async function () {
  process.env.NODE_ENV = 'test';
  const { limpiarDatosDePrueba } = await import('./escenario');
  const { prisma } = await import('../src/db/prisma');
  await limpiarDatosDePrueba();
  const antes = await prisma.configuracion.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
  await prisma.configuracion.update({
    where: { id: 1 },
    data: { reservasHabilitadas: true, salirFilaHabilitado: true },
  });
  await prisma.$disconnect();

  return async () => {
    await prisma.configuracion.update({
      where: { id: 1 },
      data: {
        reservasHabilitadas: antes.reservasHabilitadas,
        salirFilaHabilitado: antes.salirFilaHabilitado,
      },
    });
    await prisma.$disconnect();
  };
}
