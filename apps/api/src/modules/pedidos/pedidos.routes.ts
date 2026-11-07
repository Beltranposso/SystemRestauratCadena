import { z } from 'zod';
import type { EstadoPedido, Prisma } from '@prisma/client';
import { EstadoPedido as Estados } from '@restaurantes/shared';
import { prisma } from '../../db/prisma';
import { crearModulo } from '../../http/ruta';
import {
  fecha,
  idEntero,
  listaEnum,
  paginacion,
  paginado,
  paramsSede,
  paramsUuid,
  saltar,
} from '../../http/esquemas';
import { HttpError } from '../../utils/http-error';
import { aFechaDb } from '../../utils/fechas';
import { asegurarSede, sedesFiltradas } from '../../auth/alcance';
import {
  cambiarEstado,
  crearPedido,
  incluirDetalle,
  paraPantalla,
  pedidosActivos,
} from './pedidos.service';

export const moduloPedidos = crearModulo('Pedidos');
const { ruta } = moduloPedidos;

const estados = Object.keys(Estados) as [EstadoPedido, ...EstadoPedido[]];

ruta(
  {
    metodo: 'post',
    ruta: '/pedidos',
    resumen: 'Crear pedido (caja o kiosco)',
    descripcion:
      'Desde un kiosco (X-Device-Token) la sede y el canal salen del dispositivo. ' +
      'Responde 422 con `details.productoIds` si algún producto no está disponible en la sede.',
    auth: 'personal-o-dispositivo',
    roles: ['CAJERO', 'GERENTE_SEDE', 'GERENTE_PAIS', 'ADMIN_GLOBAL'],
    dispositivos: ['KIOSCO'],
    status: 201,
    body: z.object({
      sedeId: idEntero.optional(),
      canal: z.enum(['CAJA', 'KIOSCO', 'WEB']).optional(),
      metodoPago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']),
      clienteNombre: z.string().trim().min(1).max(80).optional(),
      mesaId: idEntero.optional(),
      items: z
        .array(
          z.object({
            productoId: idEntero,
            cantidad: z.number().int().min(1).max(50),
            notas: z.string().trim().max(200).optional(),
          }),
        )
        .min(1, 'El pedido necesita al menos un producto')
        .max(50),
    }),
  },
  async ({ auth, body }) => crearPedido(auth, body),
);

ruta(
  {
    metodo: 'get',
    ruta: '/pedidos',
    resumen: 'Historial de pedidos (filtrable)',
    auth: 'personal',
    query: paginacion.extend({
      sedeId: idEntero.optional(),
      estado: listaEnum(estados).optional().describe('Uno o varios separados por coma'),
      fecha: fecha.optional().describe('Día de operación local de la sede'),
      codigo: z.string().trim().toUpperCase().max(12).optional(),
    }),
  },
  async ({ auth, query }) => {
    const sedes = await sedesFiltradas(auth, { sedeId: query.sedeId });
    const where: Prisma.PedidoWhereInput = {
      sedeId: { in: sedes.map((s) => s.id) },
      ...(query.estado ? { estado: { in: query.estado } } : {}),
      ...(query.fecha ? { fechaOperacion: aFechaDb(query.fecha) } : {}),
      ...(query.codigo ? { codigo: query.codigo } : {}),
    };
    const [datos, total] = await Promise.all([
      prisma.pedido.findMany({
        where,
        include: incluirDetalle,
        orderBy: { creadoEn: 'desc' },
        ...saltar(query),
      }),
      prisma.pedido.count({ where }),
    ]);
    return paginado(datos, total, query);
  },
);

ruta(
  {
    metodo: 'get',
    ruta: '/sedes/:sedeId/pedidos/activos',
    resumen: 'Pedidos en curso (monitor de cocina y caja)',
    auth: 'personal',
    params: paramsSede,
  },
  async ({ auth, params }) => {
    await asegurarSede(auth, params.sedeId);
    return pedidosActivos(params.sedeId);
  },
);

ruta(
  {
    metodo: 'get',
    ruta: '/pedidos/:id',
    resumen: 'Detalle de pedido con su historial de estados',
    auth: 'personal',
    params: paramsUuid,
  },
  async ({ auth, params }) => {
    const pedido = await prisma.pedido.findUnique({
      where: { id: params.id },
      include: {
        ...incluirDetalle,
        historial: {
          orderBy: { registradoEn: 'asc' },
          include: { usuario: { select: { nombre: true, rol: true } } },
        },
      },
    });
    if (!pedido) throw HttpError.notFound('Pedido');
    await asegurarSede(auth, pedido.sedeId);
    return pedido;
  },
);

ruta(
  {
    metodo: 'patch',
    ruta: '/pedidos/:id/estado',
    resumen: 'Avanzar o cancelar un pedido',
    descripcion:
      'Flujo: RECIBIDO → EN_PREPARACION → LISTO → ENTREGADO; CANCELADO desde RECIBIDO o EN_PREPARACION. ' +
      'Cocina prepara y marca listo; caja entrega o cancela; los gerentes pueden todo. ' +
      '409 si otro usuario cambió el pedido primero; 422 si la transición no es válida.',
    auth: 'personal',
    params: paramsUuid,
    body: z.object({ estado: z.enum(estados) }),
  },
  async ({ auth, params, body }) => cambiarEstado(auth, params.id, body.estado),
);

ruta(
  {
    metodo: 'get',
    ruta: '/pantalla/:sedeId/pedidos',
    resumen: 'Estado de pedidos para la pantalla de clientes',
    descripcion: 'Sin montos ni ítems. `listos` muestra los de los últimos 30 minutos.',
    auth: 'personal-o-dispositivo',
    dispositivos: ['PANTALLA', 'KIOSCO'],
    params: paramsSede,
  },
  async ({ auth, params }) => {
    await asegurarSede(auth, params.sedeId);
    const pedidos = await prisma.pedido.findMany({
      where: {
        sedeId: params.sedeId,
        OR: [
          { estado: { in: ['RECIBIDO', 'EN_PREPARACION'] } },
          { estado: 'LISTO', listoEn: { gte: new Date(Date.now() - 30 * 60_000) } },
        ],
      },
      select: {
        id: true,
        codigo: true,
        estado: true,
        clienteNombre: true,
        creadoEn: true,
        listoEn: true,
      },
      orderBy: { creadoEn: 'asc' },
    });
    return {
      preparando: pedidos.filter((p) => p.estado !== 'LISTO').map(paraPantalla),
      listos: pedidos
        .filter((p) => p.estado === 'LISTO')
        .map(paraPantalla)
        .reverse(),
    };
  },
);
