import { randomUUID } from 'node:crypto';
import type { EstadoPedido, Prisma, PrismaClient } from '@prisma/client';
import { formatearCodigo } from '../../src/db/secuencias';
import { aFechaDb, diaSemana, fechaOperacion, localAUtc, sumarDias } from '../../src/utils/fechas';
import { aUsd, calcularTotales } from '../../src/utils/dinero';
import { insertarEnLotes, sumarMin, type Rng } from './aleatorio';
import type { SedeCtx } from './base';
import { COMENTARIOS_BUENOS, COMENTARIOS_MALOS, NOMBRES, NOTAS_ITEM } from './datos';

/** Pedidos promedio por día en una sede de demanda 1. */
const BASE_DIARIA = 70;
/** Domingo a sábado */
const FACTOR_DIA = [1.25, 0.8, 0.85, 0.9, 0.95, 1.2, 1.35];
/** Distribución de pedidos por hora local (picos de almuerzo y cena) */
const PESO_HORA: (readonly [number, number])[] = [
  [10, 3],
  [11, 6],
  [12, 14],
  [13, 15],
  [14, 9],
  [15, 4],
  [16, 3],
  [17, 4],
  [18, 8],
  [19, 13],
  [20, 12],
  [21, 7],
  [22, 2],
];
const HORAS_PICO = new Set([12, 13, 19, 20]);

type PedidoFila = Prisma.PedidoCreateManyInput & { creadoEn: Date };

export interface ResultadoPedidos {
  pedidos: number;
  items: number;
  activosHoy: number;
}

/**
 * Genera `dias` días de pedidos por sede hasta el momento actual.
 * Los pedidos de hoy reflejan su estado real en el instante del seed:
 * los más recientes quedan en RECIBIDO, EN_PREPARACION o LISTO para alimentar cocina y pantalla.
 */
