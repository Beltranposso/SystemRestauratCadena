import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { normalizarError, type ErrorApi } from '../application/errores';

/**
 * Caché de consultas de la UI construida con RTK Query.
 * Sustituye al QueryClient: same queryKey -> misma entrada de caché y mismos tags
 * para invalidar desde los eventos de Socket.IO o desde las mutaciones.
 */
type ConsultaArgs = { clave: string };
type MutacionArgs = { id: string; variables: unknown };

const consultas = new Map<string, () => unknown | Promise<unknown>>();
const mutaciones = new Map<string, (variables: unknown) => unknown | Promise<unknown>>();

export function registrarConsulta(clave: string, ejecutar: () => unknown | Promise<unknown>): void {
  consultas.set(clave, ejecutar);
}

export function registrarMutacion(
  id: string,
  ejecutar: (variables: unknown) => unknown | Promise<unknown>,
): void {
  mutaciones.set(id, ejecutar);
}

const TIPOS = [
  'general',
  'sedes',
  'sedes-publicas',
  'menu',
  'activos',
  'pedidos',
  'mesas',
  'fila',
  'reservas-hoy',
  'reservas-hoy-total',
  'turnos',
  'turno',
  'personal',
  'productos-sede',
  'catalogo',
  'categorias',
  'combos',
  'promociones',
  'dispositivos-cupos',
  'equipos',
  'cupos',
  'pantalla',
  'ventas',
  'kpis',
  'ocupacion',
  'calificaciones',
  'mis-reservas',
  'reserva',
  'disponibilidad',
  'marca',
  'configuracion',
] as const;

type Tag = { type: (typeof TIPOS)[number]; id: string };

/** Tags a partir de la clave serializada del queryKey de React Query. */
export function tagsDeClave(clave: string): Tag[] {
  let prefijo = 'general';
  try {
    const partes = JSON.parse(clave) as unknown[];
    const primero = partes[0];
    if (typeof primero === 'string' && (TIPOS as readonly string[]).includes(primero))
      prefijo = primero;
  } catch {
    /* clave no serializada: se invalida lo genérico */
  }
  return [{ type: prefijo as Tag['type'], id: 'ALL' }];
}

export const consultaApi = createApi({
  reducerPath: 'consultaCache',
  baseQuery: fakeBaseQuery<ErrorApi>(),
  tagTypes: TIPOS,
  keepUnusedDataFor: 300,
  endpoints: (builder) => ({
    consulta: builder.query<unknown, ConsultaArgs>({
      queryFn: async ({ clave }) => {
        const ejecutar = consultas.get(clave);
        if (!ejecutar) return { error: { message: 'Consulta no registrada', code: 'LOCAL' } };
        try {
          return { data: await ejecutar() };
        } catch (error) {
          return { error: normalizarError(error) };
        }
      },
      providesTags: (_resultado, _error, { clave }) => tagsDeClave(clave),
    }),
    ejecutar: builder.mutation<unknown, MutacionArgs>({
      queryFn: async ({ id, variables }) => {
        const ejecutar = mutaciones.get(id);
        if (!ejecutar) return { error: { message: 'Mutación no registrada', code: 'LOCAL' } };
        try {
          return { data: await ejecutar(variables) };
        } catch (error) {
          return { error: normalizarError(error) };
        }
      },
    }),
  }),
});
