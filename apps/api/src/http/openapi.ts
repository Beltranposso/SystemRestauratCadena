import { z, type ZodType } from 'zod';
import { registroRutas, type TipoAuth } from './ruta';

type JsonSchema = Record<string, unknown>;

/** Esquema JSON (OpenAPI 3.0) del lado de entrada: lo que el cliente envía, antes de transformar. */
const aJson = (esquema: ZodType): JsonSchema => {
  const { $schema: _s, ...json } = z.toJSONSchema(esquema, {
    target: 'openapi-3.0',
    io: 'input',
    unrepresentable: 'any',
  }) as JsonSchema;
  return json;
};

const SEGURIDAD: Record<TipoAuth, Record<string, string[]>[] | undefined> = {
  publico: undefined,
  personal: [{ bearer: [] }],
  cliente: [{ bearer: [] }],
  dispositivo: [{ dispositivo: [] }],
  'personal-o-dispositivo': [{ bearer: [] }, { dispositivo: [] }],
  'cliente-opcional': [{}, { bearer: [] }],
};

const DESCRIPCION_AUTH: Record<TipoAuth, string> = {
  publico: 'Público',
  personal: 'Personal (JWT)',
  cliente: 'Cliente del portal (JWT)',
  dispositivo: 'Dispositivo de sede (X-Device-Token)',
  'personal-o-dispositivo': 'Personal (JWT) o dispositivo de la sede (X-Device-Token)',
  'cliente-opcional': 'Público; si llega un JWT de cliente se vincula a su cuenta',
};

function parametros(esquema: ZodType | undefined, ubicacion: 'path' | 'query') {
  if (!esquema) return [];
  const json = aJson(esquema);
  const props = (json.properties ?? {}) as Record<string, JsonSchema>;
  const requeridos = new Set((json.required as string[] | undefined) ?? []);
  return Object.entries(props).map(([nombre, schema]) => ({
    name: nombre,
    in: ubicacion,
    required: ubicacion === 'path' || requeridos.has(nombre),
    description: schema.description,
    schema,
  }));
}

/** Construye el documento OpenAPI 3 a partir de las rutas registradas. */
export function generarOpenApi() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const { etiqueta, def } of registroRutas) {
    const ruta = def.ruta.replace(/:(\w+)/g, '{$1}');
    const roles = def.roles?.length ? `\n\n**Roles:** ${def.roles.join(', ')}` : '';
    paths[`/api${ruta}`] ??= {};
    paths[`/api${ruta}`]![def.metodo] = {
      tags: [etiqueta],
      summary: def.resumen,
      description: `**Acceso:** ${DESCRIPCION_AUTH[def.auth]}${roles}${def.descripcion ? `\n\n${def.descripcion}` : ''}`,
      security: SEGURIDAD[def.auth] ?? [],
      parameters: [...parametros(def.params, 'path'), ...parametros(def.query, 'query')],
      ...(def.body
        ? {
            requestBody: {
              required: true,
              content: { 'application/json': { schema: aJson(def.body) } },
            },
          }
        : {}),
      responses: {
        [String(def.status ?? 200)]: { description: 'OK' },
        ...(def.auth !== 'publico'
          ? {
              '401': { description: 'Sin sesión o token inválido' },
              '403': { description: 'Fuera de tu rol o alcance' },
            }
          : {}),
        '400': { description: 'Validación: { error: { code, message, details } }' },
      },
    };
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'API — Sistema Multi-Sede de Restaurantes',
      version: '0.2.0',
      description:
        'Los errores siempre tienen la forma `{ "error": { "code", "message", "details?" } }`. ' +
        'Los montos se envían como texto decimal (p. ej. "29600.00") en la moneda local de la sede. ' +
        'Las fechas-hora van en ISO 8601 UTC; los campos `fecha` y `hora` son locales de la sede.',
    },
    servers: [{ url: '/' }],
    components: {
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        dispositivo: { type: 'apiKey', in: 'header', name: 'X-Device-Token' },
      },
    },
    paths,
  };
}
