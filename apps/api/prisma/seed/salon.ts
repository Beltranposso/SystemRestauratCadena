import { randomUUID } from 'node:crypto';
import type { EstadoMesa, OrigenSesion, Prisma, PrismaClient } from '@prisma/client';
import { aFechaDb, diaSemana, fechaOperacion, localAUtc, sumarDias } from '../../src/utils/fechas';
import { generadorCodigos, insertarEnLotes, sumarMin, type Rng } from './aleatorio';
import { nombreAleatorio, telefonoAleatorio, type ClienteCtx, type SedeCtx } from './base';
import { COMENTARIOS_BUENOS, COMENTARIOS_MALOS } from './datos';

type ReservaFila = Prisma.ReservaCreateManyInput & { id: string; creadoEn: Date; inicio: Date };
type EsperaFila = Omit<Prisma.EntradaEsperaCreateManyInput, 'numeroTurno'> & {
  id: string;
  creadoEn: Date;
};

const HORA_APERTURA = 12;
const HORA_CIERRE: [number, number] = [22, 30];
/** Franjas de reserva para los próximos días (duración por defecto 90 min, sin cruces) */
const FRANJAS_FUTURAS: [number, number][] = [
  [12, 30],
  [14, 30],
  [19, 0],
  [21, 0],
];

function duracionSesion(rng: Rng, capacidad: number) {
  if (capacidad <= 2) return rng.entero(40, 75);
  if (capacidad <= 4) return rng.entero(50, 95);
  return rng.entero(70, 130);
}

export interface ResultadoSalon {
  reservas: number;
  entradasEspera: number;
  sesiones: number;
  esperandoAhora: number;
}

/**
 * Mesas, reservas, cola de espera, sesiones de mesa, notificaciones y calificaciones.
 * - Pasado (30 días): cada mesa se ocupa en sesiones sin cruces; cada sesión viene de
 *   una reserva, de la cola de espera o de un cliente directo.
 * - Hoy: sesiones hasta el momento del seed, mesas en su estado actual y cola viva.
 * - Futuro (14 días): reservas confirmadas o pendientes en franjas fijas.
 */
