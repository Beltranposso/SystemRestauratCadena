import { describe, expect, it } from 'vitest';
import { $Enums } from '@prisma/client';
import * as shared from '@restaurantes/shared';

describe('paquete shared', () => {
  it('sus enums coinciden exactamente con los de Prisma', () => {
    for (const [nombre, valores] of Object.entries($Enums)) {
      const enShared = (shared as Record<string, unknown>)[nombre];
      expect(enShared, `Falta el enum ${nombre} en packages/shared`).toBeDefined();
      expect(Object.keys(enShared as object).sort(), nombre).toEqual(Object.keys(valores).sort());
    }
  });

  it('la máquina de estados del pedido solo avanza en orden', () => {
    const { TRANSICIONES_PEDIDO: t, puedeTransicionar } = shared;
    expect(puedeTransicionar(t, 'RECIBIDO', 'EN_PREPARACION')).toBe(true);
    expect(puedeTransicionar(t, 'EN_PREPARACION', 'LISTO')).toBe(true);
    expect(puedeTransicionar(t, 'LISTO', 'ENTREGADO')).toBe(true);
    expect(puedeTransicionar(t, 'RECIBIDO', 'LISTO')).toBe(false);
    expect(puedeTransicionar(t, 'LISTO', 'CANCELADO')).toBe(false);
    expect(puedeTransicionar(t, 'ENTREGADO', 'RECIBIDO')).toBe(false);
  });

  it('todas las transiciones apuntan a estados que existen', () => {
    const mapas = [
      [shared.TRANSICIONES_PEDIDO, shared.EstadoPedido],
      [shared.TRANSICIONES_RESERVA, shared.EstadoReserva],
      [shared.TRANSICIONES_ESPERA, shared.EstadoEspera],
      [shared.TRANSICIONES_MESA, shared.EstadoMesa],
    ] as const;
    for (const [mapa, enumeracion] of mapas) {
      expect(Object.keys(mapa).sort()).toEqual(Object.keys(enumeracion).sort());
      for (const destinos of Object.values(mapa) as string[][]) {
        for (const d of destinos) expect(enumeracion).toHaveProperty(d);
      }
    }
  });
});
