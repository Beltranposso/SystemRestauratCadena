import { z } from 'zod';

/** Esquemas reutilizables de parámetros y filtros. */

export const idEntero = z.coerce.number().int().positive();
export const uuid = z.string().uuid('Debe ser un UUID');

export const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Fecha inválida');

export const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usa el formato HH:mm (24 h)');

export const monto = z.coerce
  .number()
  .nonnegative()
  .max(9_999_999_999)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Máximo 2 decimales');

type SinDefault<S> = S extends z.ZodDefault<infer I> ? I : S;

/**
 * `.partial()` para rutas PATCH. Zod 4 aplica los `.default()` también dentro de campos
 * opcionales: con `.partial()` a secas, un PATCH `{ nombre }` reescribiría con su valor por
 * defecto todos los campos que no vinieron. Aquí se quitan los defaults antes.
 */
export function parcial<T extends z.ZodRawShape>(objeto: z.ZodObject<T>) {
  const forma = Object.fromEntries(
    Object.entries(objeto.shape).map(([k, v]) => [
      k,
      v instanceof z.ZodDefault ? v.removeDefault() : v,
    ]),
  );
  return z.object(forma).partial() as unknown as z.ZodObject<{
    [K in keyof T]: z.ZodOptional<SinDefault<T[K]>>;
  }>;
}

export const paramsId = z.object({ id: idEntero });
export const paramsUuid = z.object({ id: uuid });
export const paramsSede = z.object({ sedeId: idEntero });

export const paginacion = z.object({
  pagina: z.coerce.number().int().positive().default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});

/** Lista separada por comas en la query: ?estado=RECIBIDO,LISTO */
export const listaEnum = <T extends [string, ...string[]]>(valores: T) =>
  z
    .string()
    .transform((v) =>
      v
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(valores)).min(1));

export const booleanoQuery = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

export function paginado<T>(datos: T[], total: number, p: { pagina: number; porPagina: number }) {
  return {
    datos,
    meta: {
      pagina: p.pagina,
      porPagina: p.porPagina,
      total,
      paginas: Math.ceil(total / p.porPagina),
    },
  };
}

export const saltar = (p: { pagina: number; porPagina: number }) => ({
  skip: (p.pagina - 1) * p.porPagina,
  take: p.porPagina,
});
