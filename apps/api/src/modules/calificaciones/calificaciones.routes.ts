import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { crearModulo } from '../../http/ruta';
import { HttpError } from '../../utils/http-error';

export const moduloCalificaciones = crearModulo('Calificaciones');

const DIAS_PARA_CALIFICAR_PEDIDO = 7;

moduloCalificaciones.ruta(
  {
    metodo: 'post',
    ruta: '/calificaciones',
    resumen: 'Calificar el servicio (1 a 5)',
    descripcion:
      'Por reserva: el cliente dueño, cuando la reserva está COMPLETADA. ' +
      `Por pedido: cualquiera con el id del ticket (QR), si fue ENTREGADO hace menos de ${DIAS_PARA_CALIFICAR_PEDIDO} días. ` +
      'Una sola calificación por pedido o reserva.',
    auth: 'cliente-opcional',
    status: 201,
    body: z
      .object({
        puntaje: z.number().int().min(1).max(5),
        comentario: z.string().trim().max(500).optional(),
        pedidoId: z.string().uuid().optional(),
        reservaId: z.string().uuid().optional(),
      })
      .refine((b) => Boolean(b.pedidoId) !== Boolean(b.reservaId), {
        message: 'Indica pedidoId o reservaId (solo uno)',
      }),
  },
  async ({ auth, body }) => {
    let sedeId: number;
    if (body.reservaId) {
      if (!auth) throw HttpError.unauthorized('Inicia sesión para calificar tu reserva');
      const reserva = await prisma.reserva.findUnique({ where: { id: body.reservaId } });
      if (!reserva || reserva.clienteId !== auth.id) throw HttpError.notFound('Reserva');
      if (reserva.estado !== 'COMPLETADA')
        throw HttpError.unprocessable('Solo se califican visitas completadas');
      sedeId = reserva.sedeId;
    } else {
      const pedido = await prisma.pedido.findUnique({ where: { id: body.pedidoId! } });
      if (!pedido) throw HttpError.notFound('Pedido');
      if (pedido.estado !== 'ENTREGADO')
        throw HttpError.unprocessable('Solo se califican pedidos entregados');
      if (
        Date.now() - (pedido.entregadoEn ?? pedido.creadoEn).getTime() >
        DIAS_PARA_CALIFICAR_PEDIDO * 86_400_000
      ) {
        throw HttpError.unprocessable('El plazo para calificar este pedido terminó');
      }
      sedeId = pedido.sedeId;
    }

    const yaExiste = await prisma.calificacion.findFirst({
      where: body.reservaId ? { reservaId: body.reservaId } : { pedidoId: body.pedidoId },
    });
    if (yaExiste) throw HttpError.conflict('Ya calificaste esta visita');

    return prisma.calificacion.create({
      data: {
        sedeId,
        clienteId: auth?.id ?? null,
        pedidoId: body.pedidoId ?? null,
        reservaId: body.reservaId ?? null,
        puntaje: body.puntaje,
        comentario: body.comentario ?? null,
      },
    });
  },
);
