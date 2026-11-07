/**
 * Nombres de salas y eventos de Socket.IO. Centralizarlos evita errores de tipeo
 * entre quien emite (API) y quien escucha (web).
 */

export const SALAS = {
  cocina: (sedeId: number) => `sede:${sedeId}:cocina`,
  pantalla: (sedeId: number) => `sede:${sedeId}:pantalla`,
  caja: (sedeId: number) => `sede:${sedeId}:caja`,
  salon: (sedeId: number) => `sede:${sedeId}:salon`,
  cliente: (clienteId: string) => `cliente:${clienteId}`,
  /** Para comensales sin cuenta que siguen su turno en la cola */
  espera: (entradaId: string) => `espera:${entradaId}`,
} as const;

export const EVENTOS = {
  // cliente -> servidor
  unirseSede: 'sede:unirse',
  salirSede: 'sede:salir',
  unirseEspera: 'espera:unirse',
  // servidor -> cliente
  pedidoCreado: 'pedido:creado',
  pedidoActualizado: 'pedido:actualizado',
  mesaEstado: 'mesa:estado',
  esperaActualizada: 'espera:actualizada',
  reservaActualizada: 'reserva:actualizada',
  mesaListaCliente: 'cliente:mesa-lista',
  notificacion: 'notificacion',
  /** A la sala pantalla de la sede: cambió el menú o una promoción (los kioscos recargan) */
  menuActualizado: 'menu:actualizado',
  /** Al propio dispositivo justo antes de cortarle la conexión */
  dispositivoRevocado: 'dispositivo:revocado',
  /** A todos: el admin cambió nombre, logo o colores */
  marcaActualizada: 'marca:actualizada',
  /** A todos: el admin activó o desactivó reservas o la salida de la fila */
  configuracionActualizada: 'configuracion:actualizada',
} as const;

export type CanalSede = 'cocina' | 'pantalla' | 'caja' | 'salon';
export const CANALES_SEDE: readonly CanalSede[] = ['cocina', 'pantalla', 'caja', 'salon'];
