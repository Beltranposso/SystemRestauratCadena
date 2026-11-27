import type { Cliente, Dispositivo, Usuario } from '../domain/tipos';

/**
 * Puente deliberadamente pequeño entre el store y la infraestructura HTTP.
 * Así `api.ts` puede leer tokens y avisar de sesiones caídas sin importar `store.ts`
 * (que a su vez importa las APIs de RTK Query): no hay ciclo de módulos.
 */
export interface SesionBridge {
  obtenerEstado: () => {
    personal: { token: string | null };
    cliente: { token: string | null };
    dispositivo: { token: string | null };
  };
  despachar: (accion: unknown) => unknown;
  fijarPersonal: (token: string, usuario: Usuario) => void;
  cerrarPersonal: () => void;
  fijarCliente: (token: string, cliente: Cliente) => void;
  cerrarCliente: () => void;
  fijarDispositivo: (token: string, dispositivo: Dispositivo) => void;
  olvidarDispositivo: (revocado?: boolean) => void;
}

let puente: SesionBridge | null = null;

export function registrarPuente(nuevo: SesionBridge): void {
  puente = nuevo;
}

function obtener(): SesionBridge {
  if (!puente) throw new Error('La sesión de la aplicación todavía no está inicializada');
  return puente;
}

export const estadoSesion = () => obtener().obtenerEstado();
export const despachar = (accion: unknown) => obtener().despachar(accion);
export const fijarPersonal = (token: string, usuario: Usuario) => obtener().fijarPersonal(token, usuario);
export const cerrarPersonal = () => obtener().cerrarPersonal();
export const fijarCliente = (token: string, cliente: Cliente) => obtener().fijarCliente(token, cliente);
export const cerrarCliente = () => obtener().cerrarCliente();
export const fijarDispositivo = (token: string, dispositivo: Dispositivo) =>
  obtener().fijarDispositivo(token, dispositivo);
export const olvidarDispositivo = (revocado = false) => obtener().olvidarDispositivo(revocado);
