import type { NextFunction, Request, Response } from 'express';
import type { ZodType, z } from 'zod';

type Esquemas = { body?: ZodType; query?: ZodType; params?: ZodType };

/**
 * Valida body, query y params con zod. Si algo falla, el ZodError llega al manejador
 * central y responde 400 con el detalle de cada campo.
 *
 * El body validado reemplaza a `req.body`. Query y params quedan en `res.locals.query`
 * y `res.locals.params` (en Express 5 `req.query` es de solo lectura).
 */
export function validar(esquemas: Esquemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (esquemas.body) req.body = esquemas.body.parse(req.body ?? {});
    if (esquemas.query) res.locals.query = esquemas.query.parse(req.query);
    if (esquemas.params) res.locals.params = esquemas.params.parse(req.params);
    next();
  };
}

/** Lee la query ya validada con su tipo. */
export const queryValidada = <S extends ZodType>(res: Response, _esquema: S) =>
  res.locals.query as z.infer<S>;

/** Lee los params ya validados con su tipo. */
export const paramsValidados = <S extends ZodType>(res: Response, _esquema: S) =>
  res.locals.params as z.infer<S>;
