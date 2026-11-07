import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Clock, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { NOMBRES_DIAS, type TipoPromocion } from '@restaurantes/shared';
import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  cx,
  Insignia,
  Interruptor,
  Modal,
  Segmentos,
  Vacio,
} from '../../components/ui';
import { useSedes } from '../../lib/consultas';
import { dinero, hoyEn } from '../../lib/formato';
import { apiPersonal, mensajeError, usePersonal } from '../../lib/sesion';
import type {
  Categoria,
  EstadoPromocion,
  ProductoCatalogo,
  Promocion,
  Sede,
} from '../../lib/tipos';
import { SelectorSedes } from './SelectorSedes';

const ESTADOS: Record<EstadoPromocion, { texto: string; color: 'ok' | 'oro' | 'neutro' | 'warn' }> =
  {
    VIGENTE: { texto: 'Aplicando ahora', color: 'ok' },
    FUERA_DE_HORARIO: { texto: 'Vigente, no aplica a esta hora o día', color: 'oro' },
    PROGRAMADA: { texto: 'Programada', color: 'neutro' },
    VENCIDA: { texto: 'Vencida', color: 'neutro' },
    PAUSADA: { texto: 'Pausada', color: 'warn' },
  };

const TIPOS: { valor: TipoPromocion; texto: string }[] = [
  { valor: 'PORCENTAJE', texto: '% de descuento' },
  { valor: 'PRECIO_FIJO', texto: 'Precio especial' },
  { valor: 'LLEVA_PAGA', texto: 'Lleva N, paga M' },
];

const FILTROS = [
  { valor: 'activas', texto: 'Activas' },
  { valor: 'todas', texto: 'Todas' },
  { valor: 'terminadas', texto: 'Vencidas y pausadas' },
] as const;

const fechaCorta = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

function textoDias(dias: number[]) {
  if (!dias.length || dias.length === 7) return 'Todos los días';
  if (dias.join() === '1,2,3,4,5') return 'Lunes a viernes';
  if (dias.join() === '0,6') return 'Fines de semana';
  return [...dias]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => NOMBRES_DIAS[d])
    .join(', ');
}

export default function Promociones() {
  const usuario = usePersonal((s) => s.usuario)!;
  const esAdmin = usuario.rol === 'ADMIN_GLOBAL';
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['valor']>('activas');
  const [editando, setEditando] = useState<Promocion | 'nueva' | null>(null);
  const [error, setError] = useState('');

  const promociones = useQuery({
    queryKey: ['promociones'],
    queryFn: async () => (await apiPersonal.get<Promocion[]>('/promociones')).data,
    refetchInterval: 60_000,
  });
  const sedes = useSedes();

  const cambiar = useMutation({
    mutationFn: ({ id, activa }: { id: number; activa: boolean }) =>
      apiPersonal.patch(`/promociones/${id}`, { activa }),
    onSuccess: () => (setError(''), void qc.invalidateQueries({ queryKey: ['promociones'] })),
    onError: (e) => setError(mensajeError(e)),
  });
  const eliminar = useMutation({
    mutationFn: (id: number) => apiPersonal.delete(`/promociones/${id}`),
    onSuccess: () => (setError(''), void qc.invalidateQueries({ queryKey: ['promociones'] })),
    onError: (e) => setError(mensajeError(e)),
  });

  const lista = (promociones.data ?? []).filter((p) =>
    filtro === 'todas'
      ? true
      : filtro === 'activas'
        ? !['VENCIDA', 'PAUSADA'].includes(p.estado)
        : ['VENCIDA', 'PAUSADA'].includes(p.estado),
  );
  const aplicando = promociones.data?.filter((p) => p.estado === 'VIGENTE').length ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Promociones</h1>
          <p className="mt-1 max-w-xl text-ink-muted">
            {esAdmin
              ? 'Las crea la casa matriz y eliges en qué sedes aplican. Se activan solas según su vigencia, días y horario local de cada sede, y nunca se acumulan: por producto gana la que más descuenta.'
              : 'Promociones que la casa matriz activó en tus sedes. Se aplican solas en la caja y en los kioscos.'}
          </p>
        </div>
        {esAdmin && (
          <Boton onClick={() => setEditando('nueva')}>
            <Plus className="h-4 w-4" aria-hidden /> Nueva promoción
          </Boton>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Segmentos etiqueta="Filtrar" valor={filtro} onChange={setFiltro} opciones={[...FILTROS]} />
        {promociones.data && (
          <span className="text-sm text-ink-muted">{aplicando} aplicando en este momento</span>
        )}
      </div>

      {error && <Aviso>{error}</Aviso>}

      {promociones.isLoading ? (
        <Cargando />
      ) : lista.length === 0 ? (
        <Vacio
          titulo="No hay promociones aquí"
          texto={esAdmin ? 'Crea una y elige en qué sedes aplica.' : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {lista.map((p) => (
            <TarjetaPromocion
              key={p.id}
              p={p}
              moneda={monedaDe(p, sedes.data)}
              esAdmin={esAdmin}
              ocupado={cambiar.isPending || eliminar.isPending}
              onEditar={() => setEditando(p)}
              onActivar={(activa) => cambiar.mutate({ id: p.id, activa })}
              onEliminar={() => {
                if (
                  confirm(
                    `¿Eliminar «${p.nombre}»? Los pedidos que la usaron conservan su descuento.`,
                  )
                )
                  eliminar.mutate(p.id);
              }}
            />
          ))}
        </ul>
      )}

      {editando && (
        <FormularioPromocion
          inicial={editando === 'nueva' ? null : editando}
          sedes={sedes.data ?? []}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            void qc.invalidateQueries({ queryKey: ['promociones'] });
          }}
        />
      )}
    </div>
  );
}

