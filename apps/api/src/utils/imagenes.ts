import { createHash } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';
import { HttpError } from './http-error';

/**
 * Fotos subidas por el admin. Se guardan en disco (UPLOADS_DIR) y se sirven en /uploads.
 * Para producción con varios servidores, basta con reemplazar guardar/borrar por un
 * almacenamiento en la nube (S3, Cloudinary): el resto del sistema solo guarda la URL.
 */
export const DIR_UPLOADS = path.resolve(env.UPLOADS_DIR);
export const MAX_IMAGEN_BYTES = 2 * 1024 * 1024;
export const TIPOS_IMAGEN = ['image/webp', 'image/png', 'image/jpeg'];

/** Tipo real según la firma del archivo (no se confía en el Content-Type). */
export function tipoImagen(b: Buffer): 'webp' | 'png' | 'jpg' | null {
  if (
    b.length > 12 &&
    b.toString('ascii', 0, 4) === 'RIFF' &&
    b.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'webp';
  if (
    b.length > 8 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  return null;
}

/** Guarda la imagen y devuelve su URL pública (/uploads/<carpeta>/<prefijo>-<hash>.<ext>). */
export async function guardarImagen(carpeta: string, prefijo: string, datos: unknown) {
  if (!Buffer.isBuffer(datos) || datos.length === 0)
    throw new HttpError(
      415,
      'IMAGEN_INVALIDA',
      'Envía la imagen como WebP, PNG o JPG en el cuerpo',
    );
  const ext = tipoImagen(datos);
  if (!ext)
    throw new HttpError(415, 'IMAGEN_INVALIDA', 'El archivo no es una imagen WebP, PNG o JPG');
  const hash = createHash('sha256').update(datos).digest('hex').slice(0, 12);
  const nombre = `${prefijo}-${hash}.${ext}`;
  await mkdir(path.join(DIR_UPLOADS, carpeta), { recursive: true });
  await writeFile(path.join(DIR_UPLOADS, carpeta, nombre), datos);
  return `/uploads/${carpeta}/${nombre}`;
}

/** Borra una imagen subida antes (ignora URLs externas o que ya no existan). */
export async function borrarImagen(url: string | null | undefined) {
  if (!url?.startsWith('/uploads/')) return;
  const ruta = path.resolve(DIR_UPLOADS, url.slice('/uploads/'.length));
  if (!ruta.startsWith(DIR_UPLOADS + path.sep)) return; // nunca fuera de la carpeta
  await unlink(ruta).catch(() => undefined);
}
