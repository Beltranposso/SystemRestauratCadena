import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { esProduccion } from '../config/env';
import { HttpError } from '../utils/http-error';

type CuerpoError = { error: { code: string; message: string; details?: unknown } };

export const rutaNoEncontrada: RequestHandler = (req, res) => {
  const cuerpo: CuerpoError = {
    error: { code: 'RUTA_NO_ENCONTRADA', message: `No existe ${req.method} ${req.originalUrl}` },
  };
  res.status(404).json(cuerpo);
};

/** Traduce cualquier error a la forma uniforme `{ error: { code, message, details? } }`. */
export const manejadorErrores: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let cuerpo: CuerpoError = {
    error: { code: 'ERROR_INTERNO', message: 'Ocurrió un error inesperado' },
  };

  if (err instanceof HttpError) {
    status = err.status;
    cuerpo = { error: { code: err.code, message: err.message, details: err.details } };
  } else if (err instanceof ZodError) {
    status = 400;
    cuerpo = {
      error: {
        code: 'VALIDACION',
        message: 'Hay campos inválidos en la solicitud',
        details: err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
      },
    };
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      status = 409;
      cuerpo = {
        error: {
          code: 'DUPLICADO',
          message: 'Ya existe un registro con esos datos',
          details: err.meta,
        },
      };
    } else if (err.code === 'P2025') {
      status = 404;
      cuerpo = { error: { code: 'NO_ENCONTRADO', message: 'El registro no existe' } };
    } else if (err.code === 'P2003') {
      status = 409;
      cuerpo = {
        error: {
          code: 'REFERENCIA_INVALIDA',
          message: 'El registro referencia datos inexistentes o en uso',
        },
      };
    }
  } else if (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    (err as { type?: string }).type === 'entity.parse.failed'
  ) {
    status = 400;
    cuerpo = {
      error: { code: 'JSON_INVALIDO', message: 'El cuerpo de la solicitud no es JSON válido' },
    };
  }

  if (status >= 500) {
    logger.error({ err, metodo: req.method, ruta: req.originalUrl }, 'Error no controlado');
    if (!esProduccion && err instanceof Error) cuerpo.error.details = { causa: err.message };
  }

  res.status(status).json(cuerpo);
};