function monedaDe(p: Promocion, sedes?: Sede[]) {
  const s = sedes?.find((x) => x.id === p.sedes[0]?.id);
  return s?.ciudad.pais.moneda ?? 'USD';
}

function TarjetaPromocion({
  p,
  moneda,
  esAdmin,
  ocupado,
  onEditar,
  onActivar,
  onEliminar,
}: {
  p: Promocion;
  moneda: string;
  esAdmin: boolean;
  ocupado: boolean;
  onEditar: () => void;
  onActivar: (v: boolean) => void;
  onEliminar: () => void;
}) {
  const estado = ESTADOS[p.estado];
  const objetivo = p.producto
    ? `${p.producto.esCombo && !/^combo/i.test(p.producto.nombre) ? 'Combo ' : ''}${p.producto.nombre}`
    : `Toda la categoría ${p.categoria?.nombre}`;
  const detalle =
    p.tipo === 'PRECIO_FIJO'
      ? `a ${dinero(p.precioEspecial, moneda)}`
      : p.tipo === 'LLEVA_PAGA'
        ? `lleva ${p.llevaN}, paga ${p.pagaM}`
        : `${p.porcentaje} % menos`;
  const terminada = p.estado === 'VENCIDA' || p.estado === 'PAUSADA';

  return (
    <li
      className={cx(
        'flex gap-4 rounded-xl border border-line bg-white p-4',
        terminada && 'opacity-70',
      )}
    >
      <div
        className={cx(
          'grid h-16 w-20 shrink-0 place-items-center rounded-lg text-center font-display font-bold leading-tight',
          p.tipo === 'PRECIO_FIJO'
            ? 'bg-brand-gold-soft text-sm text-ink'
            : 'bg-brand-red text-xl text-white',
        )}
      >
        {p.etiqueta}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg leading-tight">{p.nombre}</h2>
          <Insignia color={estado.color}>{estado.texto}</Insignia>
        </div>
        <p className="mt-0.5 text-sm">
          <span className="font-semibold">{objetivo}</span>{' '}
          <span className="text-ink-muted">{detalle}</span>
        </p>
        {p.descripcion && <p className="mt-0.5 text-sm text-ink-muted">{p.descripcion}</p>}
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {p.fechaFin
              ? `${fechaCorta(p.fechaInicio)} al ${fechaCorta(p.fechaFin)}`
              : `Desde el ${fechaCorta(p.fechaInicio)}, sin fecha de fin`}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {textoDias(p.diasSemana)}
            {p.horaInicio && `, ${p.horaInicio} a ${p.horaFin}`}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {p.sedes.length <= 3
              ? p.sedes.map((s) => s.codigo).join(', ')
              : `${p.sedes.length} sedes`}
            {p.otrasSedes > 0 && ` y ${p.otrasSedes} más fuera de tu alcance`}
          </span>
          <span>{p.usos.toLocaleString('es-CO')} veces aplicada</span>
        </p>
      </div>
      {esAdmin && (
        <div className="flex shrink-0 flex-col items-end justify-between gap-2">
          <Interruptor
            etiqueta={p.activa ? `Pausar ${p.nombre}` : `Reactivar ${p.nombre}`}
            activo={p.activa}
            disabled={ocupado}
            onChange={onActivar}
          />
          <div className="flex gap-1">
            <Boton
              tamano="sm"
              variante="fantasma"
              aria-label={`Editar ${p.nombre}`}
              onClick={onEditar}
            >
              <Pencil className="h-4 w-4" />
            </Boton>
            <Boton
              tamano="sm"
              variante="fantasma"
              aria-label={`Eliminar ${p.nombre}`}
              disabled={ocupado}
              onClick={onEliminar}
            >
              <Trash2 className="h-4 w-4" />
            </Boton>
          </div>
        </div>
      )}
    </li>
  );
}

