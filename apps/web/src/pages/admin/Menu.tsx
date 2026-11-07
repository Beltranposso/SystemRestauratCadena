import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SelectorSede } from '../../components/Filtros';
import { FotoProducto, SubirFoto } from '../../components/FotoProducto';
import { Aviso, Boton, Cargando, cx, Insignia, Interruptor } from '../../components/ui';
import { useSedeTrabajo } from '../../lib/consultas';
import { apiPersonal, mensajeError, usePersonal } from '../../lib/sesion';
import type { ProductoGestion } from '../../lib/tipos';

export default function Menu() {
  const { sedeId, sede } = useSedeTrabajo();
  const esAdmin = usePersonal((s) => s.usuario?.rol === 'ADMIN_GLOBAL');
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState('');
  const moneda = sede?.ciudad.pais.moneda ?? 'USD';

  const productos = useQuery({
    queryKey: ['productos-sede', sedeId],
    queryFn: async () =>
      (await apiPersonal.get<ProductoGestion[]>(`/sedes/${sedeId}/productos`)).data,
    enabled: Boolean(sedeId),
  });

  const guardar = useMutation({
    mutationFn: ({ id, ...datos }: { id: number; precio?: number; disponible?: boolean }) =>
      apiPersonal.put(`/sedes/${sedeId}/productos/${id}`, datos),
    onSuccess: (_r, v) => {
      setError('');
      setGuardado(
        `${productos.data?.find((p) => p.id === v.id)?.nombre ?? 'Producto'} actualizado`,
      );
      void qc.invalidateQueries({ queryKey: ['productos-sede', sedeId] });
    },
    onError: (e) => setError(mensajeError(e)),
  });

  const porCategoria = useMemo(() => {
    const m = new Map<string, ProductoGestion[]>();
    for (const p of productos.data ?? []) {
      if (!p.activo) continue;
      m.set(p.categoria.nombre, [...(m.get(p.categoria.nombre) ?? []), p]);
    }
    return [...m];
  }, [productos.data]);

  const enMenu = productos.data?.filter((p) => p.enMenu).length ?? 0;
  const agotados = productos.data?.filter((p) => p.enMenu && !p.disponible).length ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-3xl">Menú</h1>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-ink-muted">
          <SelectorSede />
          {productos.data && (
            <span>
              {enMenu} productos en el menú, {agotados} agotados. Precios en {moneda}, sin impuesto.
            </span>
          )}
        </div>
      </header>

      {error && <Aviso>{error}</Aviso>}
      {guardado && !error && <Aviso tipo="ok">{guardado}</Aviso>}

      {productos.isLoading ? (
        <Cargando />
      ) : (
        porCategoria.map(([categoria, lista]) => (
          <section
            key={categoria}
            className="overflow-hidden rounded-xl border border-line bg-white"
          >
            <h2 className="border-b border-line bg-canvas/60 px-4 py-2.5 text-base">{categoria}</h2>
            <ul className="divide-y divide-line">
              {lista.map((p) => (
                <FilaProducto
                  key={p.id}
                  p={p}
                  puedeAgregar={!p.esCombo || esAdmin}
                  esAdmin={esAdmin}
                  onError={setError}
                  onGuardar={(d) => guardar.mutate({ id: p.id, ...d })}
                  guardando={guardar.isPending && guardar.variables?.id === p.id}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function FilaProducto({
  p,
  puedeAgregar,
  esAdmin,
  onError,
  onGuardar,
  guardando,
}: {
  p: ProductoGestion;
  puedeAgregar: boolean;
  esAdmin: boolean;
  onError: (m: string) => void;
  onGuardar: (d: { precio?: number; disponible?: boolean }) => void;
  guardando: boolean;
}) {
  const [precio, setPrecio] = useState(p.precio ?? '');
  const cambio = String(precio) !== String(p.precio ?? '') && precio !== '';

  return (
    <li className={cx('flex flex-wrap items-center gap-3 px-4 py-3', !p.enMenu && 'bg-canvas/40')}>
      {esAdmin ? (
        <SubirFoto
          productoId={p.id}
          nombre={p.nombre}
          url={p.imagenUrl}
          icono={p.categoria.icono}
          className="h-12 w-12"
          onError={onError}
        />
      ) : (
        <FotoProducto
          url={p.imagenUrl}
          icono={p.categoria.icono}
          className="h-12 w-12 shrink-0 rounded-lg"
          tamanoIcono="h-5 w-5"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {p.nombre} {p.esCombo && <Insignia color="oro">Combo</Insignia>}{' '}
          {!p.enMenu && <Insignia>No se ofrece aquí</Insignia>}
        </p>
        <p className="truncate text-sm text-ink-muted">{p.descripcion}</p>
      </div>
      {!p.enMenu && !puedeAgregar ? (
        <span className="text-sm text-ink-muted">Lo publica el admin global</span>
      ) : (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (cambio || !p.enMenu) onGuardar({ precio: Number(precio) });
          }}
        >
          <label className="sr-only" htmlFor={`precio-${p.id}`}>
            Precio de {p.nombre}
          </label>
          <input
            id={`precio-${p.id}`}
            className="campo h-9 w-32 text-right tabular-nums"
            inputMode="decimal"
            placeholder={p.enMenu ? '' : 'Precio'}
            value={precio}
            onChange={(e) => setPrecio(e.target.value.replace(',', '.'))}
          />
          {(cambio || !p.enMenu) && (
            <Boton tamano="sm" type="submit" cargando={guardando} disabled={!precio}>
              {p.enMenu ? 'Guardar' : 'Agregar'}
            </Boton>
          )}
        </form>
      )}
      {p.enMenu && (
        <div className="flex w-36 items-center justify-end gap-2 text-sm">
          <span className={p.disponible ? 'text-ok' : 'text-ink-muted'}>
            {p.disponible ? 'Disponible' : 'Agotado'}
          </span>
          <Interruptor
            etiqueta={`Disponibilidad de ${p.nombre}`}
            activo={p.disponible}
            disabled={guardando}
            onChange={(v) => onGuardar({ disponible: v })}
          />
        </div>
      )}
    </li>
  );
}