export async function sembrarSalon(
  prisma: PrismaClient,
  rng: Rng,
  sedes: SedeCtx[],
  clientes: ClienteCtx[],
  ahora: Date,
  diasPasados = 30,
  diasFuturos = 14,
): Promise<ResultadoSalon> {
  const nuevoCodigo = generadorCodigos(rng);
  const clienteDemo = clientes[0]!;
  // El cliente demo solo recibe el historial controlado de CTG-01 (ver final del bucle)
  const clientesAleatorios = clientes.slice(1);
  const reservas: ReservaFila[] = [];
  const entradas: Prisma.EntradaEsperaCreateManyInput[] = [];
  const sesiones: Prisma.SesionMesaCreateManyInput[] = [];
  const notificaciones: Prisma.NotificacionCreateManyInput[] = [];
  const calificaciones: Prisma.CalificacionCreateManyInput[] = [];
  const secuencias: Prisma.SecuenciaPedidoCreateManyInput[] = [];
  const estadosMesa: { id: number; estado: EstadoMesa }[] = [];
  let esperandoAhora = 0;

  const notificar = (
    cliente: ClienteCtx,
    tipo: Prisma.NotificacionCreateManyInput['tipo'],
    canal: Prisma.NotificacionCreateManyInput['canal'],
    cuando: Date,
    ref: { reservaId?: string; entradaEsperaId?: string },
  ) => {
    notificaciones.push({
      id: randomUUID(),
      clienteId: cliente.id,
      destino: cliente.email,
      canal,
      tipo,
      reservaId: ref.reservaId ?? null,
      entradaEsperaId: ref.entradaEsperaId ?? null,
      estado: 'ENVIADA',
      creadoEn: cuando,
      enviadaEn: sumarMin(cuando, 0.1),
    });
  };

  const calificar = (sedeId: number, cliente: ClienteCtx, reservaId: string, cuando: Date) => {
    if (cuando > ahora) return;
    const puntaje = rng.ponderado([
      [5, 45],
      [4, 33],
      [3, 12],
      [2, 6],
      [1, 4],
    ] as const);
    calificaciones.push({
      id: randomUUID(),
      sedeId,
      clienteId: cliente.id,
      pedidoId: null,
      reservaId,
      puntaje,
      comentario: rng.prob(0.5)
        ? rng.elegir(puntaje >= 4 ? COMENTARIOS_BUENOS : COMENTARIOS_MALOS)
        : null,
      creadoEn: cuando,
    });
  };

  const crearReserva = (
    sede: SedeCtx,
    datos: Pick<ReservaFila, 'inicio' | 'estado' | 'personas' | 'mesaId' | 'creadoEn'> & {
      canceladaEn?: Date | null;
      cliente?: ClienteCtx;
    },
  ) => {
    const cliente = datos.cliente ?? rng.elegir(clientesAleatorios);
    const fila: ReservaFila = {
      id: randomUUID(),
      sedeId: sede.id,
      clienteId: cliente.id,
      mesaId: datos.mesaId ?? null,
      inicio: datos.inicio,
      duracionMin: sede.duracionReservaMin,
      personas: datos.personas,
      estado: datos.estado,
      codigoConfirmacion: nuevoCodigo(),
      notas: rng.prob(0.15)
        ? rng.elegir([
            'Cumpleaños',
            'Mesa en terraza si es posible',
            'Silla para bebé',
            'Aniversario',
          ])
        : null,
      creadoEn: datos.creadoEn,
      canceladaEn: datos.canceladaEn ?? null,
    };
    reservas.push(fila);
    if (fila.estado !== 'PENDIENTE') {
      notificar(cliente, 'CONFIRMACION_RESERVA', 'EMAIL', sumarMin(fila.creadoEn, 0.2), {
        reservaId: fila.id,
      });
    }
    return { fila, cliente };
  };

  for (const sede of sedes) {
    const hoy = fechaOperacion(ahora, sede.zona);
    const reservasSedeDesde = reservas.length;

    for (let d = -diasPasados; d <= 0; d++) {
      const fecha = sumarDias(hoy, d);
      const esHoy = d === 0;
      const apertura = localAUtc(fecha, HORA_APERTURA, 0, sede.zona);
      const cierre = localAUtc(fecha, HORA_CIERRE[0], HORA_CIERRE[1], sede.zona);
      const esperaDia: EsperaFila[] = [];

      for (const mesa of sede.mesas) {
        let cursor = sumarMin(apertura, rng.entero(0, 40));
        let libreDesde = esHoy ? ahora : cierre;
        let ultimoFin: Date | null = null;
        let enCurso = false;

        for (;;) {
          const duracion = duracionSesion(rng, mesa.capacidad);
          const inicio = cursor;
          const fin = sumarMin(inicio, duracion);
          if (fin > cierre || (esHoy && inicio > ahora)) break;

          const origen = rng.ponderado<OrigenSesion>([
            ['RESERVA', 35],
            ['ESPERA', 25],
            ['DIRECTO', 40],
          ]);
          const personas = rng.entero(Math.max(1, Math.ceil(mesa.capacidad / 2)), mesa.capacidad);
          enCurso = esHoy && fin > ahora;
          let reservaId: string | null = null;
          let entradaEsperaId: string | null = null;

          if (origen === 'RESERVA') {
            const inicioReserva = sumarMin(inicio, -rng.entero(0, 10));
            const { fila, cliente } = crearReserva(sede, {
              inicio: inicioReserva,
              estado: enCurso ? 'SENTADA' : 'COMPLETADA',
              personas,
              mesaId: mesa.id,
              creadoEn: sumarMin(inicioReserva, -rng.entero(60, 7 * 24 * 60)),
            });
            reservaId = fila.id;
            if (!enCurso && rng.prob(0.25))
              calificar(sede.id, cliente, fila.id, sumarMin(fin, rng.entero(10, 120)));
          } else if (origen === 'ESPERA') {
            const cliente = rng.prob(0.35) ? rng.elegir(clientesAleatorios) : null;
            const notificadoEn = sumarMin(inicio, -rng.entero(1, 4));
            const fila: EsperaFila = {
              id: randomUUID(),
              sedeId: sede.id,
              clienteId: cliente?.id ?? null,
              nombre: cliente?.nombre ?? nombreAleatorio(rng),
              telefono: cliente?.telefono ?? telefonoAleatorio(rng, sede.pais.codigoIso),
              personas,
              fechaOperacion: aFechaDb(fecha),
              estado: 'SENTADO',
              mesaId: mesa.id,
              creadoEn: sumarMin(inicio, -rng.entero(5, 35)),
              notificadoEn,
              sentadoEn: inicio,
            };
            esperaDia.push(fila);
            entradaEsperaId = fila.id;
            if (cliente)
              notificar(cliente, 'MESA_LISTA', 'EN_APP', notificadoEn, {
                entradaEsperaId: fila.id,
              });
          }

          sesiones.push({
            id: randomUUID(),
            mesaId: mesa.id,
            origen,
            reservaId,
            entradaEsperaId,
            personas,
            inicio,
            fin: enCurso ? null : fin,
          });

          if (enCurso) {
            libreDesde = fin;
            break;
          }
          ultimoFin = fin;
          cursor = sumarMin(fin, rng.entero(5, 50));
        }

        if (!esHoy) continue;

        // Reservas para lo que queda de hoy en esta mesa
        let proxima = new Date(
          Math.max(
            sumarMin(libreDesde, 15).getTime(),
            sumarMin(ahora, 20).getTime(),
            apertura.getTime(),
          ),
        );
        proxima = new Date(Math.ceil(proxima.getTime() / (15 * 60_000)) * 15 * 60_000);
        let primeraReserva: Date | null = null;
        while (sumarMin(proxima, sede.duracionReservaMin) <= cierre) {
          if (rng.prob(0.55)) {
            crearReserva(sede, {
              inicio: proxima,
              estado: rng.prob(0.85) ? 'CONFIRMADA' : 'PENDIENTE',
              personas: rng.entero(Math.max(1, Math.ceil(mesa.capacidad / 2)), mesa.capacidad),
              mesaId: mesa.id,
              creadoEn: sumarMin(ahora, -rng.entero(30, 4 * 24 * 60)),
            });
            primeraReserva ??= proxima;
            proxima = sumarMin(proxima, sede.duracionReservaMin + rng.entero(1, 4) * 15);
          } else {
            proxima = sumarMin(proxima, 60);
          }
        }

        // Estado actual de la mesa
        let estado: EstadoMesa = 'LIBRE';
        if (enCurso) estado = 'OCUPADA';
        else if (primeraReserva && primeraReserva.getTime() - ahora.getTime() <= 45 * 60_000)
          estado = 'RESERVADA';
        else if (ultimoFin && ahora.getTime() - ultimoFin.getTime() <= 10 * 60_000)
          estado = 'LIMPIEZA';
        estadosMesa.push({ id: mesa.id, estado });
      }

      // Reservas canceladas y no-shows del día (no ocupan mesa)
      const instanteDelDia = () =>
        localAUtc(fecha, rng.entero(12, 21), rng.elegir([0, 15, 30, 45]), sede.zona);
      for (let i = rng.entero(1, 3); i > 0; i--) {
        const inicio = instanteDelDia();
        const canceladaEn = sumarMin(inicio, -rng.entero(60, 3 * 24 * 60));
        if (canceladaEn > ahora) continue;
        crearReserva(sede, {
          inicio,
          estado: 'CANCELADA',
          personas: rng.entero(2, 6),
          mesaId: null,
          creadoEn: sumarMin(canceladaEn, -rng.entero(60, 4 * 24 * 60)),
          canceladaEn,
        });
      }
      for (let i = rng.entero(0, 2); i > 0; i--) {
        const inicio = instanteDelDia();
        if (sumarMin(inicio, 20) > ahora) continue;
        crearReserva(sede, {
          inicio,
          estado: 'NO_SHOW',
          personas: rng.entero(2, 4),
          mesaId: null,
          creadoEn: sumarMin(inicio, -rng.entero(120, 5 * 24 * 60)),
        });
      }

      // Clientes que se cansaron de esperar
      for (let i = rng.entero(0, 3); i > 0; i--) {
        const creadoEn = sumarMin(apertura, rng.entero(0, 600));
        if (creadoEn > ahora) continue;
        esperaDia.push({
          id: randomUUID(),
          sedeId: sede.id,
          clienteId: null,
          nombre: nombreAleatorio(rng),
          telefono: telefonoAleatorio(rng, sede.pais.codigoIso),
          personas: rng.entero(2, 6),
          fechaOperacion: aFechaDb(fecha),
          estado: 'ABANDONO',
          mesaId: null,
          creadoEn,
          notificadoEn: null,
          sentadoEn: null,
        });
      }

      // Cola viva en este momento (solo si el salón está abierto)
      if (esHoy && ahora > sumarMin(apertura, 30) && ahora < sumarMin(cierre, -30)) {
        const enCola = rng.entero(2, 6);
        for (let i = 0; i < enCola; i++) {
          const cliente = rng.prob(0.4) ? rng.elegir(clientesAleatorios) : null;
          const notificado = i === 0 && rng.prob(0.6);
          const creadoEn = sumarMin(ahora, -rng.entero(2, 30));
          const fila: EsperaFila = {
            id: randomUUID(),
            sedeId: sede.id,
            clienteId: cliente?.id ?? null,
            nombre: cliente?.nombre ?? nombreAleatorio(rng),
            telefono: cliente?.telefono ?? telefonoAleatorio(rng, sede.pais.codigoIso),
            personas: rng.entero(2, 6),
            fechaOperacion: aFechaDb(fecha),
            estado: notificado ? 'NOTIFICADO' : 'ESPERANDO',
            mesaId: null,
            creadoEn,
            notificadoEn: notificado ? sumarMin(ahora, -1) : null,
            sentadoEn: null,
          };
          esperaDia.push(fila);
          if (notificado && cliente)
            notificar(cliente, 'MESA_LISTA', 'EN_APP', sumarMin(ahora, -1), {
              entradaEsperaId: fila.id,
            });
          esperandoAhora++;
        }
      }

      // Numeración del turno de espera según orden de llegada
      esperaDia.sort((a, b) => a.creadoEn.getTime() - b.creadoEn.getTime());
      esperaDia.forEach((e, i) => entradas.push({ ...e, numeroTurno: i + 1 }));
      if (esperaDia.length > 0) {
        secuencias.push({
          sedeId: sede.id,
          fechaOperacion: aFechaDb(fecha),
          tipo: 'ESPERA',
          ultimoNumero: esperaDia.length,
        });
      }
    }

    // Próximos días: reservas en franjas fijas, más demanda viernes y sábado
    for (let d = 1; d <= diasFuturos; d++) {
      const fecha = sumarDias(hoy, d);
      const finDeSemana = [5, 6].includes(diaSemana(fecha));
      const p = 0.45 * (1 - d / (diasFuturos + 6)) * (finDeSemana ? 1.3 : 1);
      for (const mesa of sede.mesas) {
        for (const [h, m] of FRANJAS_FUTURAS) {
          if (!rng.prob(p)) continue;
          crearReserva(sede, {
            inicio: localAUtc(fecha, h, m, sede.zona),
            estado: rng.prob(0.85) ? 'CONFIRMADA' : 'PENDIENTE',
            personas: rng.entero(Math.max(1, Math.ceil(mesa.capacidad / 2)), mesa.capacidad),
            mesaId: mesa.id,
            creadoEn: sumarMin(ahora, -rng.entero(10, 5 * 24 * 60)),
          });
        }
      }
      for (let i = rng.entero(0, 2); i > 0; i--) {
        const canceladaEn = sumarMin(ahora, -rng.entero(5, 600));
        crearReserva(sede, {
          inicio: localAUtc(fecha, rng.entero(12, 21), 0, sede.zona),
          estado: 'CANCELADA',
          personas: rng.entero(2, 6),
          mesaId: null,
          creadoEn: sumarMin(canceladaEn, -rng.entero(60, 3 * 24 * 60)),
          canceladaEn,
        });
      }
    }

    // El cliente demo tiene historial en CTG-01: 3 visitas pasadas y 2 reservas próximas
    if (sede.codigo === 'CTG-01') {
      const deLaSede = reservas.slice(reservasSedeDesde);
      const pasadas = deLaSede.filter((r) => r.estado === 'COMPLETADA').slice(-3);
      const futuras = deLaSede
        .filter((r) => r.estado === 'CONFIRMADA' && r.inicio > sumarMin(ahora, 24 * 60))
        .slice(0, 2);
      for (const r of [...pasadas, ...futuras]) {
        r.clienteId = clienteDemo.id;
        for (const n of notificaciones) {
          if (n.reservaId === r.id) {
            n.clienteId = clienteDemo.id;
            n.destino = clienteDemo.email;
          }
        }
        for (const c of calificaciones) if (c.reservaId === r.id) c.clienteId = clienteDemo.id;
      }
    }
  }

  await insertarEnLotes(reservas, (lote) => prisma.reserva.createMany({ data: lote }));
  await insertarEnLotes(entradas, (lote) => prisma.entradaEspera.createMany({ data: lote }));
  await insertarEnLotes(sesiones, (lote) => prisma.sesionMesa.createMany({ data: lote }));
  await insertarEnLotes(notificaciones, (lote) => prisma.notificacion.createMany({ data: lote }));
  await insertarEnLotes(calificaciones, (lote) => prisma.calificacion.createMany({ data: lote }));
  await insertarEnLotes(secuencias, (lote) => prisma.secuenciaPedido.createMany({ data: lote }));

  // Estado actual de las mesas (+ una fuera de servicio en algunas sedes)
  for (const estado of ['OCUPADA', 'RESERVADA', 'LIMPIEZA'] as const) {
    const ids = estadosMesa.filter((m) => m.estado === estado).map((m) => m.id);
    if (ids.length) await prisma.mesa.updateMany({ where: { id: { in: ids } }, data: { estado } });
  }
  const conReservaProxima = new Set(
    reservas
      .filter((r) => r.mesaId && r.inicio > ahora && r.inicio < sumarMin(ahora, 24 * 60))
      .map((r) => r.mesaId),
  );
  for (const sede of sedes) {
    const libre = sede.mesas.find(
      (m) =>
        !conReservaProxima.has(m.id) && estadosMesa.find((e) => e.id === m.id)?.estado === 'LIBRE',
    );
    if (libre && rng.prob(0.35))
      await prisma.mesa.update({ where: { id: libre.id }, data: { estado: 'FUERA_SERVICIO' } });
  }

  return {
    reservas: reservas.length,
    entradasEspera: entradas.length,
    sesiones: sesiones.length,
    esperandoAhora,
  };
}
