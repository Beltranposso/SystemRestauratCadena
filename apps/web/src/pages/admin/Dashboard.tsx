import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { BarraFiltros } from '../../components/Filtros';
import { Barras, Panel, Ranking, SerieTiempo } from '../../components/Graficas';
import { Aviso, Cargando, cx } from '../../components/ui';
import { useFiltros } from '../../lib/consultas';
import { diaCorto, diaLargo, entero, minutos, usdCompacto, usdEje } from '../../lib/formato';
import { apiPersonal, mensajeError } from '../../lib/sesion';
import type { FilaVentas, Kpis } from '../../lib/tipos';

function useVentas(agrupar: string, query: string, limite?: number) {
  return useQuery({
    queryKey: ['ventas', agrupar, query, limite],
    queryFn: async () =>
      (
        await apiPersonal.get<{ datos: FilaVentas[] }>(
          `/reportes/ventas?agrupar=${agrupar}&${query}${limite ? `&limite=${limite}` : ''}`,
        )
      ).data.datos,
  });
}

export default function Dashboard() {
  const { filtros, query } = useFiltros();
  const kpis = useQuery({
    queryKey: ['kpis', query],
    queryFn: async () => (await apiPersonal.get<Kpis>(`/reportes/kpis?${query}`)).data,
  });
  const porDia = useVentas('dia', query);
  const porSede = useVentas('sede', query, 20);
  const porHora = useVentas('hora', query);
  const productos = useVentas('producto', query, 8);
  const canales = useVentas('canal', query);

  const totalCanales = (canales.data ?? []).reduce((a, c) => a + c.ventasUsd, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-3xl">Ventas</h1>
          <p className="text-ink-muted">
            Del {diaLargo(filtros.desde)} al {diaLargo(filtros.hasta)}. Montos en dólares con la
            tasa del día de cada venta.
          </p>
        </div>
      </header>

      <BarraFiltros />

      {kpis.isError && <Aviso>{mensajeError(kpis.error)}</Aviso>}
      {kpis.isLoading ? (
        <Cargando />
      ) : kpis.data ? (
        <section
          aria-label="Indicadores"
          className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-white sm:grid-cols-3 xl:grid-cols-5"
        >
          <Indicador
            titulo="Ventas"
            valor={usdCompacto(kpis.data.ventasUsd)}
            variacion={kpis.data.variacionPct.ventasUsd}
            destacado
          />
          <Indicador
            titulo="Pedidos"
            valor={entero(kpis.data.pedidos)}
            variacion={kpis.data.variacionPct.pedidos}
          />
          <Indicador
            titulo="Ticket promedio"
            valor={usdCompacto(kpis.data.ticketPromedioUsd)}
            variacion={kpis.data.variacionPct.ticketPromedioUsd}
          />
          <Indicador
            titulo="Tiempo de cocina"
            valor={minutos(kpis.data.tiempoPreparacionMin)}
            variacion={kpis.data.variacionPct.tiempoPreparacionMin}
            menosEsMejor
          />
          <Indicador
            titulo="Calificación"
            valor={
              kpis.data.calificacionPromedio
                ? `${kpis.data.calificacionPromedio.toLocaleString('es-CO')} / 5`
                : '—'
            }
            nota={`${entero(kpis.data.calificaciones)} opiniones`}
          />
        </section>
      ) : null}

      <Panel titulo="Ventas por día">
        {porDia.isLoading ? (
          <Cargando />
        ) : (
          <SerieTiempo
            datos={porDia.data ?? []}
            x="clave"
            y="ventasUsd"
            formato={usdCompacto}
            formatoEje={usdEje}
            formatoX={diaCorto}
          />
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel titulo="Ventas por sede">
          <Ranking
            filas={(porSede.data ?? []).map((s) => ({
              clave: s.clave,
              nombre: s.etiqueta ?? s.clave,
              valor: s.ventasUsd,
              extra: `${entero(s.pedidos)} pedidos`,
            }))}
            formato={usdCompacto}
          />
        </Panel>
        <Panel
          titulo="Hora de mayor venta"
          accion={<span className="text-xs text-ink-muted">Hora local de cada sede</span>}
        >
          {porHora.isLoading ? (
            <Cargando />
          ) : (
            <Barras
              datos={porHora.data ?? []}
              x="clave"
              y="ventasUsd"
              formato={usdCompacto}
              formatoEje={usdEje}
            />
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Panel
          titulo="Productos más vendidos"
          accion={<span className="text-xs text-ink-muted">Sin impuesto</span>}
        >
          <Ranking
            filas={(productos.data ?? []).map((p) => ({
              clave: p.clave,
              nombre: p.etiqueta ?? p.clave,
              valor: p.ventasUsd,
              extra: `${entero(p.unidades)} uds.`,
            }))}
            formato={usdCompacto}
          />
        </Panel>
        <Panel titulo="Dónde se pide">
          <ul className="space-y-4">
            {(canales.data ?? []).map((c) => {
              const pct = totalCanales ? (c.ventasUsd / totalCanales) * 100 : 0;
              return (
                <li key={c.clave}>
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium">
                      {c.clave === 'CAJA' ? 'Caja' : c.clave === 'KIOSCO' ? 'Kiosco' : 'Web'}
                    </span>
                    <span className="cifra text-3xl">{Math.round(pct)}%</span>
                  </div>
                  <p className="text-sm text-ink-muted">
                    {usdCompacto(c.ventasUsd)} en {entero(c.pedidos)} pedidos
                  </p>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Indicador({
  titulo,
  valor,
  variacion,
  menosEsMejor,
  nota,
  destacado,
}: {
  titulo: string;
  valor: string;
  variacion?: number | null;
  menosEsMejor?: boolean;
  nota?: string;
  destacado?: boolean;
}) {
  const bueno =
    variacion !== null && variacion !== undefined && (menosEsMejor ? variacion < 0 : variacion > 0);
  return (
    <div
      className={cx('border-b border-r border-line p-4 sm:p-5', destacado && 'bg-ink text-white')}
    >
      <p className={cx('text-sm', destacado ? 'text-white/70' : 'text-ink-muted')}>{titulo}</p>
      <p className={cx('cifra mt-1 text-4xl leading-none', destacado && 'text-brand-gold')}>
        {valor}
      </p>
      {variacion !== undefined && (
        <p
          className={cx(
            'mt-2 flex items-center gap-1 text-sm font-medium',
            variacion === null
              ? destacado
                ? 'text-white/50'
                : 'text-ink-muted'
              : bueno
                ? 'text-ok'
                : 'text-danger',
            destacado && variacion !== null && (bueno ? 'text-[#7ee2a8]' : 'text-[#ff9b93]'),
          )}
        >
          {variacion === null ? (
            'Sin periodo anterior'
          ) : (
            <>
              {variacion >= 0 ? (
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              ) : (
                <ArrowDownRight className="h-4 w-4" aria-hidden />
              )}
              {Math.abs(variacion).toLocaleString('es-CO', { maximumFractionDigits: 1 })}% vs.
              periodo anterior
            </>
          )}
        </p>
      )}
      {nota && (
        <p className={cx('mt-2 text-sm', destacado ? 'text-white/60' : 'text-ink-muted')}>{nota}</p>
      )}
    </div>
  );
}
