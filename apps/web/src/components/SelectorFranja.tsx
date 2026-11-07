import { useQuery } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { apiPublica } from '../lib/sesion';
import { diaSemana, hoyEn, sumarDias } from '../lib/formato';
import type { Franja } from '../lib/tipos';
import { Cargando, cx } from './ui';

/** Personas, día y hora con disponibilidad real. Lo usan "Reservar" y "Cambiar reserva". */
export function SelectorFranja({
  sedeId,
  zona,
  valor,
  onChange,
}: {
  sedeId: number;
  zona: string;
  valor: { fecha: string; hora: string; personas: number };
  onChange: (v: { fecha: string; hora: string; personas: number }) => void;
}) {
  const hoy = hoyEn(zona);
  const dias = Array.from({ length: 14 }, (_, i) => sumarDias(hoy, i));
  const disp = useQuery({
    queryKey: ['disponibilidad', sedeId, valor.fecha, valor.personas],
    queryFn: async () =>
      (
        await apiPublica.get<{ franjas: Franja[] }>(
          `/sedes/${sedeId}/disponibilidad?fecha=${valor.fecha}&personas=${valor.personas}`,
        )
      ).data.franjas,
  });
  const franjas = (disp.data ?? []).filter((f) => new Date(f.inicio) > new Date()); // las horas que ya pasaron no se muestran

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 font-semibold">Personas</legend>
        <div className="inline-flex items-center rounded-xl border border-line bg-white">
          <button
            type="button"
            className="p-3 hover:bg-canvas disabled:opacity-40"
            disabled={valor.personas <= 1}
            onClick={() => onChange({ ...valor, personas: valor.personas - 1, hora: '' })}
            aria-label="Una persona menos"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="cifra w-12 text-center text-3xl">{valor.personas}</span>
          <button
            type="button"
            className="p-3 hover:bg-canvas disabled:opacity-40"
            disabled={valor.personas >= 12}
            onClick={() => onChange({ ...valor, personas: valor.personas + 1, hora: '' })}
            aria-label="Una persona más"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-semibold">Día</legend>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {dias.map((d, i) => (
            <button
              type="button"
              key={d}
              aria-pressed={valor.fecha === d}
              onClick={() => onChange({ ...valor, fecha: d, hora: '' })}
              className={cx(
                'flex w-16 shrink-0 flex-col items-center rounded-xl border-2 py-2 text-sm first-letter:uppercase',
                valor.fecha === d
                  ? 'border-ink bg-ink text-white'
                  : 'border-line bg-white hover:border-ink/40',
              )}
            >
              <span className={valor.fecha === d ? 'text-white/70' : 'text-ink-muted'}>
                {i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : diaSemana(d)}
              </span>
              <span className="cifra text-2xl leading-tight">{Number(d.slice(8))}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-semibold">Hora</legend>
        {disp.isLoading ? (
          <Cargando />
        ) : franjas.length === 0 ? (
          <p className="text-ink-muted">Ya no quedan horas para este día. Prueba con otro.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {franjas.map((f) => (
              <button
                type="button"
                key={f.hora}
                disabled={!f.disponible}
                aria-pressed={valor.hora === f.hora}
                onClick={() => onChange({ ...valor, hora: f.hora })}
                className={cx(
                  'rounded-lg border-2 py-2 text-center font-semibold tabular-nums transition-colors',
                  valor.hora === f.hora
                    ? 'border-brand-red bg-brand-red text-white'
                    : 'border-line bg-white hover:border-brand-red',
                  !f.disponible &&
                    'cursor-not-allowed border-transparent bg-canvas text-ink-muted/50 line-through hover:border-transparent',
                )}
              >
                {f.hora}
              </button>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  );
}
