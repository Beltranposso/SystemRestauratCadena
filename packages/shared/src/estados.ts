import type { EstadoMesa, EstadoPedido, EstadoReserva, EstadoEspera } from './enums';

/**
 * Máquinas de estado. La API las usa para validar cada cambio y la web para
 * decidir qué botones mostrar. Un estado sin salidas es final.
 */

export const TRANSICIONES_PEDIDO: Readonly<Record<EstadoPedido, readonly EstadoPedido[]>> = {
  RECIBIDO: ['EN_PREPARACION', 'CANCELADO'],
  EN_PREPARACION: ['LISTO', 'CANCELADO'],
  LISTO: ['ENTREGADO'],
  ENTREGADO: [],
  CANCELADO: [],
};

export const TRANSICIONES_RESERVA: Readonly<Record<EstadoReserva, readonly EstadoReserva[]>> = {
  PENDIENTE: ['CONFIRMADA', 'CANCELADA'],
  CONFIRMADA: ['SENTADA', 'CANCELADA', 'NO_SHOW'],
  SENTADA: ['COMPLETADA'],
  COMPLETADA: [],
  CANCELADA: [],
  NO_SHOW: [],
};

export const TRANSICIONES_ESPERA: Readonly<Record<EstadoEspera, readonly EstadoEspera[]>> = {
  ESPERANDO: ['NOTIFICADO', 'SENTADO', 'ABANDONO'],
  NOTIFICADO: ['SENTADO', 'ABANDONO'],
  SENTADO: [],
  ABANDONO: [],
};

export const TRANSICIONES_MESA: Readonly<Record<EstadoMesa, readonly EstadoMesa[]>> = {
  LIBRE: ['RESERVADA', 'OCUPADA', 'FUERA_SERVICIO'],
  RESERVADA: ['OCUPADA', 'LIBRE'],
  OCUPADA: ['LIMPIEZA', 'LIBRE'],
  LIMPIEZA: ['LIBRE'],
  FUERA_SERVICIO: ['LIBRE'],
};

export function puedeTransicionar<E extends string>(
  mapa: Readonly<Record<E, readonly E[]>>,
  desde: E,
  hacia: E,
): boolean {
  return mapa[desde].includes(hacia);
}

/** Estados en los que un pedido sigue "vivo" para cocina y pantalla. */
export const ESTADOS_PEDIDO_ACTIVOS: readonly EstadoPedido[] = [
  'RECIBIDO',
  'EN_PREPARACION',
  'LISTO',
];

/** Estados en los que una reserva ocupa su mesa en el calendario. */
export const ESTADOS_RESERVA_ACTIVOS: readonly EstadoReserva[] = [
  'PENDIENTE',
  'CONFIRMADA',
  'SENTADA',
];
