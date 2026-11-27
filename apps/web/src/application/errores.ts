/** Forma del error que devuelve la API (y del error de RTK Query). */
export interface ErrorApi {
  status?: number;
  code?: string;
  message?: string;
  details?: unknown;
  data?: unknown;
  /** Compatible con el error tipado de RTK Query. */
  error?: ErrorApi;
  response?: { data?: { error?: ErrorApi } };
  [clave: string]: unknown;
}

type Caja = Record<string, unknown>;

function esCaja(value: unknown): value is Caja {
  return typeof value === 'object' && value !== null;
}

/** Extrae el objeto `{ code, message, details }` de cualquier forma de error. */
function extraer(error: unknown): ErrorApi | undefined {
  if (!esCaja(error)) return undefined;
  const candidato =
    (esCaja(error.data) && esCaja(error.data.error) && (error.data.error as ErrorApi)) ||
    (esCaja(error.response) &&
      esCaja(error.response.data) &&
      esCaja(error.response.data.error) &&
      (error.response.data.error as ErrorApi)) ||
    (esCaja(error.error) && (error.error as ErrorApi)) ||
    (error as ErrorApi);
  return candidato && typeof candidato === 'object' ? candidato : undefined;
}

export function codigoError(error: unknown): string | undefined {
  const e = extraer(error);
  return typeof e?.code === 'string' ? e.code : undefined;
}

export function detallesError<T>(error: unknown): T | undefined {
  const e = extraer(error);
  return e?.details as T | undefined;
}

/** Mensaje legible para avisos de pantalla y para errores de validación. */
export function mensajeError(error: unknown): string {
  if (error instanceof Error && !esCaja(error)) return error.message;
  const e = extraer(error);
  if (e?.code === 'VALIDACION' && Array.isArray(e.details)) {
    const mensajes = (e.details as { mensaje?: string }[])
      .map((d) => d.mensaje)
      .filter((m): m is string => Boolean(m));
    if (mensajes.length) return mensajes.join('. ');
  }
  if (e && typeof e.message === 'string' && e.message) return e.message;
  if (e && typeof e.status === 'number') {
    if (e.status === 0 || e.status >= 500) return 'No hay conexión con el servidor';
    return `Error ${e.status}. Intenta de nuevo.`;
  }
  return 'Algo salió mal. Intenta de nuevo.';
}

export function normalizarError(error: unknown): ErrorApi {
  const e = extraer(error);
  if (error instanceof Error) return { message: error.message, code: 'LOCAL' };
  return {
    message: mensajeError(error),
    code: e?.code ?? 'DESCONOCIDO',
    details: e?.details,
  };
}
