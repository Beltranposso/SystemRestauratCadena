import {
  Prisma,
  type CanalPedido,
  type EstadoPedido,
  type MetodoPago,
  type RolUsuario,
} from '@prisma/client';
import {
  aplicarPromociones,
  EVENTOS,
  ESTADOS_PEDIDO_ACTIVOS,
  TRANSICIONES_PEDIDO,
  puedeTransicionar,
} from '@restaurantes/shared';
import { prisma } from '../../db/prisma';
import { formatearCodigo, siguienteConsecutivo } from '../../db/secuencias';
import { aFechaDb, fechaOperacion } from '../../utils/fechas';
import { aUsd, redondear } from '../../utils/dinero';
import { filasVendibles, promocionesVigentes } from '../menu/menu.service';
import { HttpError } from '../../utils/http-error';
import { asegurarSede } from '../../auth/alcance';
import type { AuthDispositivo, AuthPersonal } from '../../auth/tipos';
import { emitirASede } from '../../realtime/socket';

export const incluirDetalle = {
  items: { orderBy: { nombreProducto: 'asc' } },
  cajero: { select: { id: true, nombre: true } },
} satisfies Prisma.PedidoInclude;

type PedidoDetalle = Prisma.PedidoGetPayload<{ include: typeof incluirDetalle }>;

/** Lo que ve la pantalla de clientes: sin montos ni ítems. */
export const paraPantalla = (p: {
  id: string;
  codigo: string;
  estado: EstadoPedido;
  clienteNombre: string | null;
  creadoEn: Date;
  listoEn: Date | null;
}) => ({
  id: p.id,
  codigo: p.codigo,
  estado: p.estado,
  clienteNombre: p.clienteNombre,
  creadoEn: p.creadoEn,
  listoEn: p.listoEn,
});

function difundir(evento: string, pedido: PedidoDetalle) {
  emitirASede(pedido.sedeId, 'cocina', evento, pedido);
  emitirASede(pedido.sedeId, 'caja', evento, pedido);
  emitirASede(pedido.sedeId, 'pantalla', evento, paraPantalla(pedido));
}

export interface DatosNuevoPedido {
  sedeId?: number;
  canal?: CanalPedido;
  metodoPago: MetodoPago;
  clienteNombre?: string;
  mesaId?: number;
  items: { productoId: number; cantidad: number; notas?: string }[];
}

/**
 * Crea un pedido en una sola transacción: valida el menú de la sede (un combo solo se vende si
 * todos sus componentes están disponibles), copia nombre, precio y contenido de cada producto,
 * aplica la mejor promoción vigente por producto, calcula impuestos y total en USD, y toma el
 * consecutivo del día.
 * Al confirmar, avisa a cocina, caja y pantalla por Socket.IO.
 */
export async function crearPedido(auth: AuthPersonal | AuthDispositivo, datos: DatosNuevoPedido) {
  let sedeId = datos.sedeId;
  let canal: CanalPedido = datos.canal ?? 'CAJA';
  if (auth.tipo === 'dispositivo') {
    if (sedeId && sedeId !== auth.sedeId)
      throw HttpError.forbidden('El kiosco solo crea pedidos de su sede');
    sedeId = auth.sedeId;
    canal = 'KIOSCO';
  }
  if (!sedeId) throw HttpError.badRequest('sedeId es obligatorio');
  const sede = await asegurarSede(auth, sedeId);
  if (!sede.activa) throw HttpError.unprocessable('La sede está inactiva');

  if (datos.mesaId) {
    const mesa = await prisma.mesa.findFirst({ where: { id: datos.mesaId, sedeId } });
    if (!mesa) throw HttpError.unprocessable('La mesa no pertenece a esta sede');
  }

  const ids = [...new Set(datos.items.map((i) => i.productoId))];
  const ahora = new Date();
  const [{ filas }, promociones] = await Promise.all([
    filasVendibles(sedeId, ids),
    promocionesVigentes(sede, ahora),
  ]);
  const porProducto = new Map(filas.map((m) => [m.productoId, m]));
  const noDisponibles = ids.filter((id) => !porProducto.has(id));
  if (noDisponibles.length) {
    throw HttpError.unprocessable('Hay productos que no están disponibles en esta sede', {
      productoIds: noDisponibles,
    });
  }

  // Precio del menú de la sede + la mejor promoción vigente (misma regla que muestra el kiosco)
  const base = datos.items.map((i) => {
    const m = porProducto.get(i.productoId)!;
    return { ...i, fila: m, precio: m.precio };
  });
  const descuentos = aplicarPromociones(
    base.map((l) => ({
      productoId: l.productoId,
      categoriaId: l.fila.producto.categoriaId,
      precio: l.precio.toString(),
      cantidad: l.cantidad,
    })),
    promociones,
  );
  const lineas = base.map((l, i) => {
    const descuento = redondear(descuentos[i]!.descuento);
    return {
      productoId: l.productoId,
      cantidad: l.cantidad,
      notas: l.notas,
      nombre: l.fila.producto.nombre,
      precioUnitario: l.precio,
      descuento,
      subtotal: l.precio.mul(l.cantidad).sub(descuento),
      promocion: descuentos[i]!.promocion,
      componentes: l.fila.producto.esCombo
        ? l.fila.producto.componentes.map((c) => ({
            nombre: c.producto.nombre,
            cantidad: c.cantidad,
          }))
        : null,
    };
  });
  const subtotal = redondear(lineas.reduce((acc, l) => acc.add(l.subtotal), redondear(0)));
  const descuento = redondear(lineas.reduce((acc, l) => acc.add(l.descuento), redondear(0)));
  const impuestos = redondear(subtotal.mul(sede.tasaImpuesto));
  const total = subtotal.add(impuestos);
  const fecha = fechaOperacion(ahora, sede.zonaHoraria);
  const usuarioId = auth.tipo === 'usuario' ? auth.id : null;

  const pedido = await prisma.$transaction(async (tx) => {
    const numero = await siguienteConsecutivo(tx, sedeId, fecha, 'PEDIDO');
    return tx.pedido.create({
      data: {
        sedeId,
        fechaOperacion: aFechaDb(fecha),
        numeroDia: numero,
        codigo: formatearCodigo(sede.prefijoPedido, numero),
        canal,
        clienteNombre: datos.clienteNombre ?? null,
        cajeroId: usuarioId,
        mesaId: datos.mesaId ?? null,
        subtotal,
        descuento,
        impuestos,
        total,
        moneda: sede.moneda,
        totalUsd: aUsd(total, sede.tasaUsd),
        metodoPago: datos.metodoPago,
        creadoEn: ahora,
        items: {
          create: lineas.map((l) => ({
            productoId: l.productoId,
            nombreProducto: l.nombre,
            cantidad: l.cantidad,
            precioUnitario: l.precioUnitario,
            descuento: l.descuento,
            subtotal: l.subtotal,
            notas: l.notas ?? null,
            promocionId: l.promocion?.id ?? null,
            promocionNombre: l.promocion?.nombre ?? null,
            componentes: l.componentes ?? Prisma.DbNull,
          })),
        },
        historial: { create: { estado: 'RECIBIDO', usuarioId, registradoEn: ahora } },
      },
      include: incluirDetalle,
    });
  });

  difundir(EVENTOS.pedidoCreado, pedido);
  return pedido;
}