// ───────────────────────────── Formulario ─────────────────────────────

interface Borrador {
  nombre: string;
  descripcion: string;
  tipo: TipoPromocion;
  objetivo: 'producto' | 'categoria';
  productoId: string;
  categoriaId: string;
  porcentaje: string;
  precioEspecial: string;
  llevaN: string;
  pagaM: string;
  fechaInicio: string;
  fechaFin: string;
  diasSemana: number[];
  conHorario: boolean;
  horaInicio: string;
  horaFin: string;
  activa: boolean;
  sedeIds: number[];
}

const desde = (p: Promocion | null): Borrador => ({
  nombre: p?.nombre ?? '',
  descripcion: p?.descripcion ?? '',
  tipo: p?.tipo ?? 'PORCENTAJE',
  objetivo: p?.categoriaId ? 'categoria' : 'producto',
  productoId: p?.productoId ? String(p.productoId) : '',
  categoriaId: p?.categoriaId ? String(p.categoriaId) : '',
  porcentaje: p?.porcentaje ? String(p.porcentaje) : '',
  precioEspecial: p?.precioEspecial ? String(Number(p.precioEspecial)) : '',
  llevaN: String(p?.llevaN ?? 2),
  pagaM: String(p?.pagaM ?? 1),
  fechaInicio: p?.fechaInicio ?? hoyEn('America/Bogota'),
  fechaFin: p?.fechaFin ?? '',
  diasSemana: p?.diasSemana ?? [],
  conHorario: Boolean(p?.horaInicio),
  horaInicio: p?.horaInicio ?? '15:00',
  horaFin: p?.horaFin ?? '18:00',
  activa: p?.activa ?? true,
  sedeIds: p?.sedes.map((s) => s.id) ?? [],
});

