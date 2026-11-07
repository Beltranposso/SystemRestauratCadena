import { prisma } from '../../db/prisma';
import { HttpError } from '../../utils/http-error';

/**
 * Funciones de la cadena que el admin global prende o apaga. Se leen en cada reserva o salida
 * de la fila, así que se guardan 15 s en memoria; los cambios invalidan la caché al instante.
 */
export interface Configuracion {
  reservasHabilitadas: boolean;
  salirFilaHabilitado: boolean;
  actualizadoEn: Date;
}

const TTL_MS = 15_000;
let cache: { valor: Configuracion; hasta: number } | null = null;

export async function obtenerConfiguracion(): Promise<Configuracion> {
  if (cache && cache.hasta > Date.now()) return cache.valor;
  const valor = await prisma.configuracion.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
    select: { reservasHabilitadas: true, salirFilaHabilitado: true, actualizadoEn: true },
  });
  cache = { valor, hasta: Date.now() + TTL_MS };
  return valor;
}

export function invalidarConfiguracion() {
  cache = null;
}

/** 403 si la cadena no ofrece reservas de mesa. */
export async function exigirReservas() {
  if (!(await obtenerConfiguracion()).reservasHabilitadas)
    throw new HttpError(
      403,
      'RESERVAS_DESHABILITADAS',
      'Este restaurante no recibe reservas de mesa. Puedes anotarte en la fila al llegar.',
    );
}
