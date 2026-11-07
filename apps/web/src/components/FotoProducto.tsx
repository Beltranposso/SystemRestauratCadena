import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, Package, Trash2 } from 'lucide-react';
import { apiPersonal, mensajeError } from '../lib/sesion';
import { ICONOS } from './iconos';
import { cx } from './ui';

/** Foto del producto; si no hay (o no carga), el ícono de su categoría. */
export function FotoProducto({
  url,
  icono = 'package',
  className,
  tamanoIcono = 'h-7 w-7',
}: {
  url: string | null | undefined;
  icono?: string;
  className?: string;
  tamanoIcono?: string;
}) {
  const [fallo, setFallo] = useState(false);
  useEffect(() => setFallo(false), [url]);
  const Icono = ICONOS[icono] ?? Package;
  return (
    <span
      className={cx(
        'grid place-items-center overflow-hidden bg-brand-gold-soft text-brand-red-dark',
        className,
      )}
    >
      {url && !fallo ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFallo(true)}
        />
      ) : (
        <Icono className={tamanoIcono} strokeWidth={1.5} aria-hidden />
      )}
    </span>
  );
}

const LADO = 600;

/** Recorta al centro en cuadrado, reduce a 600 px y codifica en WebP (PNG si el navegador no puede). */
async function prepararFoto(archivo: File): Promise<Blob> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error('No se pudo leer la imagen'));
      i.src = url;
    });
    const lado = Math.min(img.width, img.height);
    const destino = Math.min(LADO, lado);
    const lienzo = document.createElement('canvas');
    lienzo.width = destino;
    lienzo.height = destino;
    const ctx = lienzo.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF'; // fondo para PNG con transparencia
    ctx.fillRect(0, 0, destino, destino);
    ctx.drawImage(
      img,
      (img.width - lado) / 2,
      (img.height - lado) / 2,
      lado,
      lado,
      0,
      0,
      destino,
      destino,
    );
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/webp', 0.85));
    if (!blob) throw new Error('No se pudo procesar la imagen');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Foto editable (solo admin global): clic o arrastrar para subir, y botón para quitarla.
 * Tras guardar, refresca el catálogo, los combos y los menús abiertos.
 */
export function SubirFoto({
  productoId,
  nombre,
  url,
  icono,
  className,
  onError,
}: {
  productoId: number;
  nombre: string;
  url: string | null;
  icono?: string;
  className?: string;
  onError?: (m: string) => void;
}) {
  const qc = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ['productos-sede'] });
    void qc.invalidateQueries({ queryKey: ['combos'] });
    void qc.invalidateQueries({ queryKey: ['menu'] });
  };
  const subir = useMutation({
    mutationFn: async (archivo: File) => {
      if (!/^image\/(png|jpeg|webp)$/.test(archivo.type))
        throw new Error('Usa una foto PNG, JPG o WebP');
      const blob = await prepararFoto(archivo);
      await apiPersonal.put(`/productos/${productoId}/imagen`, blob, {
        headers: { 'Content-Type': blob.type },
      });
    },
    onSuccess: refrescar,
    onError: (e) =>
      onError?.(e instanceof Error && !('isAxiosError' in e) ? e.message : mensajeError(e)),
  });
  const quitar = useMutation({
    mutationFn: () => apiPersonal.delete(`/productos/${productoId}/imagen`),
    onSuccess: refrescar,
    onError: (e) => onError?.(mensajeError(e)),
  });
  const ocupado = subir.isPending || quitar.isPending;

  return (
    <div
      className={cx('group relative shrink-0', className)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) subir.mutate(f);
      }}
    >
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={ocupado}
        title={url ? 'Cambiar foto' : 'Subir foto'}
        aria-label={url ? `Cambiar la foto de ${nombre}` : `Subir una foto de ${nombre}`}
        className="block h-full w-full overflow-hidden rounded-lg ring-1 ring-line focus-visible:ring-2"
      >
        <FotoProducto url={url} icono={icono} className="h-full w-full" tamanoIcono="h-6 w-6" />
        <span
          className={cx(
            'absolute inset-0 grid place-items-center rounded-lg bg-ink/55 text-white transition-opacity',
            ocupado ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          {ocupado ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : (
            <ImagePlus className="h-5 w-5" aria-hidden />
          )}
        </span>
      </button>
      {url && !ocupado && (
        <button
          type="button"
          onClick={() => quitar.mutate()}
          aria-label={`Quitar la foto de ${nombre}`}
          title="Quitar foto"
          className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-white p-1 text-ink-muted shadow ring-1 ring-line hover:text-danger group-hover:block"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
      <input
        ref={entrada}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) subir.mutate(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
