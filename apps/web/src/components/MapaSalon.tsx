import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { Users } from 'lucide-react';
import type { EstadoMesa } from '@restaurantes/shared';
import type { Mesa } from '../lib/tipos';
import { cx } from './ui';

export const ESTILO_MESA: Record<EstadoMesa, { caja: string; texto: string; nombre: string }> = {
  LIBRE: { caja: 'bg-white border-2 border-ok', texto: 'text-ink', nombre: 'Libre' },
  OCUPADA: {
    caja: 'bg-brand-red border-2 border-brand-red-dark',
    texto: 'text-white',
    nombre: 'Ocupada',
  },
  RESERVADA: {
    caja: 'bg-brand-gold border-2 border-[#d99a00]',
    texto: 'text-ink',
    nombre: 'Reservada',
  },
  LIMPIEZA: {
    caja: 'border-2 border-warn bg-[repeating-linear-gradient(135deg,#fff_0_6px,#fdecd4_6px_12px)]',
    texto: 'text-ink',
    nombre: 'Limpieza',
  },
  FUERA_SERVICIO: {
    caja: 'border-2 border-dashed border-ink/30 bg-canvas',
    texto: 'text-ink-muted',
    nombre: 'Fuera de servicio',
  },
};

export type Posiciones = Record<number, { posX: number; posY: number }>;

interface Props {
  mesas: Mesa[];
  lienzo: { ancho: number; alto: number };
  seleccionada?: number;
  onSeleccionar?: (id: number) => void;
  /** Modo edición: las mesas se arrastran y se informan las posiciones nuevas */
  editando?: boolean;
  posiciones?: Posiciones;
  onMover?: (id: number, pos: { posX: number; posY: number }) => void;
}

const REJILLA = 10;

/**
 * Plano del salón a escala: el lienzo de 1000 × 700 de la API se dibuja en porcentaje,
 * así se adapta al ancho de la pantalla sin perder proporciones.
 */
export function MapaSalon({
  mesas,
  lienzo,
  seleccionada,
  onSeleccionar,
  editando,
  posiciones = {},
  onMover,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [arrastre, setArrastre] = useState<{ id: number; dx: number; dy: number } | null>(null);

  const pos = (m: Mesa) => posiciones[m.id] ?? { posX: m.posX, posY: m.posY };

  // Etiqueta de cada zona sobre la mesa más alta-izquierda de esa zona
  const zonas = useMemo(() => {
    const z = new Map<string, { x: number; y: number }>();
    for (const m of mesas) {
      const p = posiciones[m.id] ?? m;
      const actual = z.get(m.zona);
      if (!actual || p.posY < actual.y || (p.posY === actual.y && p.posX < actual.x))
        z.set(m.zona, { x: p.posX, y: p.posY });
    }
    return [...z];
  }, [mesas, posiciones]);

  const aLienzo = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * lienzo.ancho,
      y: ((e.clientY - r.top) / r.height) * lienzo.alto,
    };
  };

  const iniciar = (e: PointerEvent<HTMLButtonElement>, m: Mesa) => {
    if (!editando) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = aLienzo(e);
    const actual = pos(m);
    setArrastre({ id: m.id, dx: p.x - actual.posX, dy: p.y - actual.posY });
  };

  const mover = (e: PointerEvent<HTMLButtonElement>, m: Mesa) => {
    if (!arrastre || arrastre.id !== m.id) return;
    const p = aLienzo(e);
    const posX =
      Math.round(Math.min(lienzo.ancho - m.ancho, Math.max(0, p.x - arrastre.dx)) / REJILLA) *
      REJILLA;
    const posY =
      Math.round(Math.min(lienzo.alto - m.alto, Math.max(0, p.y - arrastre.dy)) / REJILLA) *
      REJILLA;
    onMover?.(m.id, { posX, posY });
  };

  return (
    <div
      ref={ref}
      className={cx(
        'relative w-full overflow-hidden rounded-xl border border-line',
        editando
          ? 'bg-[radial-gradient(circle,#d8d1c9_1px,transparent_1px)] [background-size:2%_2.857%]'
          : 'bg-white',
      )}
      style={{ aspectRatio: `${lienzo.ancho} / ${lienzo.alto}` }}
    >
      {zonas.map(([zona, p]) => (
        <span
          key={zona}
          className="pointer-events-none absolute text-xs font-semibold text-ink-muted"
          style={{
            left: `${(p.x / lienzo.ancho) * 100}%`,
            top: `${(Math.max(0, p.y - 30) / lienzo.alto) * 100}%`,
          }}
        >
          {zona}
        </span>
      ))}

      {mesas.map((m) => {
        const p = pos(m);
        const estilo = ESTILO_MESA[m.estado];
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => !editando && onSeleccionar?.(m.id)}
            onPointerDown={(e) => iniciar(e, m)}
            onPointerMove={(e) => mover(e, m)}
            onPointerUp={() => setArrastre(null)}
            aria-label={`Mesa ${m.codigo}, ${m.capacidad} personas, ${estilo.nombre}`}
            aria-pressed={seleccionada === m.id}
            className={cx(
              'absolute flex flex-col items-center justify-center overflow-hidden transition-shadow',
              m.forma === 'REDONDA' ? 'rounded-full' : 'rounded-xl',
              estilo.caja,
              estilo.texto,
              !m.activa && 'opacity-40',
              seleccionada === m.id && 'ring-4 ring-ink ring-offset-2',
              editando ? 'cursor-grab touch-none active:cursor-grabbing' : 'hover:shadow-lg',
              arrastre?.id === m.id && 'z-10 shadow-xl',
            )}
            style={{
              left: `${(p.posX / lienzo.ancho) * 100}%`,
              top: `${(p.posY / lienzo.alto) * 100}%`,
              width: `${(m.ancho / lienzo.ancho) * 100}%`,
              height: `${(m.alto / lienzo.alto) * 100}%`,
              containerType: 'size',
            }}
          >
            <span className="cifra leading-none" style={{ fontSize: 'min(26cqw, 26cqh)' }}>
              {m.codigo}
            </span>
            <span
              className="mt-0.5 flex items-center gap-0.5 font-medium opacity-80"
              style={{ fontSize: 'min(12cqw, 13cqh)' }}
            >
              <Users className="h-[1em] w-[1em]" aria-hidden />
              {m.sesionActual ? `${m.sesionActual.personas}/${m.capacidad}` : m.capacidad}
            </span>
            {!editando && m.estado === 'OCUPADA' && m.sesionActual && (
              <span className="opacity-80" style={{ fontSize: 'min(11cqw, 12cqh)' }}>
                {m.sesionActual.minutos} min
              </span>
            )}
            {!editando && m.estado !== 'OCUPADA' && m.proximaReserva && (
              <span className="font-semibold" style={{ fontSize: 'min(11cqw, 12cqh)' }}>
                {m.proximaReserva.hora}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function LeyendaMesas() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
      {(Object.keys(ESTILO_MESA) as EstadoMesa[]).map((e) => (
        <li key={e} className="flex items-center gap-1.5">
          <span className={cx('h-3 w-3 rounded-sm', ESTILO_MESA[e].caja)} />
          {ESTILO_MESA[e].nombre}
        </li>
      ))}
    </ul>
  );
}
