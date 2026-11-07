import { describe, expect, it } from 'vitest';
import { aUsd, calcularTotales } from '../src/utils/dinero';
import { desfaseMinutos, fechaOperacion, localAUtc, sumarDias } from '../src/utils/fechas';
import { formatearCodigo } from '../src/db/secuencias';

describe('fechas', () => {
  it('convierte la hora local de la sede a UTC', () => {
    expect(localAUtc('2026-10-25', 12, 30, 'America/Bogota').toISOString()).toBe(
      '2026-10-25T17:30:00.000Z',
    );
    expect(localAUtc('2026-10-25', 12, 30, 'America/Mexico_City').toISOString()).toBe(
      '2026-10-25T18:30:00.000Z',
    );
    expect(localAUtc('2026-10-25', 12, 30, 'America/Lima').toISOString()).toBe(
      '2026-10-25T17:30:00.000Z',
    );
  });

  it('calcula el día de operación local aunque en UTC ya sea el día siguiente', () => {
    // 23:30 en Bogotá = 04:30 UTC del día siguiente
    const instante = new Date('2026-10-26T04:30:00Z');
    expect(fechaOperacion(instante, 'America/Bogota')).toBe('2026-10-25');
    expect(fechaOperacion(instante, 'Europe/Madrid')).toBe('2026-10-26');
  });

  it('respeta el cambio de horario en zonas que lo tienen', () => {
    // Madrid pasa de UTC+2 a UTC+1 el 25 de octubre de 2026
    expect(desfaseMinutos(new Date('2026-10-24T12:00:00Z'), 'Europe/Madrid')).toBe(120);
    expect(desfaseMinutos(new Date('2026-10-26T12:00:00Z'), 'Europe/Madrid')).toBe(60);
    expect(localAUtc('2026-10-26', 9, 0, 'Europe/Madrid').toISOString()).toBe(
      '2026-10-26T08:00:00.000Z',
    );
  });

  it('suma días cruzando meses y años', () => {
    expect(sumarDias('2026-12-30', 3)).toBe('2027-01-02');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('dinero', () => {
  it('calcula subtotal, impuestos y total con redondeo a 2 decimales', () => {
    const r = calcularTotales(
      [
        { precioUnitario: '29600.00', cantidad: 2 },
        { precioUnitario: 7200, cantidad: 1 },
      ],
      '0.08',
    );
    expect(r.subtotal.toString()).toBe('66400');
    expect(r.impuestos.toString()).toBe('5312');
    expect(r.total.toString()).toBe('71712');
  });

  it('evita errores de coma flotante', () => {
    const r = calcularTotales([{ precioUnitario: '0.10', cantidad: 3 }], '0.18');
    expect(r.subtotal.toString()).toBe('0.3');
    expect(r.impuestos.toString()).toBe('0.05');
  });

  it('convierte a USD con la tasa del país', () => {
    expect(aUsd('71712', '4000').toString()).toBe('17.93');
    expect(aUsd('149', '18.5').toString()).toBe('8.05');
  });
});

describe('códigos de pedido', () => {
  it('rellena con ceros a tres cifras', () => {
    expect(formatearCodigo('A', 7)).toBe('A-007');
    expect(formatearCodigo('B', 142)).toBe('B-142');
    expect(formatearCodigo('C', 1042)).toBe('C-1042');
  });
});
