import { z } from 'zod';
import { EVENTOS } from '@restaurantes/shared';
import { prisma } from '../../db/prisma';
import { crearModulo } from '../../http/ruta';
import { emitirATodos } from '../../realtime/socket';
import { invalidarConfiguracion, obtenerConfiguracion } from './configuracion.service';

export const moduloConfiguracion = crearModulo('Configuración');
const { ruta } = moduloConfiguracion;

ruta(
  {
    metodo: 'get',
    ruta: '/configuracion',
    resumen: 'Funciones activas de la cadena',
    descripcion:
      'Público: el portal lo usa para mostrar u ocultar las reservas y el botón de salir de la fila.',
    auth: 'publico',
  },
  async ({ res }) => {
    res.setHeader('Cache-Control', 'no-cache');
    return obtenerConfiguracion();
  },
);

ruta(
  {
    metodo: 'put',
    ruta: '/configuracion',
    resumen: 'Activar o desactivar funciones',
    descripcion:
      'Solo el admin global. Desactivar las reservas no cancela las ya hechas: el personal las sigue viendo y atendiendo; solo deja de aceptar nuevas.',
    auth: 'personal',
    roles: ['ADMIN_GLOBAL'],
    body: z
      .object({
        reservasHabilitadas: z.boolean().optional(),
        salirFilaHabilitado: z.boolean().optional(),
      })
      .refine((b) => Object.keys(b).length > 0, { message: 'Indica al menos un ajuste' }),
  },
  async ({ auth, body }) => {
    await obtenerConfiguracion(); // asegura la fila
    await prisma.configuracion.update({
      where: { id: 1 },
      data: { ...body, actualizadoPor: auth.id },
    });
    invalidarConfiguracion();
    const valor = await obtenerConfiguracion();
    emitirATodos(EVENTOS.configuracionActualizada, valor);
    return valor;
  },
);
