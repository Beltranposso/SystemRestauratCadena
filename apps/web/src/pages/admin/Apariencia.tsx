import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, ImageUp, Package, RotateCcw, Sparkles, TriangleAlert, X } from 'lucide-react';
import {
  MARCA_POR_DEFECTO,
  ajustarContraste,
  coloresDominantes,
  esHex,
  evaluarColores,
  rgbAHex,
  sugerirPaletas,
  TINTA,
  type Rgb,
  type Sugerencia,
} from '@restaurantes/shared';
import { Aviso, Boton, Campo, cx, Insignia } from '../../components/ui';
import { aplicarMarca, useMarca, variablesDe, type Marca } from '../../lib/marca';
import { apiPersonal, mensajeError } from '../../lib/sesion';

const LADO_MAX = 320;
const MAX_DATA_URL = 118_000;

/** Carga una imagen desde un archivo o data URL. */
function cargarImagen(src: string) {
  return new Promise<HTMLImageElement>((ok, mal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => mal(new Error('No se pudo leer la imagen'));
    img.src = src;
  });
}

/** Reduce el logo a 320 px (WebP; PNG si el navegador no soporta WebP) para guardarlo en la BD. */
function reducir(img: HTMLImageElement): string {
  const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.max(1, Math.round(img.width * escala));
  lienzo.height = Math.max(1, Math.round(img.height * escala));
  lienzo.getContext('2d')!.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  for (const calidad of [0.92, 0.8, 0.6]) {
    const url = lienzo.toDataURL('image/webp', calidad);
    if (url.length <= MAX_DATA_URL) return url;
  }
  throw new Error('El logo es demasiado detallado; prueba con una versión más simple');
}

/** Colores principales del logo, leyendo una miniatura de 64 px. */
function dominantesDe(img: HTMLImageElement): Rgb[] {
  const lienzo = document.createElement('canvas');
  const escala = 64 / Math.max(img.width, img.height);
  lienzo.width = Math.max(1, Math.round(img.width * escala));
  lienzo.height = Math.max(1, Math.round(img.height * escala));
  const ctx = lienzo.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  return coloresDominantes(ctx.getImageData(0, 0, lienzo.width, lienzo.height).data);
}

