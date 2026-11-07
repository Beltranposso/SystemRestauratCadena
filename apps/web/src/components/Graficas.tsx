import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ReactNode } from 'react';
import { cx } from './ui';
import { useMarca } from '../lib/marca';

/** Colores de las gráficas: primario y acento salen de la marca configurada. */
export const COLOR = {
  get rojo() {
    return useMarca.getState().marca.colorPrimario;
  },
  get oro() {
    return useMarca.getState().marca.colorAcento;
  },
  tinta: '#1F1A17',
  suave: '#6B625C',
  linea: '#E7E2DC',
};

const ejes = {
  tick: { fontSize: 12, fill: COLOR.suave },
  tickLine: false,
  axisLine: false,
} as const;

export function Panel({
  titulo,
  accion,
  children,
  className,
}: {
  titulo: string;
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('rounded-xl border border-line bg-white p-4 sm:p-5', className)}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-base">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

function CajaTooltip({
  active,
  payload,
  label,
  formato,
  formatoX,
}: {
  active?: boolean;
  payload?: readonly { value?: unknown }[];
  label?: string | number;
  formato: (v: number) => string;
  formatoX?: (v: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-ink px-3 py-2 text-sm text-white shadow-lg">
      <p className="text-white/60">{formatoX ? formatoX(String(label)) : label}</p>
      <p className="font-semibold">{formato(Number(payload[0]!.value))}</p>
    </div>
  );
}

/** Serie en el tiempo (área roja) */
type Fila = object;

export function SerieTiempo({
  datos,
  x,
  y,
  formato,
  formatoX,
  formatoEje,
  alto = 260,
}: {
  datos: Fila[];
  x: string;
  y: string;
  formato: (v: number) => string;
  formatoX?: (v: string) => string;
  formatoEje?: (v: number) => string;
  alto?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <AreaChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="relleno" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR.rojo} stopOpacity={0.22} />
            <stop offset="100%" stopColor={COLOR.rojo} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={COLOR.linea} />
        <XAxis dataKey={x} {...ejes} tickFormatter={formatoX} minTickGap={24} />
        <YAxis {...ejes} width={64} tickFormatter={(v: number) => (formatoEje ?? formato)(v)} />
        <Tooltip
          content={<CajaTooltip formato={formato} formatoX={formatoX} />}
          cursor={{ stroke: COLOR.tinta, strokeDasharray: 3 }}
        />
        <Area
          type="monotone"
          dataKey={y}
          stroke={COLOR.rojo}
          strokeWidth={2.5}
          fill="url(#relleno)"
          isAnimationActive={false}
          activeDot={{ r: 5, fill: COLOR.rojo, stroke: '#fff', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Barras verticales; `resaltar` pinta en dorado la barra más alta. */
export function Barras({
  datos,
  x,
  y,
  formato,
  formatoEje,
  alto = 220,
  resaltar = true,
}: {
  datos: Fila[];
  x: string;
  y: string;
  formato: (v: number) => string;
  formatoEje?: (v: number) => string;
  alto?: number;
  resaltar?: boolean;
}) {
  const valor = (d: Fila) => Number((d as Record<string, unknown>)[y]);
  const max = Math.max(...datos.map(valor));
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart data={datos} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={COLOR.linea} />
        <XAxis dataKey={x} {...ejes} interval="preserveStartEnd" />
        <YAxis {...ejes} width={56} tickFormatter={(v: number) => (formatoEje ?? formato)(v)} />
        <Tooltip
          content={<CajaTooltip formato={formato} />}
          cursor={{ fill: 'rgba(31,26,23,0.05)' }}
        />
        <Bar dataKey={y} radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {datos.map((d, i) => (
            <Cell key={i} fill={resaltar && valor(d) === max ? COLOR.oro : COLOR.tinta} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Ranking horizontal sin librería: nombre, barra proporcional y cifra. */
export function Ranking({
  filas,
  formato,
  detalle,
}: {
  filas: { clave: string; nombre: string; valor: number; extra?: string }[];
  formato: (v: number) => string;
  detalle?: string;
}) {
  const max = Math.max(1, ...filas.map((f) => f.valor));
  return (
    <ol className="space-y-3">
      {filas.map((f, i) => (
        <li key={f.clave}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">{f.nombre}</span>
            <span className="shrink-0 font-semibold tabular-nums">{formato(f.valor)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
              <div
                className={cx('h-full rounded-full', i === 0 ? 'bg-brand-red' : 'bg-ink/70')}
                style={{ width: `${(f.valor / max) * 100}%` }}
              />
            </div>
            {f.extra && (
              <span className="w-24 shrink-0 text-right text-xs text-ink-muted">{f.extra}</span>
            )}
          </div>
        </li>
      ))}
      {filas.length === 0 && (
        <li className="text-sm text-ink-muted">{detalle ?? 'Sin datos en el periodo'}</li>
      )}
    </ol>
  );
}
