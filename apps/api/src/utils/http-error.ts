/**
 * Error controlado de la API. El manejador central lo convierte en
 * `{ error: { code, message, details? } }` con el status indicado.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  static badRequest(message: string, details?: unknown) {
    return new HttpError(400, 'SOLICITUD_INVALIDA', message, details);
  }
  static unauthorized(message = 'Debes iniciar sesión') {
    return new HttpError(401, 'NO_AUTENTICADO', message);
  }
  static forbidden(message = 'No tienes permiso para esta acción') {
    return new HttpError(403, 'SIN_PERMISO', message);
  }
  static notFound(recurso = 'Recurso') {
    return new HttpError(404, 'NO_ENCONTRADO', `${recurso} no encontrado`);
  }
  static conflict(message: string, details?: unknown) {
    return new HttpError(409, 'CONFLICTO', message, details);
  }
  static unprocessable(message: string, details?: unknown) {
    return new HttpError(422, 'REGLA_DE_NEGOCIO', message, details);
  }
}
