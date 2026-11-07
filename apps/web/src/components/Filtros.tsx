import { useMemo } from 'react';
import { useFiltros, useSedes, useSedeTrabajo } from '../lib/consultas';
import { hoyEn, sumarDias } from '../lib/formato';
import { cx } from './ui';

const RANGOS = [
  { dias: 7, texto: '7 días' },
  { dias: 30, texto: '30 días' },
  { dias: 90, texto: '90 días' },
];

/**
 * Filtros globales del dashboard: país → ciudad → sede en cascada y rango de fechas.
 * Solo muestra las opciones dentro del alcance del usuario.
 */
export function BarraFiltros() {
  const { filtros, cambiar } = useFiltros();
  const { data: sedes = [] } = useSedes();

  const paises = useMemo(() => {
    const m = new Map<number, string>();
    sedes.forEach((s) => m.set(s.ciudad.pais.id, s.ciudad.pais.nombre));
    return [...m];
  }, [sedes]);
  const ciudades = useMemo(() => {
    const m = new Map<number, string>();
    sedes
      .filter((s) => !filtros.paisId || s.ciudad.paisId === filtros.paisId)
      .forEach((s) => m.set(s.ciudad.id, s.ciudad.nombre));
    return [...m];
  }, [sedes, filtros.paisId]);
  const sedesFiltradas = sedes.filter(
    (s) =>
      (!filtros.paisId || s.ciudad.paisId === filtros.paisId) &&
      (!filtros.ciudadId || s.ciudadId === filtros.ciudadId),
  );

  const hoy = hoyEn('America/Bogota');
  const rangoActivo =
    filtros.hasta === hoy
      ? RANGOS.find((r) => sumarDias(hoy, -(r.dias - 1)) === filtros.desde)?.dias
      : undefined;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white p-3">
      {paises.length > 1 && (
        <Selector
          etiqueta="País"
          valor={filtros.paisId}
          opciones={paises}
          todos="Todos los países"
          onChange={(v) => cambiar({ paisId: v, ciudadId: undefined, sedeId: undefined })}
        />
      )}
      {ciudades.length > 1 && (
        <Selector
          etiqueta="Ciudad"
          valor={filtros.ciudadId}
          opciones={ciudades}
          todos="Todas las ciudades"
          onChange={(v) => cambiar({ ciudadId: v, sedeId: undefined })}
        />
      )}
      {sedesFiltradas.length > 1 && (
        <Selector
          etiqueta="Sede"
          valor={filtros.sedeId}
          opciones={sedesFiltradas.map((s) => [s.id, s.nombre])}
          todos="Todas las sedes"
          onChange={(v) => cambiar({ sedeId: v })}
        />
      )}

      <div className="ml-auto flex flex-wrap items-end gap-2">
        <div
          className="inline-flex rounded-lg border border-line p-0.5"
          role="group"
          aria-label="Rango rápido"
        >
          {RANGOS.map((r) => (
            <button
              key={r.dias}
              onClick={() => cambiar({ desde: sumarDias(hoy, -(r.dias - 1)), hasta: hoy })}
              aria-pressed={rangoActivo === r.dias}
              className={cx(
                'rounded-md px-2.5 py-1.5 text-sm font-semibold',
                rangoActivo === r.dias ? 'bg-ink text-white' : 'text-ink-muted hover:text-ink',
              )}
            >
              {r.texto}
            </button>
          ))}
        </div>
        <label className="text-xs text-ink-muted">
          <span className="sr-only">Desde</span>
          <input
            type="date"
            className="campo h-9 py-1 text-sm"
            value={filtros.desde}
            max={filtros.hasta}
            onChange={(e) => cambiar({ desde: e.target.value })}
          />
        </label>
        <span className="pb-2 text-ink-muted">a</span>
        <label className="text-xs text-ink-muted">
          <span className="sr-only">Hasta</span>
          <input
            type="date"
            className="campo h-9 py-1 text-sm"
            value={filtros.hasta}
            min={filtros.desde}
            max={hoy}
            onChange={(e) => cambiar({ hasta: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}

function Selector({
  etiqueta,
  valor,
  opciones,
  todos,
  onChange,
}: {
  etiqueta: string;
  valor?: number;
  opciones: [number, string][];
  todos: string;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink-muted">{etiqueta}</span>
      <select
        className="campo h-9 min-w-40 py-1 text-sm"
        value={valor ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
      >
        <option value="">{todos}</option>
        {opciones.map(([id, nombre]) => (
          <option key={id} value={id}>
            {nombre}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Selector de una sola sede para pantallas operativas (mesas, turnos, menú, caja, cocina). */
export function SelectorSede({ oscuro }: { oscuro?: boolean }) {
  const { sedeId, sedes, elegir, puedeElegir, sede } = useSedeTrabajo();
  if (!puedeElegir)
    return sede ? (
      <span className={cx('font-semibold', oscuro && 'text-white')}>{sede.nombre}</span>
    ) : null;
  return (
    <label className="inline-flex items-center gap-2">
      <span className="sr-only">Sede</span>
      <select
        className={cx(
          'campo h-9 w-auto py-1 text-sm font-semibold',
          oscuro && 'border-white/20 bg-ink-soft text-white',
        )}
        value={sedeId ?? ''}
        onChange={(e) => elegir(Number(e.target.value))}
      >
        {sedes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}