export default function Apariencia() {
  const guardada = useMarca((s) => s.marca);
  const [m, setM] = useState<Marca>(guardada);
  const [dominantes, setDominantes] = useState<Rgb[] | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const archivo = useRef<HTMLInputElement>(null);

  // Sugerencias del logo ya guardado al abrir la página
  useEffect(() => {
    if (guardada.logo)
      void cargarImagen(guardada.logo).then((img) => setDominantes(dominantesDe(img)));
    // Solo al entrar
  }, []);

  const sugerencias: Sugerencia[] = dominantes ? sugerirPaletas(dominantes) : [];
  const evaluacion = evaluarColores(
    esHex(m.colorPrimario) ? m.colorPrimario : '#000000',
    esHex(m.colorAcento) ? m.colorAcento : '#FFFFFF',
  );
  const cambios =
    m.nombre !== guardada.nombre ||
    m.logo !== guardada.logo ||
    m.colorPrimario.toUpperCase() !== guardada.colorPrimario.toUpperCase() ||
    m.colorAcento.toUpperCase() !== guardada.colorAcento.toUpperCase();

  async function subirLogo(f: File) {
    setError('');
    setOk('');
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type))
      return setError('Usa un PNG, JPG, WebP o SVG');
    try {
      const url = URL.createObjectURL(f);
      const img = await cargarImagen(url);
      URL.revokeObjectURL(url);
      const logo = reducir(img);
      const colores = dominantesDe(img);
      setDominantes(colores);
      const [primera] = sugerirPaletas(colores);
      setM((x) => ({
        ...x,
        logo,
        ...(primera
          ? { colorPrimario: primera.colorPrimario, colorAcento: primera.colorAcento }
          : {}),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la imagen');
    }
  }

  const guardar = useMutation({
    mutationFn: async () =>
      (
        await apiPersonal.put<Marca>('/marca', {
          nombre: m.nombre,
          logo: m.logo,
          colorPrimario: m.colorPrimario,
          colorAcento: m.colorAcento,
        })
      ).data,
    onSuccess: (r) => {
      aplicarMarca(r);
      setM(r);
      setError('');
      setOk('Listo: toda la aplicación usa la nueva apariencia, también los kioscos y pantallas.');
    },
    onError: (e) => (setOk(''), setError(mensajeError(e))),
  });
  const restablecer = useMutation({
    mutationFn: async () => (await apiPersonal.delete<Marca>('/marca')).data,
    onSuccess: (r) => {
      aplicarMarca(r);
      setM(r);
      setDominantes(null);
      setOk('Se restableció la apariencia por defecto.');
    },
    onError: (e) => setError(mensajeError(e)),
  });

  const elegida = (s: Sugerencia) =>
    s.colorPrimario === m.colorPrimario.toUpperCase() &&
    s.colorAcento === m.colorAcento.toUpperCase();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl">Apariencia</h1>
        <p className="mt-1 max-w-2xl text-ink-muted">
          Sube el logo de tu cadena y te recomendamos colores que combinan con él y se leen bien. Se
          aplican en toda la aplicación: dashboard, caja, cocina, kioscos, pantallas y portal de
          reservas.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          {/* Nombre y logo */}
          <section className="space-y-4 rounded-xl border border-line bg-white p-5">
            <Campo
              etiqueta="Nombre de la marca"
              ayuda="Aparece junto al logo y en la pestaña del navegador."
            >
              <input
                className="campo"
                maxLength={40}
                value={m.nombre}
                onChange={(e) => setM({ ...m, nombre: e.target.value })}
              />
            </Campo>
            <div>
              <span className="mb-1.5 block text-sm font-semibold">Logo</span>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) void subirLogo(f);
                }}
                className="flex flex-wrap items-center gap-4 rounded-xl border-2 border-dashed border-line p-4"
              >
                <div className="grid h-20 w-28 shrink-0 place-items-center rounded-lg bg-canvas">
                  {m.logo ? (
                    <img
                      src={m.logo}
                      alt="Logo actual"
                      className="max-h-16 max-w-24 object-contain"
                    />
                  ) : (
                    <span className="text-xs text-ink-muted">Sin logo</span>
                  )}
                </div>
                <div className="min-w-0 flex-1 text-sm text-ink-muted">
                  Arrastra aquí tu logo o elígelo. PNG, JPG, WebP o SVG; se reduce automáticamente.
                  Funciona mejor con fondo transparente.
                </div>
                <div className="flex gap-2">
                  <Boton variante="secundario" onClick={() => archivo.current?.click()}>
                    <ImageUp className="h-4 w-4" aria-hidden /> Elegir imagen
                  </Boton>
                  {m.logo && (
                    <Boton
                      variante="fantasma"
                      aria-label="Quitar logo"
                      onClick={() => (setM({ ...m, logo: null }), setDominantes(null))}
                    >
                      <X className="h-4 w-4" />
                    </Boton>
                  )}
                </div>
                <input
                  ref={archivo}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void subirLogo(f);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          </section>

          {/* Sugerencias */}
          <section className="space-y-3 rounded-xl border border-line bg-white p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand-red" aria-hidden />
              <h2 className="text-lg">Colores recomendados para tu logo</h2>
            </div>
            {dominantes === null ? (
              <p className="text-sm text-ink-muted">
                Sube un logo y aquí aparecerán combinaciones hechas con sus colores.
              </p>
            ) : (
              <>
                {dominantes.length > 0 && (
                  <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                    Colores encontrados en el logo:
                    {dominantes.map((c) => (
                      <span key={rgbAHex(c)} className="inline-flex items-center gap-1">
                        <span
                          className="h-4 w-4 rounded-full ring-1 ring-ink/10"
                          style={{ background: rgbAHex(c) }}
                        />
                        <code className="text-xs">{rgbAHex(c)}</code>
                      </span>
                    ))}
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {sugerencias.map((s) => (
                    <button
                      key={s.nombre}
                      onClick={() =>
                        setM({ ...m, colorPrimario: s.colorPrimario, colorAcento: s.colorAcento })
                      }
                      aria-pressed={elegida(s)}
                      className={cx(
                        'rounded-xl border-2 p-3 text-left transition-colors',
                        elegida(s) ? 'border-ink' : 'border-line hover:border-ink/40',
                      )}
                    >
                      <span className="flex h-12 overflow-hidden rounded-lg">
                        <span
                          className="grid flex-[2] place-items-center text-sm font-semibold text-white"
                          style={{ background: s.colorPrimario }}
                        >
                          Pedir
                        </span>
                        <span
                          className="grid flex-1 place-items-center font-display text-sm font-bold"
                          style={{ background: s.colorAcento, color: TINTA }}
                        >
                          2x1
                        </span>
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-2">
                        <span className="font-semibold">{s.nombre}</span>
                        {elegida(s) && <Check className="h-4 w-4" aria-label="Elegida" />}
                      </span>
                      <span className="block text-xs text-ink-muted">{s.descripcion}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Ajuste manual */}
          <section className="space-y-4 rounded-xl border border-line bg-white p-5">
            <h2 className="text-lg">Ajustar a mano</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectorColor
                etiqueta="Color principal"
                ayuda="Botones, barra del kiosco y acciones. Lleva texto blanco encima."
                valor={m.colorPrimario}
                contraste={evaluacion.sobrePrimario}
                onChange={(v) => setM({ ...m, colorPrimario: v })}
                corregir={() =>
                  setM({ ...m, colorPrimario: ajustarContraste(m.colorPrimario, '#FFFFFF', 4.5) })
                }
              />
              <SelectorColor
                etiqueta="Color de acento"
                ayuda="Promociones, insignias y número listo. Lleva texto oscuro encima."
                valor={m.colorAcento}
                contraste={evaluacion.sobreAcento}
                onChange={(v) => setM({ ...m, colorAcento: v })}
                corregir={() =>
                  setM({ ...m, colorAcento: ajustarContraste(m.colorAcento, TINTA, 4.5) })
                }
              />
            </div>
          </section>
        </div>

        {/* Vista previa */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <VistaPrevia m={m} />
          {error && <Aviso>{error}</Aviso>}
          {ok && !cambios && <Aviso tipo="ok">{ok}</Aviso>}
          <div className="flex flex-wrap gap-2">
            <Boton
              className="flex-1"
              tamano="lg"
              disabled={!cambios || !evaluacion.aceptable || m.nombre.trim().length < 2}
              cargando={guardar.isPending}
              onClick={() => guardar.mutate()}
            >
              Guardar y aplicar
            </Boton>
            {cambios && (
              <Boton tamano="lg" variante="secundario" onClick={() => setM(guardada)}>
                Descartar
              </Boton>
            )}
          </div>
          <button
            className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
            onClick={() => {
              if (confirm(`¿Volver a la apariencia por defecto (${MARCA_POR_DEFECTO.nombre})?`))
                restablecer.mutate();
            }}
          >
            <RotateCcw className="h-4 w-4" aria-hidden /> Restablecer apariencia por defecto
          </button>
        </aside>
      </div>
    </div>
  );
}

function SelectorColor({
  etiqueta,
  ayuda,
  valor,
  contraste,
  onChange,
  corregir,
}: {
  etiqueta: string;
  ayuda: string;
  valor: string;
  contraste: number;
  onChange: (v: string) => void;
  corregir: () => void;
}) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);
  const nivel = contraste >= 4.5 ? 'ok' : contraste >= 3 ? 'warn' : 'danger';

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-semibold">{etiqueta}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={etiqueta}
          className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-white p-1"
          value={esHex(valor) ? valor.toLowerCase() : '#000000'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
        <input
          className="campo w-28 font-mono uppercase"
          aria-label={`${etiqueta} en hexadecimal`}
          maxLength={7}
          value={texto}
          onChange={(e) => {
            const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
            setTexto(v);
            if (esHex(v)) onChange(v.toUpperCase());
          }}
        />
        <Insignia color={nivel}>
          {nivel === 'ok' ? 'Se lee bien' : nivel === 'warn' ? 'Justo' : 'Ilegible'} ·{' '}
          {contraste.toFixed(1)}:1
        </Insignia>
      </div>
      <p className="text-xs text-ink-muted">{ayuda}</p>
      {nivel !== 'ok' && (
        <button
          className="flex items-center gap-1 text-xs font-semibold text-ink underline"
          onClick={corregir}
        >
          <TriangleAlert className="h-3.5 w-3.5 text-warn" aria-hidden />
          {nivel === 'danger'
            ? 'No se puede guardar así. Ajustar al tono legible más cercano'
            : 'Mejorar contraste al tono más cercano'}
        </button>
      )}
    </div>
  );
}

/** Mini maqueta del kiosco y del dashboard con los colores aún sin guardar. */
function VistaPrevia({ m }: { m: Marca }) {
  const valido = esHex(m.colorPrimario) && esHex(m.colorAcento);
  const estilo = (valido ? variablesDe(m.colorPrimario, m.colorAcento) : {}) as CSSProperties;
  const logo = m.logo ? (
    <img src={m.logo} alt="" className="h-7 max-w-20 rounded bg-white object-contain p-0.5" />
  ) : (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
      <rect width="32" height="32" rx="7" className="fill-brand-red" />
      <path
        d="M16 6c3 5 7 7 7 13a7 7 0 0 1-14 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4 1-7 2-10z"
        className="fill-brand-gold"
      />
    </svg>
  );

  return (
    <section
      style={estilo}
      aria-label="Vista previa"
      className="overflow-hidden rounded-xl border border-line bg-white"
    >
      <p className="border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Vista previa
      </p>
      {/* Kiosco */}
      <div className="bg-canvas">
        <div className="flex items-center justify-between bg-brand-red px-3 py-2 text-white">
          <span className="flex items-center gap-2">
            {logo}
            <span className="cifra-ancha text-base">{m.nombre || 'Tu marca'}</span>
          </span>
          <span className="text-xs">Kiosco</span>
        </div>
        <div className="grid grid-cols-[56px_1fr] gap-2 p-2">
          <div className="space-y-1">
            <div className="rounded-md bg-brand-gold px-1 py-2 text-center text-[10px] font-semibold text-ink">
              Promos
            </div>
            <div className="rounded-md bg-brand-red px-1 py-2 text-center text-[10px] font-semibold text-white">
              Combos
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Combo Clásico', '$ 26.700', 'Precio especial'],
              ['Nuggets x10', '$ 19.300', '3x2'],
            ].map(([n, p, e]) => (
              <div key={n} className="rounded-lg border-2 border-brand-red bg-white p-2">
                <div className="relative grid h-12 place-items-center rounded bg-brand-gold-soft text-brand-red-dark">
                  <Package className="h-6 w-6" strokeWidth={1.5} aria-hidden />
                  <span className="absolute left-0 top-1 rounded-r bg-brand-red px-1 text-[9px] font-bold uppercase text-white">
                    {e}
                  </span>
                </div>
                <p className="mt-1 text-xs font-semibold">{n}</p>
                <p className="font-display text-sm font-bold text-brand-red">{p}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="px-2 pb-3">
          <div className="rounded-lg bg-brand-red py-2.5 text-center text-sm font-semibold text-white">
            Pagar y pedir
          </div>
        </div>
      </div>
      {/* Pantalla de pedidos */}
      <div className="flex items-center justify-between gap-3 bg-ink px-4 py-3">
        <span className="text-xs text-white/70">Pantalla de pedidos</span>
        <span className="cifra text-3xl text-brand-gold">A-042</span>
      </div>
      {/* Dashboard */}
      <div className="flex flex-wrap items-center gap-2 p-3">
        <span className="rounded-lg bg-brand-red px-3 py-1.5 text-xs font-semibold text-white">
          Guardar
        </span>
        <span className="rounded-lg bg-brand-gold px-3 py-1.5 text-xs font-semibold text-ink">
          Listo
        </span>
        <span className="rounded-md bg-brand-gold-soft px-2 py-0.5 text-xs font-semibold">
          Promoción
        </span>
        <span className="h-2 flex-1 rounded-full bg-brand-red/20">
          <span className="block h-2 w-2/3 rounded-full bg-brand-red" />
        </span>
      </div>
    </section>
  );
}
