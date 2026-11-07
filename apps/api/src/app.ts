import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { manejadorErrores, rutaNoEncontrada } from './middlewares/manejador-errores';
import { generarOpenApi } from './http/openapi';
import { DIR_UPLOADS } from './utils/imagenes';
import { rutasSalud } from './modules/salud/salud.routes';
import { moduloAuth, moduloAuthClientes } from './modules/auth/auth.routes';
import { moduloGeografia } from './modules/geografia/geografia.routes';
import { moduloDispositivos } from './modules/dispositivos/dispositivos.routes';
import { moduloPromociones } from './modules/promociones/promociones.routes';
import { moduloConfiguracion } from './modules/configuracion/configuracion.routes';
import { moduloMarca } from './modules/marca/marca.routes';
import { moduloUsuarios } from './modules/usuarios/usuarios.routes';
import { moduloMenu } from './modules/menu/menu.routes';
import { moduloPedidos } from './modules/pedidos/pedidos.routes';
import { moduloTurnos } from './modules/turnos/turnos.routes';
import { moduloMesas } from './modules/salon/mesas.routes';
import { moduloReservas } from './modules/salon/reservas.routes';
import { moduloEspera } from './modules/salon/espera.routes';
import { moduloCalificaciones } from './modules/calificaciones/calificaciones.routes';
import { moduloReportes } from './modules/reportes/reportes.routes';

const MODULOS = [
  moduloAuth,
  moduloAuthClientes,
  moduloGeografia,
  moduloDispositivos,
  moduloUsuarios,
  moduloMenu,
  moduloPromociones,
  moduloPedidos,
  moduloTurnos,
  moduloMesas,
  moduloReservas,
  moduloEspera,
  moduloCalificaciones,
  moduloReportes,
  moduloMarca,
  moduloConfiguracion,
];

/**
 * Arma la aplicación Express sin abrir el puerto (server.ts lo hace).
 * Separarlo permite probar la API con supertest sin levantar el servidor.
 */
export function crearApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Documentación interactiva: va antes de helmet porque Swagger UI necesita una CSP más laxa
  const openapi = generarOpenApi();
  app.get('/api/openapi.json', (_req, res) => {
    res.json(openapi);
  });
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openapi, { customSiteTitle: 'API Restaurantes' }),
  );

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  // Fotos de productos: nombres únicos por contenido, así que se pueden guardar en caché un año
  app.use(
    '/uploads',
    express.static(DIR_UPLOADS, { immutable: true, maxAge: '365d', index: false }),
  );
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    }),
  );

  const api = express.Router();
  api.get('/', (_req, res) => {
    res.json({
      servicio: 'restaurantes-api',
      docs: '/api/docs',
      openapi: '/api/openapi.json',
      salud: '/api/health',
    });
  });
  api.use('/health', rutasSalud);
  for (const modulo of MODULOS) api.use(modulo.router);

  app.use('/api', api);
  app.use(rutaNoEncontrada);
  app.use(manejadorErrores);

  return app;
}
