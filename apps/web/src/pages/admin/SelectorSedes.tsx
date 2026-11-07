import { useMemo } from 'react';
import { cx } from '../../components/ui';
import type { Sede } from '../../lib/tipos';

/**
 * Elegir varias sedes agrupadas por país y ciudad, con atajos "todo el país" y "toda la ciudad".
 * `extra` permite dibujar algo junto a cada sede elegida (p. ej. su precio).
 */
export function SelectorSedes({
  sedes,
  elegidas,
  onChange,
  extra,
}: {
  sedes: Sede[];
  elegidas: number[];
  onChange: (ids: number[]) => void;
  extra?: (sede: Sede) => React.ReactNode;
}) {
  const arbol = useMemo(() => {
    const paises = new Map<string, Map<string, Sede[]>>();
    for (const s of sedes) {
      const p = s.ciudad.pais.nombre;
      if (!paises.has(p)) paises.set(p, new Map());
      const c = paises.get(p)!;
      c.set(s.ciudad.nombre, [...(c.get(s.ciudad.nombre) ?? []), s]);
    }
    return [...paises].map(([pais, ciudades]) => ({ pais, ciudades: [...ciudades] }));
  }, [sedes]);

  const set = new Set(elegidas);
  const alternar = (ids: number[], todas: boolean) => {
    const nuevo = new Set(elegidas);
    for (const id of ids) {
      if (todas) nuevo.delete(id);
      else nuevo.add(id);
    }
    onChange([...nuevo]);
  };

  return (
    <div className="space-y-3">
      {arbol.map(({ pais, ciudades }) => {
        const ids = ciudades.flatMap(([, ss]) => ss.map((s) => s.id));
        const todas = ids.every((id) => set.has(id));
        return (
          <div key={pais} className="rounded-xl border border-line">
            <div className="flex items-center justify-between border-b border-line bg-canvas/60 px-3 py-2">
              <span className="font-semibold">{pais}</span>
              <button
                type="button"
                onClick={() => alternar(ids, todas)}
                className="text-sm font-semibold text-brand-red hover:underline"
              >
                {todas ? 'Quitar todas' : 'Todas las sedes'}
              </button>
            </div>
            <div className="divide-y divide-line">
              {ciudades.map(([ciudad, lista]) => {
                const idsCiudad = lista.map((s) => s.id);
                const todaCiudad = idsCiudad.every((id) => set.has(id));
                return (
                  <div key={ciudad} className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => alternar(idsCiudad, todaCiudad)}
                      className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted hover:text-ink"
                      title={todaCiudad ? 'Quitar la ciudad' : 'Elegir toda la ciudad'}
                    >
                      {ciudad}
                    </button>
                    <ul className="space-y-1">
                      {lista.map((s) => {
                        const activa = set.has(s.id);
                        return (
                          <li key={s.id} className="flex flex-wrap items-center gap-2">
                            <label
                              className={cx(
                                'flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm',
                                !activa && 'text-ink-muted',
                              )}
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-brand-red"
                                checked={activa}
                                onChange={() => alternar([s.id], activa)}
                              />
                              <span className="truncate">
                                {s.nombre} <span className="text-ink-muted">({s.codigo})</span>
                              </span>
                            </label>
                            {activa && extra?.(s)}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
