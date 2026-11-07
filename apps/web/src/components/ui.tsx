import { clsx } from 'clsx';
import { Loader2, X } from 'lucide-react';
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useMarca } from '../lib/marca';

export const cx = clsx;

// ───────────────────────────── Botones ─────────────────────────────

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro' | 'oro';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-brand-red text-white hover:bg-brand-red-dark active:bg-brand-red-dark',
  secundario: 'border border-line bg-white text-ink hover:border-ink/40',
  fantasma: 'text-ink hover:bg-ink/5',
  peligro: 'border border-danger/30 bg-white text-danger hover:bg-danger/5',
  oro: 'bg-brand-gold text-ink hover:brightness-95',
};

export function Boton({
  variante = 'primario',
  tamano = 'md',
  cargando,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  tamano?: 'sm' | 'md' | 'lg';
  cargando?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled || cargando}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        tamano === 'sm' && 'h-8 px-3 text-sm',
        tamano === 'md' && 'h-10 px-4',
        tamano === 'lg' && 'h-14 px-6 text-lg',
        VARIANTES[variante],
        className,
      )}
    >
      {cargando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

// ───────────────────────────── Formularios ─────────────────────────────

export function Campo({
  etiqueta,
  ayuda,
  error,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-ink">{etiqueta}</span>
      {children}
      {ayuda && !error && <span className="block text-xs text-ink-muted">{ayuda}</span>}
      {error && <span className="block text-xs font-medium text-danger">{error}</span>}
    </label>
  );
}

export function Interruptor({
  activo,
  onChange,
  etiqueta,
  disabled,
}: {
  activo: boolean;
  onChange: (v: boolean) => void;
  etiqueta: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={() => onChange(!activo)}
      className={cx(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50',
        activo ? 'bg-ok' : 'bg-line',
      )}
    >
      <span
        className={cx(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
          activo ? 'left-[22px]' : 'left-0.5',
        )}
      />
    </button>
  );
}

// ───────────────────────────── Estados ─────────────────────────────

export function Cargando({
  texto = 'Cargando…',
  className,
}: {
  texto?: string;
  className?: string;
}) {
  return (
    <div
      className={cx('flex items-center justify-center gap-2 py-10 text-ink-muted', className)}
      role="status"
    >
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      {texto}
    </div>
  );
}

export function Vacio({
  titulo,
  texto,
  accion,
}: {
  titulo: string;
  texto?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-semibold">{titulo}</p>
      {texto && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">{texto}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}

export function Aviso({
  tipo = 'error',
  children,
}: {
  tipo?: 'error' | 'ok' | 'info';
  children: ReactNode;
}) {
  return (
    <div
      role={tipo === 'error' ? 'alert' : 'status'}
      className={cx(
        'rounded-lg border px-3 py-2 text-sm',
        tipo === 'error' && 'border-danger/30 bg-danger/5 text-danger',
        tipo === 'ok' && 'border-ok/30 bg-ok/10 text-ok',
        tipo === 'info' && 'border-line bg-white text-ink-muted',
      )}
    >
      {children}
    </div>
  );
}

export function Insignia({
  color = 'neutro',
  children,
  className,
}: {
  color?: 'neutro' | 'ok' | 'warn' | 'danger' | 'oro' | 'rojo' | 'tinta';
  children: ReactNode;
  className?: string;
}) {
  const colores = {
    neutro: 'bg-ink/5 text-ink-muted',
    ok: 'bg-ok/10 text-ok',
    warn: 'bg-warn/15 text-[#9a5a06]',
    danger: 'bg-danger/10 text-danger',
    oro: 'bg-brand-gold-soft text-ink',
    rojo: 'bg-brand-red text-white',
    tinta: 'bg-ink text-white',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold',
        colores[color],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Pastilla que indica si llegan datos en vivo. */
export function EnVivo({ conectado, claro }: { conectado: boolean; claro?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        claro ? 'text-white/70' : 'text-ink-muted',
      )}
    >
      <span className={cx('h-2 w-2 rounded-full', conectado ? 'bg-ok' : 'bg-warn')} />
      {conectado ? 'En vivo' : 'Reconectando…'}
    </span>
  );
}

// ───────────────────────────── Modal ─────────────────────────────

export function Modal({
  abierto,
  onCerrar,
  titulo,
  children,
  ancho = 'md',
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  children: ReactNode;
  ancho?: 'md' | 'lg';
}) {
  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [abierto, onCerrar]);

  if (!abierto) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4"
      onMouseDown={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onMouseDown={(e) => e.stopPropagation()}
        className={cx(
          'max-h-[92vh] w-full animate-entra overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl',
          ancho === 'md' ? 'sm:max-w-md' : 'sm:max-w-2xl',
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-xl">{titulo}</h2>
          <button
            onClick={onCerrar}
            className="-m-1 rounded-lg p-1 text-ink-muted hover:bg-ink/5"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ───────────────────────────── Selector segmentado ─────────────────────────────

export function Segmentos<T extends string>({
  opciones,
  valor,
  onChange,
  etiqueta,
}: {
  opciones: { valor: T; texto: string }[];
  valor: T;
  onChange: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={etiqueta}
      className="inline-flex rounded-lg border border-line bg-white p-0.5"
    >
      {opciones.map((o) => (
        <button
          key={o.valor}
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={cx(
            'rounded-md px-3 py-1.5 text-sm font-semibold transition-colors',
            valor === o.valor ? 'bg-ink text-white' : 'text-ink-muted hover:text-ink',
          )}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

/** Marca de la cadena: el logo que subió el admin o, si no hay, la llama sobre el color primario. */
export function Marca({ claro, compacta }: { claro?: boolean; compacta?: boolean }) {
  const marca = useMarca((s) => s.marca);
  return (
    <span className="inline-flex items-center gap-2">
      {marca.logo ? (
        <img
          src={marca.logo}
          alt=""
          className={cx(
            'h-8 max-w-24 shrink-0 object-contain',
            claro && 'rounded-md bg-white p-0.5',
          )}
        />
      ) : (
        <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
          <rect width="32" height="32" rx="7" className="fill-brand-red" />
          <path
            d="M16 6c3 5 7 7 7 13a7 7 0 0 1-14 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4 1-7 2-10z"
            className="fill-brand-gold"
          />
        </svg>
      )}
      {!compacta && (
        <span className={cx('cifra-ancha text-xl leading-none', claro ? 'text-white' : 'text-ink')}>
          {marca.nombre}
        </span>
      )}
    </span>
  );
}
