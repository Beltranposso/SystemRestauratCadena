import { Prisma } from '@prisma/client';
import type { TipoSecuencia } from '@prisma/client';
import { prisma, type Tx } from './prisma';

/**
 * Devuelve el siguiente consecutivo del día para una sede (pedidos o cola de espera).
 *
 * Es un único INSERT … ON CONFLICT DO UPDATE … RETURNING: PostgreSQL bloquea la fila
 * de la secuencia mientras dura la transacción, así que dos cajas que venden al mismo
 * tiempo nunca reciben el mismo número. Llamarlo DENTRO de la transacción que crea el
 * pedido: si el pedido falla, el número se revierte y no quedan huecos.
 *
 * @param fechaOperacion día local de la sede en formato YYYY-MM-DD (ver utils/fechas.ts)
 */
export async function siguienteConsecutivo(
  cliente: Tx | typeof prisma,
  sedeId: number,
  fechaOperacion: string,
  tipo: TipoSecuencia = 'PEDIDO',
): Promise<number> {
  const filas = await cliente.$queryRaw<{ ultimo_numero: number }[]>(Prisma.sql`
    INSERT INTO "secuencias_pedido" ("sede_id", "fecha_operacion", "tipo", "ultimo_numero")
    VALUES (${sedeId}, ${fechaOperacion}::date, ${tipo}::"TipoSecuencia", 1)
    ON CONFLICT ("sede_id", "fecha_operacion", "tipo")
    DO UPDATE SET "ultimo_numero" = "secuencias_pedido"."ultimo_numero" + 1
    RETURNING "ultimo_numero"
  `);
  const numero = filas[0]?.ultimo_numero;
  if (numero === undefined) throw new Error('No se pudo obtener el consecutivo');
  return Number(numero);
}

/** Código visible del pedido: prefijo de la sede + número con tres cifras (A-007, A-142). */
export function formatearCodigo(prefijo: string, numero: number): string {
  return `${prefijo}-${String(numero).padStart(3, '0')}`;
}
