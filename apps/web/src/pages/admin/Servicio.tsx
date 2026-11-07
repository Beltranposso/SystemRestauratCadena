import { useConfiguracion } from '../../lib/configuracion';
import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { BarraFiltros } from '../../components/Filtros';
import { Barras, Panel, Ranking } from '../../components/Graficas';
import { Aviso, Cargando, cx } from '../../components/ui';
import { useFiltros } from '../../lib/consultas';
import { diaCorto, entero, minutos, porcentaje } from '../../lib/formato';
import { apiPersonal, mensajeError } from '../../lib/sesion';
import type { Ocupacion, ReporteCalificaciones } from '../../lib/tipos';

export default function Servicio() {
  const reservasActivas = useConfiguracion((c) => c.reservasHabilitadas);
  const { query } = useFiltros();
  const porHora = useQuery({
    queryKey: ['ocupacion', 'hora', query],
    queryFn: async () =>
      (await apiPersonal.get<Ocupacion>(`/reportes/ocupacion?agrupar=hora&${query}`)).data,
  });
  const porSede = useQuery({
    queryKey: ['ocupacion', 'sede', query],
    queryFn: async () =>
      (await apiPersonal.get<Ocupacion>(`/reportes/ocupacion?agrupar=sede&${query}`)).data,
  });
  const calif = useQuery({
    queryKey: ['calificaciones', query],
    queryFn: async () =>
      (await apiPersonal.get<ReporteCalificaciones>(`/reportes/calificaciones?${query}`)).data,
  });

  const r = porSede.data?.resumen;
  const maxDistribucion = Math.max(1, ...(calif.data?.distribucion.map((d) => d.total) ?? [1]));

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header>
        <h1 className="text-3xl">Ocupación y servicio</h1>
        <p className="text-ink-muted">
          Cuánto se usan las mesas, cuánto esperan los clientes y qué opinan.
        </p>
      </header>

      <BarraFiltros />
      {porSede.isError && <Aviso>{mensajeError(porSede.error)}</Aviso>}

      {r && (
        <section
          aria-label="Indicadores del salón"
          className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-white sm:grid-cols-3 lg:grid-cols-6"
        >
          <Dato
            titulo="Ocupación"
            valor={porcentaje(r.ocupacionPct, 0)}
            nota={`${entero(r.mesas)} mesas`}
            destacado
          />
          <Dato
            titulo="Rotación"
            valor={r.rotacion?.toLocaleString('es-CO') ?? '—'}
            nota="veces por mesa al día"
          />
          <Dato
            titulo="Espera en fila"
            valor={minutos(r.esperaPromedioMin)}
            nota="promedio hasta sentarse"
          />
          <Dato titulo="Se van de la fila" valor={porcentaje(r.abandonoColaPct)} />
          {reservasActivas && (
            <>
              <Dato
                titulo="Reservas canceladas"
                valor={porcentaje(r.cancelacionPct)}
                nota={`de ${entero(r.reservas)}`}
              />
              <Dato titulo="No llegaron" valor={porcentaje(r.noShowPct)} />
            </>
          )}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <Panel titulo="Ocupación por hora">
          {porHora.isLoading ? (
            <Cargando />
          ) : (
            <Barras
              datos={porHora.data?.datos ?? []}
              x="clave"
              y="ocupacionPct"
              formato={(v) => `${Math.round(v)}%`}
            />
          )}
        </Panel>
        <Panel titulo="Ocupación por sede">
          <Ranking
            filas={(porSede.data?.datos ?? []).map((s) => ({
              clave: s.clave,
              nombre: s.etiqueta ?? s.clave,
              valor: s.ocupacionPct ?? 0,
              extra: s.rotacion ? `${s.rotacion.toLocaleString('es-CO')} rot./día` : undefined,
            }))}
            formato={(v) => `${v.toLocaleString('es-CO', { maximumFractionDigits: 1 })}%`}
          />
        </Panel>
      </div>

      <Panel titulo="Calificación del servicio">
        {calif.isLoading ? (
          <Cargando />
        ) : calif.data ? (
          <div className="grid gap-8 lg:grid-cols-[auto_1fr_1fr]">
            <div className="lg:pr-4">
              <p className="cifra text-7xl leading-none">
                {calif.data.promedio?.toLocaleString('es-CO') ?? '—'}
              </p>
              <Estrellas valor={calif.data.promedio ?? 0} />
              <p className="mt-1 text-sm text-ink-muted">{entero(calif.data.total)} opiniones</p>
              <ul className="mt-4 space-y-1.5">
                {calif.data.distribucion.map((d) => (
                  <li key={d.puntaje} className="flex items-center gap-2 text-sm">
                    <span className="w-3 tabular-nums">{d.puntaje}</span>
                    <div className="h-2 w-40 overflow-hidden rounded-full bg-canvas">
                      <div
                        className={cx(
                          'h-full rounded-full',
                          d.puntaje >= 4
                            ? 'bg-brand-gold'
                            : d.puntaje === 3
                              ? 'bg-ink/40'
                              : 'bg-danger/70',
                        )}
                        style={{ width: `${(d.total / maxDistribucion) * 100}%` }}
                      />
                    </div>
                    <span className="w-12 text-right tabular-nums text-ink-muted">
                      {entero(d.total)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold text-ink-muted">Por sede</h3>
              <Ranking
                filas={calif.data.porSede.map((s) => ({
                  clave: s.clave,
                  nombre: s.etiqueta,
                  valor: s.promedio,
                  extra: `${entero(s.total)} op.`,
                }))}
                formato={(v) => v.toLocaleString('es-CO', { maximumFractionDigits: 2 })}
              />
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold text-ink-muted">Lo último que dijeron</h3>
              <ul className="space-y-3">
                {calif.data.ultimosComentarios.map((c) => (
                  <li key={c.id} className="border-l-2 border-brand-gold pl-3">
                    <p className="text-sm">{c.comentario}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {c.puntaje} de 5, {c.sede}, {diaCorto(c.creadoEn.slice(0, 10))}
                    </p>
                  </li>
                ))}
                {calif.data.ultimosComentarios.length === 0 && (
                  <li className="text-sm text-ink-muted">
                    Nadie dejó comentarios en este periodo.
                  </li>
                )}
              </ul>
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

function Dato({
  titulo,
  valor,
  nota,
  destacado,
}: {
  titulo: string;
  valor: string;
  nota?: string;
  destacado?: boolean;
}) {
  return (
    <div className={cx('border-b border-r border-line p-4', destacado && 'bg-ink text-white')}>
      <p className={cx('text-sm', destacado ? 'text-white/70' : 'text-ink-muted')}>{titulo}</p>
      <p className={cx('cifra mt-1 text-3xl leading-none', destacado && 'text-brand-gold')}>
        {valor}
      </p>
      {nota && (
        <p className={cx('mt-1.5 text-xs', destacado ? 'text-white/60' : 'text-ink-muted')}>
          {nota}
        </p>
      )}
    </div>
  );
}

export function Estrellas({ valor, tamano = 'sm' }: { valor: number; tamano?: 'sm' | 'lg' }) {
  return (
    <span className="mt-2 inline-flex gap-0.5" aria-label={`${valor} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cx(
            tamano === 'sm' ? 'h-4 w-4' : 'h-7 w-7',
            i <= Math.round(valor) ? 'fill-brand-gold text-brand-gold' : 'text-line',
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}
