import type { EstadoMesa, Mesa, OrigenSesion, Prisma } from '@prisma/client';
import { ESTADOS_RESERVA_ACTIVOS, EVENTOS } from '@restaurantes/shared';
import { prisma, type Tx } from '../../db/prisma';
import { fechaOperacion, localAUtc } from '../../utils/fechas';
import { HttpError } from '../../utils/http-error';
import type { SedeInfo } from '../../auth/alcance';
import { emitirASede } from '../../realtime/socket';

/** Minutos desde medianoche de un "HH:mm". */
export const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};
export const aHHmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const formatoHora = new Map<string, Intl.DateTimeFormat>();
export function horaLocal(d: Date, zona: string) {
  let f = formatoHora.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat('es-CO', {
      timeZone: zona,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatoHora.set(zona, f);
  }
  return f.format(d);
}

/** Apertura y cierre del salón en UTC para un día local. */
export function horarioDelDia(sede: SedeInfo, fecha: string) {
  const a = minutos(sede.horaApertura);
  const c = minutos(sede.horaCierre);
  return {
    apertura: localAUtc(fecha, Math.floor(a / 60), a % 60, sede.zonaHoraria),
    cierre: localAUtc(fecha, Math.floor(c / 60), c % 60, sede.zonaHoraria),
  };
}

export function emitirMesa(sedeId: number, mesa: Pick<Mesa, 'id' | 'codigo' | 'estado'>) {
  const datos = { id: mesa.id, codigo: mesa.codigo, estado: mesa.estado, sedeId };
  emitirASede(sedeId, 'salon', EVENTOS.mesaEstado, datos);
  emitirASede(sedeId, 'caja', EVENTOS.mesaEstado, datos);
}

/**
 * Ocupa una mesa: la pasa a OCUPADA (solo si estaba LIBRE o RESERVADA) y abre su sesión.
 * El updateMany condicionado evita que dos personas sienten clientes en la misma mesa a la vez.
 */
export async function abrirSesion(
  tx: Tx,
  mesa: Pick<Mesa, 'id' | 'capacidad' | 'activa'>,
  origen: OrigenSesion,
  personas: number,
  refs: { reservaId?: string; entradaEsperaId?: string } = {},
) {
  if (!mesa.activa) throw HttpError.unprocessable('La mesa está inactiva');
  if (personas > mesa.capacidad) {
    throw HttpError.unprocessable(`La mesa es para ${mesa.capacidad} personas`);
  }
  const r = await tx.mesa.updateMany({
    where: { id: mesa.id, estado: { in: ['LIBRE', 'RESERVADA'] } },
    data: { estado: 'OCUPADA' },
  });
  if (r.count === 0) throw HttpError.conflict('La mesa no está libre');
  return tx.sesionMesa.create({
    data: {
      mesaId: mesa.id,
      origen,
      personas,
      inicio: new Date(),
      reservaId: refs.reservaId ?? null,
      entradaEsperaId: refs.entradaEsperaId ?? null,
    },
  });
}

/** Libera una mesa ocupada: cierra su sesión abierta y completa la reserva sentada que la originó. */
export async function cerrarSesion(
  tx: Tx,
  mesaId: number,
  nuevoEstado: Extract<EstadoMesa, 'LIBRE' | 'LIMPIEZA'>,
) {
  const ahora = new Date();
  const sesiones = await tx.sesionMesa.findMany({ where: { mesaId, fin: null } });
  if (sesiones.length) {
    await tx.sesionMesa.updateMany({ where: { mesaId, fin: null }, data: { fin: ahora } });
    const reservas = sesiones.map((s) => s.reservaId).filter((x): x is string => Boolean(x));
    if (reservas.length) {
      await tx.reserva.updateMany({
        where: { id: { in: reservas }, estado: 'SENTADA' },
        data: { estado: 'COMPLETADA' },
      });
    }
  }
  await tx.mesa.update({ where: { id: mesaId }, data: { estado: nuevoEstado } });
}

// ───────────────────────────── Disponibilidad ─────────────────────────────

type ReservaOcupa = { id: string; mesaId: number | null; inicio: Date; duracionMin: number };

const seCruzan = (r: ReservaOcupa, inicio: Date, fin: Date) =>
  r.inicio < fin && r.inicio.getTime() + r.duracionMin * 60_000 > inicio.getTime();

/** Reservas activas con mesa que pueden cruzarse con [desde, hasta). */
async function reservasQueOcupan(
  cliente: Tx | typeof prisma,
  sedeId: number,
  desde: Date,
  hasta: Date,
  excluir?: string,
) {
  return cliente.reserva.findMany({
    where: {
      sedeId,
      mesaId: { not: null },
      estado: { in: [...ESTADOS_RESERVA_ACTIVOS] },
      inicio: { lt: hasta, gt: new Date(desde.getTime() - 6 * 3_600_000) },
      ...(excluir ? { id: { not: excluir } } : {}),
    },
    select: { id: true, mesaId: true, inicio: true, duracionMin: true },
  });
}

/** Mesas donde caben `personas`, de la más ajustada a la más grande. */
async function mesasAptas(
  cliente: Tx | typeof prisma,
  sedeId: number,
  personas: number,
  inicio: Date,
) {
  const pronto = inicio.getTime() - Date.now() < 60 * 60_000;
  return cliente.mesa.findMany({
    where: {
      sedeId,
      activa: true,
      capacidad: { gte: personas },
      // Si la reserva es inminente, la mesa debe estar libre ahora mismo
      estado: pronto ? { in: ['LIBRE', 'RESERVADA'] } : { not: 'FUERA_SERVICIO' },
    },
    orderBy: [{ capacidad: 'asc' }, { id: 'asc' }],
  });
}

/**
 * Busca la mesa más ajustada libre en [inicio, inicio + duración). Llamar dentro de una
 * transacción que tenga el lock de reservas de la sede (bloquearReservasSede).
 */
export async function buscarMesaLibre(
  tx: Tx,
  sede: SedeInfo,
  personas: number,
  inicio: Date,
  excluirReservaId?: string,
) {
  const fin = new Date(inicio.getTime() + sede.duracionReservaMin * 60_000);
  // Secuencial: dentro de una transacción todas las consultas comparten una conexión
  const mesas = await mesasAptas(tx, sede.id, personas, inicio);
  const reservas = await reservasQueOcupan(tx, sede.id, inicio, fin, excluirReservaId);
  return (
    mesas.find((m) => !reservas.some((r) => r.mesaId === m.id && seCruzan(r, inicio, fin))) ?? null
  );
}

/** Serializa las reservas de una sede: dos clientes no pueden quedarse con la misma mesa. */
export const bloquearReservasSede = (tx: Tx, sedeId: number) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(1, ${sedeId}::int)`;

/** Valida que una reserva caiga dentro del horario y con antelación suficiente. */
export function validarHorarioReserva(sede: SedeInfo, fecha: string, hora: string) {
  const ini = minutos(hora);
  if (
    ini < minutos(sede.horaApertura) ||
    ini + sede.duracionReservaMin > minutos(sede.horaCierre)
  ) {
    throw HttpError.unprocessable(
      `Las reservas en esta sede van de ${sede.horaApertura} a ${aHHmm(minutos(sede.horaCierre) - sede.duracionReservaMin)}`,
    );
  }
  const inicio = localAUtc(fecha, Math.floor(ini / 60), ini % 60, sede.zonaHoraria);
  if (inicio.getTime() < Date.now() + 15 * 60_000) {
    throw HttpError.unprocessable('La reserva debe hacerse con al menos 15 minutos de antelación');
  }
  if (inicio.getTime() > Date.now() + 60 * 86_400_000) {
    throw HttpError.unprocessable('Solo se reserva con hasta 60 días de anticipación');
  }
  return inicio;
}

/** Franjas cada 30 min de un día con cuántas mesas aptas quedan libres. */
export async function disponibilidad(sede: SedeInfo, fecha: string, personas: number) {
  const { apertura } = horarioDelDia(sede, fecha);
  const ultima = minutos(sede.horaCierre) - sede.duracionReservaMin;
  const finDia = new Date(
    apertura.getTime() + (ultima - minutos(sede.horaApertura) + sede.duracionReservaMin) * 60_000,
  );
  const [mesas, reservas] = await Promise.all([
    prisma.mesa.findMany({
      where: { sedeId: sede.id, activa: true, capacidad: { gte: personas } },
    }),
    reservasQueOcupan(prisma, sede.id, apertura, finDia),
  ]);

  const franjas = [];
  for (let m = minutos(sede.horaApertura); m <= ultima; m += 30) {
    const inicio = localAUtc(fecha, Math.floor(m / 60), m % 60, sede.zonaHoraria);
    const fin = new Date(inicio.getTime() + sede.duracionReservaMin * 60_000);
    const pronto = inicio.getTime() - Date.now() < 60 * 60_000;
    const libres = mesas.filter(
      (mesa) =>
        (pronto
          ? ['LIBRE', 'RESERVADA'].includes(mesa.estado)
          : mesa.estado !== 'FUERA_SERVICIO') &&
        !reservas.some((r) => r.mesaId === mesa.id && seCruzan(r, inicio, fin)),
    ).length;
    const aTiempo = inicio.getTime() >= Date.now() + 15 * 60_000;
    franjas.push({
      hora: aHHmm(m),
      inicio,
      mesasLibres: aTiempo ? libres : 0,
      disponible: aTiempo && libres > 0,
    });
  }
  return franjas;
}

/** Datos de una reserva con su fecha y hora en la zona de la sede. */
export function reservaConHoraLocal<T extends { inicio: Date; duracionMin: number }>(
  r: T,
  sede: SedeInfo,
) {
  return {
    ...r,
    fecha: fechaOperacion(r.inicio, sede.zonaHoraria),
    hora: horaLocal(r.inicio, sede.zonaHoraria),
    fin: new Date(r.inicio.getTime() + r.duracionMin * 60_000),
  };
}

export const incluirReserva = {
  mesa: { select: { id: true, codigo: true, zona: true, capacidad: true } },
  sede: { select: { id: true, codigo: true, nombre: true, direccion: true, zonaHoraria: true } },
  cliente: { select: { id: true, nombre: true, email: true, telefono: true } },
} satisfies Prisma.ReservaInclude;
