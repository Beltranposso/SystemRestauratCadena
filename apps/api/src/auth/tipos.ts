import type { RolUsuario, TipoDispositivo } from '@prisma/client';

/** Personal de la cadena autenticado con JWT. */
export interface AuthPersonal {
  tipo: 'usuario';
  id: string;
  rol: RolUsuario;
  paisId: number | null;
  sedeId: number | null;
}

/** Comensal autenticado en el portal. */
export interface AuthCliente {
  tipo: 'cliente';
  id: string;
}

/** Pantalla o kiosco de una sede, autenticado con su token de dispositivo. */
export interface AuthDispositivo {
  tipo: 'dispositivo';
  id: string;
  sedeId: number;
  dispositivo: TipoDispositivo;
}

export type Auth = AuthPersonal | AuthCliente | AuthDispositivo;

declare module 'express-serve-static-core' {
  interface Request {
    auth?: Auth;
  }
}
