import type { CanalNotificacion, TipoNotificacion } from '@prisma/client';
import { EVENTOS } from '@restaurantes/shared';
import { logger } from '../../config/logger';
import { prisma } from '../../db/prisma';
import { emitirACliente, emitirAEspera } from '../../realtime/socket';
import { enviarCorreo } from '../../utils/correo';

export interface NuevaNotificacion {
  tipo: TipoNotificacion;
  asunto: string;
  mensaje: string;
  clienteId?: string | null;
  /** Email del cliente (habilita el canal EMAIL) */
  email?: string | null;
  /** Para comensales sin cuenta: teléfono como destino visible */
  telefono?: string | null;
  reservaId?: string | null;
  entradaEsperaId?: string | null;
  datos?: Record<string, unknown>;
}

/**
 * Registra y entrega una notificación por todos los canales disponibles:
 * - EN_APP: Socket.IO a la sala del cliente y/o a la del turno de espera.
 * - EMAIL: si hay correo.
 * Se llama DESPUÉS de confirmar la transacción de negocio; un fallo aquí nunca revierte
 * la reserva o el turno: queda la fila en estado FALLIDA para reintentar.
 */
export async function notificar(n: NuevaNotificacion): Promise<void> {
  const canales: { canal: CanalNotificacion; destino: string }[] = [];
  if (n.clienteId || n.entradaEsperaId) {
    canales.push({ canal: 'EN_APP', destino: n.email ?? n.telefono ?? 'app' });
  }
  if (n.email) canales.push({ canal: 'EMAIL', destino: n.email });

  for (const { canal, destino } of canales) {
    const registro = await prisma.notificacion.create({
      data: {
        clienteId: n.clienteId ?? null,
        destino,
        canal,
        tipo: n.tipo,
        reservaId: n.reservaId ?? null,
        entradaEsperaId: n.entradaEsperaId ?? null,
      },
    });
    try {
      if (canal === 'EN_APP') {
        const evento = { id: registro.id, tipo: n.tipo, mensaje: n.mensaje, datos: n.datos ?? {} };
        if (n.clienteId) emitirACliente(n.clienteId, EVENTOS.notificacion, evento);
        if (n.entradaEsperaId) emitirAEspera(n.entradaEsperaId, EVENTOS.notificacion, evento);
      } else {
        await enviarCorreo({ para: destino, asunto: n.asunto, texto: n.mensaje });
      }
      await prisma.notificacion.update({
        where: { id: registro.id },
        data: { estado: 'ENVIADA', enviadaEn: new Date() },
      });
    } catch (err) {
      logger.error({ err, notificacion: registro.id }, 'No se pudo entregar la notificación');
      await prisma.notificacion.update({ where: { id: registro.id }, data: { estado: 'FALLIDA' } });
    }
  }
}

/** Igual que notificar() pero sin propagar errores (para usar tras un commit). */
export function notificarSinEsperar(n: NuevaNotificacion): Promise<void> {
  return notificar(n).catch((err) => logger.error({ err }, 'Error registrando notificación'));
}