export async function sembrarPedidos(
  prisma: PrismaClient,
  rng: Rng,
  sedes: SedeCtx[],
  ahora: Date,
  dias: number,
): Promise<ResultadoPedidos> {
  let totalPedidos = 0;
  let totalItems = 0;
  let activosHoy = 0;

  for (const sede of sedes) {
    const hoy = fechaOperacion(ahora, sede.zona);
    const pedidos: PedidoFila[] = [];
    const items: Prisma.PedidoItemCreateManyInput[] = [];
    const historial: Prisma.PedidoEstadoHistorialCreateManyInput[] = [];
    const secuencias: Prisma.SecuenciaPedidoCreateManyInput[] = [];
    const calificaciones: Prisma.CalificacionCreateManyInput[] = [];
    const pesosProductos = sede.productos.map((p) => [p, p.popularidad] as const);
    const horaFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: sede.zona,
      hour: 'numeric',
      hourCycle: 'h23',
    });

    for (let d = dias - 1; d >= 0; d--) {
      const fecha = sumarDias(hoy, -d);
      const tendencia = 1 + 0.15 * ((dias - d) / dias); // la cadena crece en el periodo
      const cantidad = Math.round(
        BASE_DIARIA *
          sede.demanda *
          FACTOR_DIA[diaSemana(fecha)]! *
          tendencia *
          rng.rango(0.85, 1.15),
      );

      // Instantes de creación del día, ordenados (definen el consecutivo)
      const instantes: Date[] = [];
      for (let i = 0; i < cantidad; i++) {
        const hora = rng.ponderado(PESO_HORA);
        const instante = localAUtc(fecha, hora, rng.entero(0, 59), sede.zona);
        const conSegundos = new Date(instante.getTime() + rng.entero(0, 59) * 1000);
        if (conSegundos <= ahora) instantes.push(conSegundos);
      }
      instantes.sort((a, b) => a.getTime() - b.getTime());

      instantes.forEach((creadoEn, idx) => {
        const numero = idx + 1;
        const pedidoId = randomUUID();
        const horaLocal = Number(horaFmt.format(creadoEn));
        const enPico = HORAS_PICO.has(horaLocal);

        // Líneas del pedido
        const lineas = new Map<
          number,
          {
            precio: number;
            nombre: string;
            cantidad: number;
            notas: string | null;
            componentes?: { nombre: string; cantidad: number }[];
          }
        >();
        const nLineas = rng.ponderado([
          [1, 30],
          [2, 40],
          [3, 22],
          [4, 8],
        ] as const);
        for (let l = 0; l < nLineas; l++) {
          const p = rng.ponderado(pesosProductos);
          const previa = lineas.get(p.id);
          if (previa) previa.cantidad += 1;
          else
            lineas.set(p.id, {
              precio: p.precio,
              nombre: p.nombre,
              componentes: p.componentes,
              cantidad: rng.ponderado([
                [1, 80],
                [2, 17],
                [3, 3],
              ] as const),
              notas: rng.prob(0.12) ? rng.elegir(NOTAS_ITEM) : null,
            });
        }
        const lista = [...lineas.entries()].map(([productoId, l]) => ({ productoId, ...l }));
        const { subtotal, impuestos, total } = calcularTotales(
          lista.map((l) => ({ precioUnitario: l.precio, cantidad: l.cantidad })),
          sede.pais.tasaImpuesto,
        );

        // Línea de tiempo del pedido
        const enPreparacion = sumarMin(creadoEn, rng.rango(0.5, 3));
        const listo = sumarMin(enPreparacion, rng.rango(4, enPico ? 15 : 10));
        const entregado = sumarMin(listo, rng.rango(0.5, 4));
        const cancelado = rng.prob(0.015);
        const pasos: [EstadoPedido, Date][] = [['RECIBIDO', creadoEn]];
        if (cancelado) {
          if (rng.prob(0.5)) pasos.push(['EN_PREPARACION', enPreparacion]);
          pasos.push(['CANCELADO', sumarMin(pasos[pasos.length - 1]![1], rng.rango(1, 4))]);
        } else {
          pasos.push(['EN_PREPARACION', enPreparacion], ['LISTO', listo], ['ENTREGADO', entregado]);
        }
        const ocurridos = pasos.filter(([, t]) => t <= ahora);
        const estado = ocurridos[ocurridos.length - 1]![0];
        if (estado === 'RECIBIDO' || estado === 'EN_PREPARACION' || estado === 'LISTO')
          activosHoy++;

        const canal = rng.prob(0.3) ? 'KIOSCO' : 'CAJA';
        const cocinero = rng.elegir(sede.cocina);
        pedidos.push({
          id: pedidoId,
          sedeId: sede.id,
          fechaOperacion: aFechaDb(fecha),
          numeroDia: numero,
          codigo: formatearCodigo(sede.prefijo, numero),
          canal,
          estado,
          clienteNombre: canal === 'KIOSCO' && rng.prob(0.6) ? rng.elegir(NOMBRES) : null,
          cajeroId: canal === 'CAJA' ? rng.elegir(sede.cajeros) : null,
          mesaId: null,
          subtotal: subtotal.toString(),
          impuestos: impuestos.toString(),
          total: total.toString(),
          moneda: sede.pais.moneda,
          totalUsd: aUsd(total, sede.pais.tasaUsd).toString(),
          metodoPago: rng.ponderado([
            ['TARJETA', 55],
            ['EFECTIVO', 35],
            ['TRANSFERENCIA', 10],
          ] as const),
          creadoEn,
          listoEn: ocurridos.some(([e]) => e === 'LISTO') ? listo : null,
          entregadoEn: estado === 'ENTREGADO' ? entregado : null,
        });

        for (const l of lista) {
          items.push({
            id: randomUUID(),
            pedidoId,
            productoId: l.productoId,
            nombreProducto: l.nombre,
            cantidad: l.cantidad,
            precioUnitario: l.precio.toFixed(2),
            subtotal: (l.precio * l.cantidad).toFixed(2),
            notas: l.notas,
            ...(l.componentes ? { componentes: l.componentes } : {}),
          });
        }

        for (const [e, t] of ocurridos) {
          historial.push({
            id: randomUUID(),
            pedidoId,
            estado: e,
            usuarioId:
              e === 'RECIBIDO' ? (canal === 'CAJA' ? rng.elegir(sede.cajeros) : null) : cocinero,
            registradoEn: t,
          });
        }

        // Unas pocas calificaciones del servicio desde el kiosco o el ticket
        if (estado === 'ENTREGADO' && rng.prob(0.03)) {
          const puntaje = rng.ponderado([
            [5, 42],
            [4, 34],
            [3, 13],
            [2, 7],
            [1, 4],
          ] as const);
          calificaciones.push({
            id: randomUUID(),
            sedeId: sede.id,
            clienteId: null,
            pedidoId,
            reservaId: null,
            puntaje,
            comentario: rng.prob(0.4)
              ? rng.elegir(puntaje >= 4 ? COMENTARIOS_BUENOS : COMENTARIOS_MALOS)
              : null,
            creadoEn: sumarMin(entregado, rng.entero(5, 60)),
          });
        }
      });

      if (instantes.length > 0) {
        secuencias.push({
          sedeId: sede.id,
          fechaOperacion: aFechaDb(fecha),
          tipo: 'PEDIDO',
          ultimoNumero: instantes.length,
        });
      }
    }

    await insertarEnLotes(pedidos, (lote) => prisma.pedido.createMany({ data: lote }));
    await insertarEnLotes(items, (lote) => prisma.pedidoItem.createMany({ data: lote }));
    await insertarEnLotes(historial, (lote) =>
      prisma.pedidoEstadoHistorial.createMany({ data: lote }),
    );
    await insertarEnLotes(secuencias, (lote) => prisma.secuenciaPedido.createMany({ data: lote }));
    await insertarEnLotes(
      calificaciones.filter((c) => c.creadoEn! <= ahora),
      (lote) => prisma.calificacion.createMany({ data: lote }),
    );

    totalPedidos += pedidos.length;
    totalItems += items.length;
    console.log(`  · ${sede.codigo}: ${pedidos.length.toLocaleString('es-CO')} pedidos`);
  }

  return { pedidos: totalPedidos, items: totalItems, activosHoy };
}