/** Quién puede llevar un pedido a cada estado. Los gerentes y el admin pueden todo. */
const ROLES_POR_ESTADO: Record<EstadoPedido, readonly RolUsuario[]> = {
  RECIBIDO: [],
  EN_PREPARACION: ['COCINA'],
  LISTO: ['COCINA'],
  ENTREGADO: ['COCINA', 'CAJERO'],
  CANCELADO: ['CAJERO'],
};
const GERENCIA: readonly RolUsuario[] = ['ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE'];

export async function cambiarEstado(auth: AuthPersonal, pedidoId: string, nuevo: EstadoPedido) {
  const actual = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!actual) throw HttpError.notFound('Pedido');
  await asegurarSede(auth, actual.sedeId);

  if (!GERENCIA.includes(auth.rol) && !ROLES_POR_ESTADO[nuevo].includes(auth.rol)) {
    throw HttpError.forbidden(`Tu rol no puede marcar pedidos como ${nuevo}`);
  }
  if (!puedeTransicionar(TRANSICIONES_PEDIDO, actual.estado, nuevo)) {
    throw HttpError.unprocessable(`No se puede pasar de ${actual.estado} a ${nuevo}`, {
      permitidos: TRANSICIONES_PEDIDO[actual.estado],
    });
  }

  const ahora = new Date();
  const pedido = await prisma.$transaction(async (tx) => {
    // Bloqueo optimista: si otra pantalla lo cambió primero, esta petición no gana.
    const r = await tx.pedido.updateMany({
      where: { id: pedidoId, estado: actual.estado },
      data: {
        estado: nuevo,
        ...(nuevo === 'LISTO' ? { listoEn: ahora } : {}),
        ...(nuevo === 'ENTREGADO' ? { entregadoEn: ahora } : {}),
      },
    });
    if (r.count === 0)
      throw HttpError.conflict(
        'El pedido cambió de estado mientras tanto; recarga y vuelve a intentar',
      );
    await tx.pedidoEstadoHistorial.create({
      data: { pedidoId, estado: nuevo, usuarioId: auth.id, registradoEn: ahora },
    });
    return tx.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: incluirDetalle });
  });

  difundir(EVENTOS.pedidoActualizado, pedido);
  return pedido;
}

/** Pedidos vivos de una sede (cocina y caja), del más antiguo al más reciente. */
export async function pedidosActivos(sedeId: number) {
  const pedidos = await prisma.pedido.findMany({
    where: { sedeId, estado: { in: [...ESTADOS_PEDIDO_ACTIVOS] } },
    include: incluirDetalle,
    orderBy: { creadoEn: 'asc' },
  });
  const ahora = Date.now();
  return pedidos.map((p) => ({
    ...p,
    minutosTranscurridos: Math.floor((ahora - p.creadoEn.getTime()) / 60_000),
  }));
}
