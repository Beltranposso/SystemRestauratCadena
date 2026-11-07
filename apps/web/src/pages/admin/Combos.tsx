import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { contenidoCombo } from '../../components/TomaPedido';
import { FotoProducto, SubirFoto } from '../../components/FotoProducto';
import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  cx,
  Insignia,
  Interruptor,
  Modal,
  Vacio,
} from '../../components/ui';
import { useSedes } from '../../lib/consultas';
import { dinero } from '../../lib/formato';
import { apiPersonal, mensajeError, usePersonal } from '../../lib/sesion';
import type { Categoria, Combo, ProductoCatalogo, Sede } from '../../lib/tipos';
import { SelectorSedes } from './SelectorSedes';

/** Combos de contenido fijo: qué llevan, en qué sedes se venden y a qué precio. */
export default function Combos() {
  const usuario = usePersonal((s) => s.usuario)!;
  const esAdmin = usuario.rol === 'ADMIN_GLOBAL';
  const qc = useQueryClient();
  const [editando, setEditando] = useState<Combo | 'nuevo' | null>(null);
  const [error, setError] = useState('');
  const sedes = useSedes();
  const combos = useQuery({
    queryKey: ['combos'],
    queryFn: async () => (await apiPersonal.get<Combo[]>('/combos')).data,
  });
  const monedaDe = (sedeId: number) =>
    sedes.data?.find((s) => s.id === sedeId)?.ciudad.pais.moneda ?? 'USD';

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Combos</h1>
          <p className="mt-1 max-w-xl text-ink-muted">
            {esAdmin
              ? 'Cada combo lleva un contenido fijo y tú decides en qué sedes se vende y a qué precio. Si se agota un producto del combo en una sede, el combo se oculta ahí hasta que vuelva.'
              : 'Combos que la casa matriz publicó en tus sedes. Puedes marcarlos agotados desde Menú.'}
          </p>
        </div>
        {esAdmin && (
          <Boton onClick={() => setEditando('nuevo')}>
            <Plus className="h-4 w-4" aria-hidden /> Nuevo combo
          </Boton>
        )}
      </header>

      {error && <Aviso>{error}</Aviso>}

      {combos.isLoading ? (
        <Cargando />
      ) : !combos.data?.length ? (
        <Vacio titulo="Todavía no hay combos" />
      ) : (
        <ul className="space-y-3">
          {combos.data.map((c) => (
            <li
              key={c.id}
              className={cx(
                'overflow-hidden rounded-xl border border-line bg-white',
                !c.activo && 'opacity-60',
              )}
            >
              <div className="flex items-start gap-3 p-4">
                {esAdmin ? (
                  <SubirFoto
                    productoId={c.id}
                    nombre={c.nombre}
                    url={c.imagenUrl}
                    className="h-16 w-16"
                    onError={setError}
                  />
                ) : (
                  <FotoProducto url={c.imagenUrl} className="h-16 w-16 shrink-0 rounded-lg" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg leading-tight">{c.nombre}</h2>
                    <span className="text-xs text-ink-muted">{c.sku}</span>
                    {!c.activo && <Insignia color="warn">Inactivo</Insignia>}
                  </div>
                  <p className="text-sm text-ink-muted">
                    Incluye{' '}
                    {contenidoCombo(
                      c.componentes.map((x) => ({
                        nombre: x.producto.nombre,
                        cantidad: x.cantidad,
                      })),
                    )}
                  </p>
                </div>
                {esAdmin && (
                  <Boton
                    tamano="sm"
                    variante="secundario"
                    onClick={() => setEditando(c)}
                    aria-label={`Editar ${c.nombre}`}
                  >
                    <Pencil className="h-4 w-4" aria-hidden /> Editar
                  </Boton>
                )}
              </div>
              {c.sedes.length === 0 ? (
                <p className="border-t border-line px-4 py-3 text-sm text-ink-muted">
                  No se vende en ninguna de tus sedes.
                </p>
              ) : (
                <div className="overflow-x-auto border-t border-line">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
                      <tr>
                        <th className="px-4 py-2 font-semibold">Sede</th>
                        <th className="px-4 py-2 text-right font-semibold">Precio</th>
                        <th className="px-4 py-2 text-right font-semibold">Por separado</th>
                        <th className="px-4 py-2 text-right font-semibold">Ahorro</th>
                        <th className="px-4 py-2 font-semibold">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {c.sedes.map((s) => {
                        const moneda = monedaDe(s.sede.id);
                        const ahorro = s.precioSuelto - Number(s.precio);
                        const pct = s.precioSuelto ? (ahorro / s.precioSuelto) * 100 : 0;
                        return (
                          <tr key={s.sede.id}>
                            <td className="px-4 py-2">
                              {s.sede.nombre}{' '}
                              <span className="text-ink-muted">({s.sede.codigo})</span>
                            </td>
                            <td className="px-4 py-2 text-right font-semibold tabular-nums">
                              {dinero(s.precio, moneda)}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-ink-muted">
                              {dinero(s.precioSuelto, moneda)}
                            </td>
                            <td
                              className={cx(
                                'px-4 py-2 text-right tabular-nums',
                                ahorro > 0 ? 'text-ok' : 'text-danger',
                              )}
                            >
                              {ahorro > 0 ? `${Math.round(pct)} %` : 'Sin ahorro'}
                            </td>
                            <td className="px-4 py-2">
                              {s.disponible ? (
                                <Insignia color="ok">Disponible</Insignia>
                              ) : (
                                <Insignia>Agotado</Insignia>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editando && (
        <FormularioCombo
          inicial={editando === 'nuevo' ? null : editando}
          sedes={sedes.data ?? []}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            void qc.invalidateQueries({ queryKey: ['combos'] });
          }}
        />
      )}
    </div>
  );
}

function FormularioCombo({
  inicial,
  sedes,
  onCerrar,
  onGuardado,
}: {
  inicial: Combo | null;
  sedes: Sede[];
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [sku, setSku] = useState(inicial?.sku ?? '');
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '');
  const [categoriaId, setCategoriaId] = useState(inicial ? String(inicial.categoriaId) : '');
  const [activo, setActivo] = useState(inicial?.activo ?? true);
  const [componentes, setComponentes] = useState<{ productoId: string; cantidad: number }[]>(
    inicial?.componentes.map((c) => ({
      productoId: String(c.productoId),
      cantidad: c.cantidad,
    })) ?? [
      { productoId: '', cantidad: 1 },
      { productoId: '', cantidad: 1 },
    ],
  );
  const [precios, setPrecios] = useState<Record<number, string>>(
    Object.fromEntries(inicial?.sedes.map((s) => [s.sede.id, String(Number(s.precio))]) ?? []),
  );
  const [error, setError] = useState('');

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
  // Categoría "Combos" por defecto
  const categoriaElegida =
    categoriaId || String(categorias.data?.find((c) => c.nombre === 'Combos')?.id ?? '');

  const porCategoria = useMemo(() => {
    const m = new Map<string, ProductoCatalogo[]>();
    for (const p of productos.data ?? [])
      if (!p.esCombo) m.set(p.categoria.nombre, [...(m.get(p.categoria.nombre) ?? []), p]);
    return [...m];
  }, [productos.data]);

  const elegidas = Object.keys(precios).map(Number);

  const guardar = useMutation({
    mutationFn: async () => {
      const cuerpo = {
        nombre,
        descripcion,
        categoriaId: Number(categoriaElegida),
        activo,
        componentes: componentes
          .filter((c) => c.productoId)
          .map((c) => ({ productoId: Number(c.productoId), cantidad: c.cantidad })),
        sedes: elegidas.map((sedeId) => ({ sedeId, precio: Number(precios[sedeId]) })),
      };
      return inicial
        ? apiPersonal.patch(`/combos/${inicial.id}`, cuerpo)
        : apiPersonal.post('/combos', { ...cuerpo, sku });
    },
    onSuccess: onGuardado,
    onError: (e) => setError(mensajeError(e)),
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const faltaPrecio = elegidas.find((id) => !(Number(precios[id]) > 0));
    if (faltaPrecio)
      return setError(
        `Falta el precio en ${sedes.find((s) => s.id === faltaPrecio)?.codigo ?? 'una sede'}`,
      );
    guardar.mutate();
  };

  return (
    <Modal
      abierto
      ancho="lg"
      onCerrar={onCerrar}
      titulo={inicial ? `Editar ${inicial.nombre}` : 'Nuevo combo'}
    >
      <form onSubmit={enviar} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Nombre">
            <input
              className="campo"
              required
              minLength={2}
              maxLength={120}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="SKU" ayuda={inicial ? 'No se puede cambiar.' : 'Ej. COM-010'}>
            <input
              className="campo uppercase"
              required
              disabled={Boolean(inicial)}
              pattern="[A-Za-z0-9\-]{3,30}"
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
            />
          </Campo>
          <Campo etiqueta="Descripción (opcional)">
            <input
              className="campo"
              maxLength={300}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Categoría del menú">
            <select
              className="campo"
              value={categoriaElegida}
              onChange={(e) => setCategoriaId(e.target.value)}
            >
              {categorias.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Qué lleva</legend>
          <ul className="space-y-2">
            {componentes.map((c, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={20}
                  aria-label="Cantidad"
                  className="campo h-10 w-20 text-center"
                  value={c.cantidad}
                  onChange={(e) =>
                    setComponentes((cs) =>
                      cs.map((x, j) =>
                        j === i ? { ...x, cantidad: Number(e.target.value) || 1 } : x,
                      ),
                    )
                  }
                />
                <select
                  className="campo min-w-0 flex-1"
                  aria-label="Producto"
                  required={i < 1}
                  value={c.productoId}
                  onChange={(e) =>
                    setComponentes((cs) =>
                      cs.map((x, j) => (j === i ? { ...x, productoId: e.target.value } : x)),
                    )
                  }
                >
                  <option value="">Elige un producto…</option>
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
                <Boton
                  type="button"
                  tamano="sm"
                  variante="fantasma"
                  aria-label="Quitar producto"
                  disabled={componentes.length <= 1}
                  onClick={() => setComponentes((cs) => cs.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Boton>
              </li>
            ))}
          </ul>
          <Boton
            type="button"
            tamano="sm"
            variante="secundario"
            className="mt-2"
            disabled={componentes.length >= 12}
            onClick={() => setComponentes((cs) => [...cs, { productoId: '', cantidad: 1 }])}
          >
            <Plus className="h-4 w-4" aria-hidden /> Agregar producto
          </Boton>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Dónde se vende y a qué precio</legend>
          <p className="mb-2 text-xs text-ink-muted">
            Precio en la moneda de cada sede, sin impuesto. Los productos del combo deben estar en
            el menú de cada sede elegida.
          </p>
          <SelectorSedes
            sedes={sedes}
            elegidas={elegidas}
            onChange={(ids) =>
              setPrecios((actual) => {
                const nuevo: Record<number, string> = {};
                // Una sede nueva toma el precio de otra sede del mismo país, si hay
                for (const id of ids) {
                  const pais = sedes.find((s) => s.id === id)?.ciudad.pais.id;
                  const vecina = Object.keys(actual)
                    .map(Number)
                    .find((x) => sedes.find((s) => s.id === x)?.ciudad.pais.id === pais);
                  nuevo[id] = actual[id] ?? (vecina !== undefined ? actual[vecina]! : '');
                }
                return nuevo;
              })
            }
            extra={(s) => (
              <span className="flex items-center gap-1">
                <input
                  className="campo h-8 w-28 text-right tabular-nums"
                  inputMode="decimal"
                  aria-label={`Precio en ${s.nombre}`}
                  placeholder="Precio"
                  value={precios[s.id] ?? ''}
                  onChange={(e) =>
                    setPrecios((p) => ({ ...p, [s.id]: e.target.value.replace(',', '.') }))
                  }
                />
                <span className="w-9 text-xs text-ink-muted">{s.ciudad.pais.moneda}</span>
              </span>
            )}
          />
        </fieldset>

        {error && <Aviso>{error}</Aviso>}
        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <label className="flex items-center gap-2 text-sm">
            <Interruptor etiqueta="Combo activo" activo={activo} onChange={setActivo} />
            {activo ? 'Activo' : 'Inactivo (oculto en todas las sedes)'}
          </label>
          <div className="flex gap-2">
            <Boton type="button" variante="fantasma" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" cargando={guardar.isPending}>
              {inicial ? 'Guardar cambios' : 'Crear combo'}
            </Boton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
