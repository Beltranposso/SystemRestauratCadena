import type { Prisma, RolUsuario } from '@prisma/client';
import { prisma } from '../db/prisma';
import { HttpError } from '../utils/http-error';
import type { Auth, AuthDispositivo, AuthPersonal } from './tipos';

/**
 * Alcance geográfico: qué sedes puede ver o tocar cada usuario.
 *   ADMIN_GLOBAL  → todas
 *   GERENTE_PAIS  → las sedes de su país
 *   resto         → solo su sede
 * Se aplica SIEMPRE en el servicio (nunca se confía en el frontend).
 */

export interface SedeInfo {
  id: number;
  codigo: string;
  nombre: string;
  ciudadId: number;
  paisId: number;
  zonaHoraria: string;
  prefijoPedido: string;
  horaApertura: string;
  horaCierre: string;
  duracionReservaMin: number;
  horasMinimasCancelacion: number;
  activa: boolean;
  moneda: string;
  tasaUsd: Prisma.Decimal;
  tasaImpuesto: Prisma.Decimal;
}

const TTL_CACHE_MS = 60_000;
let cache: { cargadoEn: number; sedes: Map<number, SedeInfo> } | null = null;

/** Las sedes cambian poco: se guardan en memoria 60 s. Las escrituras de sedes y países llaman a invalidarCacheSedes(). */
export async function todasLasSedes(): Promise<Map<number, SedeInfo>> {
  if (cache && Date.now() - cache.cargadoEn < TTL_CACHE_MS) return cache.sedes;
  const filas = await prisma.sede.findMany({ include: { ciudad: { include: { pais: true } } } });
  const sedes = new Map<number, SedeInfo>(
    filas.map((s) => [
      s.id,
      {
        id: s.id,
        codigo: s.codigo,
        nombre: s.nombre,
        ciudadId: s.ciudadId,
        paisId: s.ciudad.paisId,
        zonaHoraria: s.zonaHoraria,
        prefijoPedido: s.prefijoPedido,
        horaApertura: s.horaApertura,
        horaCierre: s.horaCierre,
        duracionReservaMin: s.duracionReservaMin,
        horasMinimasCancelacion: s.horasMinimasCancelacion,
        activa: s.activa,
        moneda: s.ciudad.pais.moneda,
        tasaUsd: s.ciudad.pais.tasaUsd,
        tasaImpuesto: s.ciudad.pais.tasaImpuesto,
      },
    ]),
  );
  cache = { cargadoEn: Date.now(), sedes };
  return sedes;
}

export function invalidarCacheSedes() {
  cache = null;
}

export async function obtenerSede(sedeId: number): Promise<SedeInfo> {
  let sede = (await todasLasSedes()).get(sedeId);
  if (!sede) {
    invalidarCacheSedes(); // puede ser una sede recién creada desde otro proceso
    sede = (await todasLasSedes()).get(sedeId);
  }
  if (!sede) throw HttpError.notFound('Sede');
  return sede;
}

export const esGerente = (rol: RolUsuario) =>
  rol === 'ADMIN_GLOBAL' || rol === 'GERENTE_PAIS' || rol === 'GERENTE_SEDE';

export function puedeVerSede(auth: Auth, sede: SedeInfo): boolean {
  if (auth.tipo === 'dispositivo') return auth.sedeId === sede.id;
  if (auth.tipo !== 'usuario') return false;
  if (auth.rol === 'ADMIN_GLOBAL') return true;
  if (auth.rol === 'GERENTE_PAIS') return auth.paisId === sede.paisId;
  return auth.sedeId === sede.id;
}

/** Devuelve la sede si está en el alcance; 404 si no existe, 403 si es de otro país o sede. */
export async function asegurarSede(
  auth: AuthPersonal | AuthDispositivo,
  sedeId: number,
): Promise<SedeInfo> {
  const sede = await obtenerSede(sedeId);
  if (!puedeVerSede(auth, sede)) {
    throw HttpError.forbidden('Esta sede está fuera de tu alcance');
  }
  return sede;
}

/** País al que pertenece el usuario (el suyo si es gerente de país, el de su sede si no); null para el admin global. */
export async function paisDelUsuario(auth: AuthPersonal): Promise<number | null> {
  if (auth.rol === 'ADMIN_GLOBAL') return null;
  if (auth.rol === 'GERENTE_PAIS') return auth.paisId;
  return auth.sedeId ? ((await todasLasSedes()).get(auth.sedeId)?.paisId ?? null) : null;
}

export async function asegurarPais(auth: AuthPersonal, paisId: number): Promise<void> {
  if (auth.rol === 'ADMIN_GLOBAL') return;
  if ((await paisDelUsuario(auth)) !== paisId) {
    throw HttpError.forbidden('Este país está fuera de tu alcance');
  }
}

/** Filtro Prisma de sedes según el alcance. */
export function whereSedesDelAlcance(auth: AuthPersonal): Prisma.SedeWhereInput {
  if (auth.rol === 'ADMIN_GLOBAL') return {};
  if (auth.rol === 'GERENTE_PAIS') return { ciudad: { paisId: auth.paisId ?? -1 } };
  return { id: auth.sedeId ?? -1 };
}

/**
 * Resuelve las sedes de un reporte o listado combinando el alcance con los filtros pedidos.
 * Si el filtro pide algo fuera del alcance responde 403 en lugar de devolver vacío.
 */
export async function sedesFiltradas(
  auth: AuthPersonal,
  filtros: { sedeId?: number; ciudadId?: number; paisId?: number },
): Promise<SedeInfo[]> {
  const todas = [...(await todasLasSedes()).values()];

  if (filtros.sedeId !== undefined) {
    const sede = todas.find((s) => s.id === filtros.sedeId);
    if (!sede) throw HttpError.notFound('Sede');
    if (!puedeVerSede(auth, sede)) throw HttpError.forbidden('Esta sede está fuera de tu alcance');
  }
  if (filtros.paisId !== undefined && auth.rol !== 'ADMIN_GLOBAL') {
    const propio =
      auth.rol === 'GERENTE_PAIS' ? auth.paisId : todas.find((s) => s.id === auth.sedeId)?.paisId;
    if (propio !== filtros.paisId) throw HttpError.forbidden('Este país está fuera de tu alcance');
  }

  return todas.filter(
    (s) =>
      puedeVerSede(auth, s) &&
      (filtros.sedeId === undefined || s.id === filtros.sedeId) &&
      (filtros.ciudadId === undefined || s.ciudadId === filtros.ciudadId) &&
      (filtros.paisId === undefined || s.paisId === filtros.paisId),
  );
}