function FormularioPromocion({
  inicial,
  sedes,
  onCerrar,
  onGuardado,
}: {
  inicial: Promocion | null;
  sedes: Sede[];
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [b, setB] = useState<Borrador>(() => desde(inicial));
  const [error, setError] = useState('');
  const fijar = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB((x) => ({ ...x, [k]: v }));

  const productos = useQuery({
    queryKey: ['catalogo'],
    queryFn: async () => (await apiPersonal.get<ProductoCatalogo[]>('/productos?activo=true')).data,
    staleTime: 5 * 60_000,
  });
  const categorias = useQuery({
    queryKey: ['categorias'],
    queryFn: async () => (await apiPersonal.get<Categoria[]>('/categorias')).data,
    staleTime: 5 * 60_000,
  });

  const porCategoria = useMemo(() => {
    const m = new Map<string, ProductoCatalogo[]>();
    for (const p of productos.data ?? [])
      m.set(p.categoria.nombre, [...(m.get(p.categoria.nombre) ?? []), p]);
    return [...m];
  }, [productos.data]);

  const monedas = new Set(
    sedes.filter((s) => b.sedeIds.includes(s.id)).map((s) => s.ciudad.pais.moneda),
  );
  const moneda = monedas.size === 1 ? [...monedas][0] : undefined;
  const porCategoriaPermitido = b.tipo === 'PORCENTAJE';
  const objetivo = porCategoriaPermitido ? b.objetivo : 'producto';

  const guardar = useMutation({
    mutationFn: async () => {
      const cuerpo = {
        nombre: b.nombre,
        descripcion: b.descripcion,
        tipo: b.tipo,
        productoId: objetivo === 'producto' ? Number(b.productoId) || null : null,
        categoriaId: objetivo === 'categoria' ? Number(b.categoriaId) || null : null,
        porcentaje: b.tipo === 'PORCENTAJE' ? Number(b.porcentaje) || null : null,
        precioEspecial: b.tipo === 'PRECIO_FIJO' ? Number(b.precioEspecial) : null,
        llevaN: b.tipo === 'LLEVA_PAGA' ? Number(b.llevaN) : null,
        pagaM: b.tipo === 'LLEVA_PAGA' ? Number(b.pagaM) : null,
        fechaInicio: b.fechaInicio,
        fechaFin: b.fechaFin || null,
        diasSemana: b.diasSemana,
        horaInicio: b.conHorario ? b.horaInicio : null,
        horaFin: b.conHorario ? b.horaFin : null,
        activa: b.activa,
        sedeIds: b.sedeIds,
      };
      return inicial
        ? apiPersonal.patch(`/promociones/${inicial.id}`, cuerpo)
        : apiPersonal.post('/promociones', cuerpo);
    },
    onSuccess: onGuardado,
    onError: (e) => setError(mensajeError(e)),
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!b.sedeIds.length) return setError('Elige al menos una sede');
    guardar.mutate();
  };

  return (
    <Modal
      abierto
      ancho="lg"
      onCerrar={onCerrar}
      titulo={inicial ? `Editar «${inicial.nombre}»` : 'Nueva promoción'}
    >
      <form onSubmit={enviar} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Nombre" ayuda="Lo ve el cliente en el kiosco.">
            <input
              className="campo"
              required
              minLength={3}
              maxLength={80}
              value={b.nombre}
              onChange={(e) => fijar('nombre', e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Descripción (opcional)">
            <input
              className="campo"
              maxLength={200}
              value={b.descripcion}
              onChange={(e) => fijar('descripcion', e.target.value)}
            />
          </Campo>
        </div>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold">Tipo de promoción</legend>
          <Segmentos
            etiqueta="Tipo de promoción"
            valor={b.tipo}
            onChange={(t) => fijar('tipo', t)}
            opciones={TIPOS}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Aplica a</span>
                {porCategoriaPermitido && (
                  <Segmentos
                    etiqueta="Aplica a"
                    valor={b.objetivo}
                    onChange={(v) => fijar('objetivo', v)}
                    opciones={[
                      { valor: 'producto', texto: 'Producto' },
                      { valor: 'categoria', texto: 'Categoría' },
                    ]}
                  />
                )}
              </div>
              {objetivo === 'producto' ? (
                <select
                  className="campo"
                  required
                  aria-label="Producto o combo"
                  value={b.productoId}
                  onChange={(e) => fijar('productoId', e.target.value)}
                >
                  <option value="">Elige un producto o combo…</option>
                  {porCategoria.map(([cat, lista]) => (
                    <optgroup key={cat} label={cat}>
                      {lista.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              ) : (
                <select
                  className="campo"
                  required
                  aria-label="Categoría"
                  value={b.categoriaId}
                  onChange={(e) => fijar('categoriaId', e.target.value)}
                >
                  <option value="">Elige una categoría…</option>
                  {categorias.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {b.tipo === 'PORCENTAJE' && (
              <Campo etiqueta="Descuento (%)">
                <input
                  className="campo"
                  required
                  type="number"
                  min={1}
                  max={100}
                  step="0.5"
                  value={b.porcentaje}
                  onChange={(e) => fijar('porcentaje', e.target.value)}
                />
              </Campo>
            )}
            {b.tipo === 'PRECIO_FIJO' && (
              <Campo
                etiqueta={`Precio especial${moneda ? ` (${moneda}, sin impuesto)` : ''}`}
                ayuda="Solo sedes de un mismo país: el precio está en una moneda."
                error={monedas.size > 1 ? 'Las sedes elegidas usan monedas distintas' : undefined}
              >
                <input
                  className="campo"
                  required
                  inputMode="decimal"
                  value={b.precioEspecial}
                  onChange={(e) => fijar('precioEspecial', e.target.value.replace(',', '.'))}
                />
              </Campo>
            )}
            {b.tipo === 'LLEVA_PAGA' && (
              <div className="flex items-end gap-2">
                <Campo etiqueta="Lleva">
                  <input
                    className="campo w-20"
                    type="number"
                    min={2}
                    max={10}
                    required
                    value={b.llevaN}
                    onChange={(e) => fijar('llevaN', e.target.value)}
                  />
                </Campo>
                <Campo etiqueta="Paga">
                  <input
                    className="campo w-20"
                    type="number"
                    min={1}
                    max={Number(b.llevaN) - 1}
                    required
                    value={b.pagaM}
                    onChange={(e) => fijar('pagaM', e.target.value)}
                  />
                </Campo>
                <span className="cifra pb-2 text-2xl text-brand-red">
                  {b.llevaN}x{b.pagaM}
                </span>
              </div>
            )}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold">Cuándo aplica</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Desde">
              <input
                className="campo"
                type="date"
                required
                value={b.fechaInicio}
                onChange={(e) => fijar('fechaInicio', e.target.value)}
              />
            </Campo>
            <Campo etiqueta="Hasta (opcional)" ayuda="Vacío: sin fecha de fin.">
              <input
                className="campo"
                type="date"
                min={b.fechaInicio}
                value={b.fechaFin}
                onChange={(e) => fijar('fechaFin', e.target.value)}
              />
            </Campo>
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-semibold">Días</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Días de la semana">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const activo = b.diasSemana.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={activo}
                    onClick={() =>
                      fijar(
                        'diasSemana',
                        activo ? b.diasSemana.filter((x) => x !== d) : [...b.diasSemana, d],
                      )
                    }
                    className={cx(
                      'h-9 w-12 rounded-lg border text-sm font-semibold',
                      activo
                        ? 'border-ink bg-ink text-white'
                        : 'border-line bg-white text-ink-muted hover:text-ink',
                    )}
                  >
                    {NOMBRES_DIAS[d]}
                  </button>
                );
              })}
              <span className="self-center pl-1 text-xs text-ink-muted">
                {b.diasSemana.length === 0
                  ? 'Ninguno marcado: todos los días'
                  : textoDias(b.diasSemana)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand-red"
                checked={b.conHorario}
                onChange={(e) => fijar('conHorario', e.target.checked)}
              />
              Solo en un horario
            </label>
            {b.conHorario && (
              <>
                <input
                  className="campo h-9 w-28"
                  type="time"
                  aria-label="Hora de inicio"
                  value={b.horaInicio}
                  onChange={(e) => fijar('horaInicio', e.target.value)}
                />
                <span className="text-sm text-ink-muted">a</span>
                <input
                  className="campo h-9 w-28"
                  type="time"
                  aria-label="Hora de fin"
                  value={b.horaFin}
                  onChange={(e) => fijar('horaFin', e.target.value)}
                />
                <span className="text-xs text-ink-muted">hora local de cada sede</span>
              </>
            )}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Sedes donde aplica</legend>
          <SelectorSedes sedes={sedes} elegidas={b.sedeIds} onChange={(v) => fijar('sedeIds', v)} />
        </fieldset>

        {error && <Aviso>{error}</Aviso>}
        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <label className="flex items-center gap-2 text-sm">
            <Interruptor
              etiqueta="Promoción activa"
              activo={b.activa}
              onChange={(v) => fijar('activa', v)}
            />
            {b.activa ? 'Activa' : 'Pausada'}
          </label>
          <div className="flex gap-2">
            <Boton type="button" variante="fantasma" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" cargando={guardar.isPending}>
              {inicial ? 'Guardar cambios' : 'Crear promoción'}
            </Boton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
