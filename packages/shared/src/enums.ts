/**
 * Enums del dominio. Deben coincidir con los enums de apps/api/prisma/schema.prisma
 * (la prueba `shared-enums.test.ts` de la API lo verifica).
 * Se definen como objetos `as const` para poder usarlos en el frontend sin depender de Prisma.
 */

const valores = <T extends string>(...v: T[]) =>
  Object.freeze(Object.fromEntries(v.map((x) => [x, x])) as { [K in T]: K });

export const RolUsuario = valores(
  'ADMIN_GLOBAL',
  'GERENTE_PAIS',
  'GERENTE_SEDE',
  'CAJERO',
  'COCINA',
);
export type RolUsuario = keyof typeof RolUsuario;

export const TipoDispositivo = valores('PANTALLA', 'KIOSCO');
export type TipoDispositivo = keyof typeof TipoDispositivo;

export const CanalPedido = valores('CAJA', 'KIOSCO', 'WEB');
export type CanalPedido = keyof typeof CanalPedido;

export const EstadoPedido = valores(
  'RECIBIDO',
  'EN_PREPARACION',
  'LISTO',
  'ENTREGADO',
  'CANCELADO',
);
export type EstadoPedido = keyof typeof EstadoPedido;

export const MetodoPago = valores('EFECTIVO', 'TARJETA', 'TRANSFERENCIA');
export type MetodoPago = keyof typeof MetodoPago;

export const TipoSecuencia = valores('PEDIDO', 'ESPERA');
export type TipoSecuencia = keyof typeof TipoSecuencia;

export const PuestoTurno = valores('CAJA', 'COCINA', 'SERVICIO', 'GERENCIA');
export type PuestoTurno = keyof typeof PuestoTurno;

export const EstadoTurno = valores('PROGRAMADO', 'EN_CURSO', 'COMPLETADO', 'AUSENTE');
export type EstadoTurno = keyof typeof EstadoTurno;

export const FormaMesa = valores('REDONDA', 'CUADRADA', 'RECTANGULAR');
export type FormaMesa = keyof typeof FormaMesa;

export const EstadoMesa = valores('LIBRE', 'RESERVADA', 'OCUPADA', 'LIMPIEZA', 'FUERA_SERVICIO');
export type EstadoMesa = keyof typeof EstadoMesa;

export const EstadoReserva = valores(
  'PENDIENTE',
  'CONFIRMADA',
  'SENTADA',
  'COMPLETADA',
  'CANCELADA',
  'NO_SHOW',
);
export type EstadoReserva = keyof typeof EstadoReserva;

export const EstadoEspera = valores('ESPERANDO', 'NOTIFICADO', 'SENTADO', 'ABANDONO');
export type EstadoEspera = keyof typeof EstadoEspera;

export const OrigenSesion = valores('RESERVA', 'ESPERA', 'DIRECTO');
export type OrigenSesion = keyof typeof OrigenSesion;

export const CanalNotificacion = valores('EN_APP', 'EMAIL');
export type CanalNotificacion = keyof typeof CanalNotificacion;

export const TipoNotificacion = valores(
  'CONFIRMACION_RESERVA',
  'CAMBIO_RESERVA',
  'MESA_LISTA',
  'RECORDATORIO',
);
export type TipoNotificacion = keyof typeof TipoNotificacion;

export const EstadoNotificacion = valores('PENDIENTE', 'ENVIADA', 'FALLIDA');
export type EstadoNotificacion = keyof typeof EstadoNotificacion;

export const TipoPromocion = valores('PORCENTAJE', 'PRECIO_FIJO', 'LLEVA_PAGA');
export type TipoPromocion = keyof typeof TipoPromocion;
