import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Minus, Package, Plus, Tag, Trash2 } from 'lucide-react';
import { aplicarPromociones, type MetodoPago } from '@restaurantes/shared';
import type { Menu, ProductoMenu } from '../lib/tipos';
import { dinero } from '../lib/formato';
import { Aviso, Boton, cx, Segmentos } from './ui';
import { ICONOS } from './iconos';
import { FotoProducto } from './FotoProducto';

export { ICONOS };

export interface Linea {
  clave: string;
  producto: ProductoMenu;
  cantidad: number;
  notas: string;
}

export interface DatosPedido {
  items: { productoId: number; cantidad: number; notas?: string }[];
  metodoPago: MetodoPago;
  clienteNombre?: string;
}

const PAGOS: { valor: MetodoPago; texto: string }[] = [
  { valor: 'TARJETA', texto: 'Tarjeta' },
  { valor: 'EFECTIVO', texto: 'Efectivo' },
  { valor: 'TRANSFERENCIA', texto: 'Transferencia' },
];

/** Categoría virtual con todo lo que tiene promoción hoy (va primero). */
const ID_PROMOS = -1;

/** "1 Hamburguesa Clásica, 1 Papas Medianas y 1 Gaseosa Mediana" */
export function contenidoCombo(componentes: { nombre: string; cantidad: number }[]) {
  const partes = componentes.map((c) => `${c.cantidad} ${c.nombre}`);
  return partes.length > 1
    ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
    : (partes[0] ?? '');
}

/**
 * Toma de pedidos compartida por la caja y el kiosco: categorías, productos y comanda.
 * Los descuentos se calculan con la misma regla que usa la API (paquete shared), así que el
 * total mostrado coincide con el cobrado; aun así, el definitivo lo calcula el servidor.
 */
export function TomaPedido({
  menu,
  modo,
  enviando,
  error,
  onEnviar,
  arriba,
}: {
  menu: Menu;
  modo: 'caja' | 'kiosco';
  enviando: boolean;
  error?: string;
  onEnviar: (d: DatosPedido, limpiar: () => void) => void;
  arriba?: ReactNode;
}) {
  const grande = modo === 'kiosco';

  const categorias = useMemo(() => {
    const conPromo = menu.categorias.flatMap((c) => c.productos.filter((p) => p.promocion));
    return conPromo.length
      ? [{ id: ID_PROMOS, nombre: 'Promos', icono: 'tag', productos: conPromo }, ...menu.categorias]
      : menu.categorias;
  }, [menu]);
  const iconoDe = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of menu.categorias) m.set(c.id, c.icono);
    return m;
  }, [menu]);
  /** Producto vigente por id: si el menú se recarga, la comanda usa el precio y la promo nuevos */
  const vigentes = useMemo(
    () => new Map(menu.categorias.flatMap((c) => c.productos).map((p) => [p.id, p])),
    [menu],
  );

  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('TARJETA');
  const [nombre, setNombre] = useState('');
  const [editandoNota, setEditandoNota] = useState<string | null>(null);

  // Si desaparece la categoría elegida (p. ej. terminó la última promo), vuelve a la primera
  useEffect(() => {
    if (!categorias.some((c) => c.id === categoriaId)) setCategoriaId(categorias[0]?.id);
  }, [categorias, categoriaId]);

  const categoria = categorias.find((c) => c.id === categoriaId) ?? categorias[0];
  const moneda = menu.sede.moneda;

  const actuales = lineas.map((l) => ({ ...l, vigente: vigentes.get(l.producto.id) }));
  const vendibles = actuales.filter((l) => l.vigente);
  const descuentos = aplicarPromociones(
    vendibles.map((l) => ({
      productoId: l.vigente!.id,
      categoriaId: l.vigente!.categoriaId,
      precio: l.vigente!.precio,
      cantidad: l.cantidad,
    })),
    menu.promociones,
  );
  const descuentoDe = new Map(vendibles.map((l, i) => [l.clave, descuentos[i]!]));
  const bruto = vendibles.reduce((a, l) => a + Number(l.vigente!.precio) * l.cantidad, 0);
  const descuento = descuentos.reduce((a, d) => a + d.descuento, 0);
  const subtotal = Math.round((bruto - descuento) * 100) / 100;
  const impuesto = Math.round(subtotal * Number(menu.sede.tasaImpuesto) * 100) / 100;
  const hayAgotados = actuales.some((l) => !l.vigente);

  const unidades = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of lineas) m.set(l.producto.id, (m.get(l.producto.id) ?? 0) + l.cantidad);
    return m;
  }, [lineas]);

  const agregar = (p: ProductoMenu) =>
    setLineas((ls) => {
      const existente = ls.find((l) => l.producto.id === p.id && !l.notas);
      if (existente)
        return ls.map((l) => (l === existente ? { ...l, cantidad: l.cantidad + 1 } : l));
      return [...ls, { clave: `${p.id}-${Date.now()}`, producto: p, cantidad: 1, notas: '' }];
    });
  const cambiarCantidad = (clave: string, delta: number) =>
    setLineas((ls) =>
      ls
        .map((l) => (l.clave === clave ? { ...l, cantidad: l.cantidad + delta } : l))
        .filter((l) => l.cantidad > 0),
    );
  const limpiar = () => {
    setLineas([]);
    setNombre('');
    setMetodoPago('TARJETA');
  };

  const enviar = () =>
    onEnviar(
      {
        items: lineas.map((l) => ({
          productoId: l.producto.id,
          cantidad: l.cantidad,
          notas: l.notas || undefined,
        })),
        metodoPago,
        clienteNombre: nombre.trim() || undefined,
      },
      limpiar,
    );

  return (
    <div className={cx('grid min-h-0 flex-1 gap-0 lg:grid-cols-[auto_1fr_minmax(320px,380px)]')}>
      {/* Categorías */}
      <nav
        aria-label="Categorías"
        className="flex gap-1 overflow-x-auto border-b border-line bg-white p-2 lg:flex-col lg:border-b-0 lg:border-r"
      >
        {categorias.map((c) => {
          const Icono = ICONOS[c.icono] ?? Package;
          const activa = c.id === categoria?.id;
          const promos = c.id === ID_PROMOS;
          return (
            <button
              key={c.id}
              onClick={() => setCategoriaId(c.id)}
              aria-current={activa}
              className={cx(
                'flex shrink-0 flex-col items-center gap-1 rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors lg:w-24',
                grande && 'lg:w-32 lg:py-4 lg:text-sm',
                activa
                  ? promos
                    ? 'bg-brand-gold text-ink'
                    : 'bg-brand-red text-white'
                  : promos
                    ? 'bg-brand-gold-soft text-ink hover:bg-brand-gold/60'
                    : 'text-ink-muted hover:bg-canvas hover:text-ink',
              )}
            >
              <Icono className={grande ? 'h-7 w-7' : 'h-5 w-5'} aria-hidden />
              {c.nombre}
            </button>
          );
        })}
      </nav>

      {/* Productos */}
      <section className="min-h-0 overflow-y-auto p-4" aria-label={categoria?.nombre}>
        {arriba}
        <h2 className={cx('mb-3', grande ? 'text-3xl' : 'text-xl')}>
          {categoria?.id === ID_PROMOS ? 'Promociones de hoy' : categoria?.nombre}
        </h2>
        {categoria?.id === ID_PROMOS && (
          <ul className={cx('mb-4 flex flex-wrap gap-2', grande ? 'text-base' : 'text-sm')}>
            {menu.promociones.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-brand-gold bg-brand-gold-soft/50 px-3 py-1.5"
              >
                <span className="font-semibold">{p.nombre}</span>
                {p.descripcion && <span className="text-ink-muted">. {p.descripcion}</span>}
              </li>
            ))}
          </ul>
        )}
        <div
          className={cx(
            'grid gap-3',
            grande ? 'grid-cols-2 xl:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 2xl:grid-cols-4',
          )}
        >
          {categoria?.productos.map((p) => (
            <TarjetaProducto
              key={p.id}
              p={p}
              icono={iconoDe.get(p.categoriaId) ?? 'package'}
              grande={grande}
              moneda={moneda}
              unidades={unidades.get(p.id)}
              onAgregar={() => agregar(p)}
            />
          ))}
        </div>
      </section>

      {/* Comanda */}
      <aside
        aria-label="Pedido"
        className="flex min-h-0 flex-col border-t border-line bg-canvas p-3 lg:border-l lg:border-t-0"
      >
        <div className="comanda flex min-h-0 flex-1 flex-col rounded-t-xl shadow-sm">
          <div className="flex items-baseline justify-between border-b border-dashed border-line px-4 py-3">
            <h2 className="text-lg">{grande ? 'Tu pedido' : 'Pedido'}</h2>
            {lineas.length > 0 && (
              <button
                onClick={limpiar}
                className="flex items-center gap-1 text-sm text-ink-muted hover:text-danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Vaciar
              </button>
            )}
          </div>

          <ul className="min-h-24 flex-1 divide-y divide-dashed divide-line overflow-y-auto px-4">
            {lineas.length === 0 && (
              <li className="py-8 text-center text-sm text-ink-muted">
                {grande ? 'Toca un producto para agregarlo.' : 'Agrega productos desde el menú.'}
              </li>
            )}
            {actuales.map((l) => {
              const p = l.vigente ?? l.producto;
              const d = descuentoDe.get(l.clave);
              const importe = Number(p.precio) * l.cantidad;
              return (
                <li key={l.clave} className={cx('py-2.5', !l.vigente && 'opacity-60')}>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-lg border border-line">
                      <button
                        className="p-1.5 hover:bg-canvas"
                        aria-label={`Quitar uno de ${p.nombre}`}
                        onClick={() => cambiarCantidad(l.clave, -1)}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center font-semibold tabular-nums">
                        {l.cantidad}
                      </span>
                      <button
                        className="p-1.5 hover:bg-canvas"
                        aria-label={`Agregar otro ${p.nombre}`}
                        disabled={!l.vigente}
                        onClick={() => cambiarCantidad(l.clave, 1)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.nombre}</span>
                    <span className="text-right text-sm tabular-nums">
                      {d?.descuento ? (
                        <>
                          <s className="block text-xs text-ink-muted">{dinero(importe, moneda)}</s>
                          {dinero(importe - d.descuento, moneda)}
                        </>
                      ) : (
                        dinero(importe, moneda)
                      )}
                    </span>
                  </div>
                  {p.esCombo && p.componentes.length > 0 && (
                    <p className="mt-1 text-xs text-ink-muted">{contenidoCombo(p.componentes)}</p>
                  )}
                  {d?.promocion && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-brand-red">
                      <Tag className="h-3 w-3" aria-hidden />
                      {d.promocion.nombre}: −{dinero(d.descuento, moneda)}
                    </p>
                  )}
                  {!l.vigente && (
                    <p className="mt-1 text-xs font-semibold text-danger">
                      Se agotó. Quítalo para continuar.
                    </p>
                  )}
                  {editandoNota === l.clave ? (
                    <input
                      autoFocus
                      className="campo mt-1.5 h-8 py-1 text-sm"
                      placeholder="Ej. sin cebolla"
                      maxLength={200}
                      value={l.notas}
                      onChange={(e) =>
                        setLineas((ls) =>
                          ls.map((x) =>
                            x.clave === l.clave ? { ...x, notas: e.target.value } : x,
                          ),
                        )
                      }
                      onBlur={() => setEditandoNota(null)}
                      onKeyDown={(e) => e.key === 'Enter' && setEditandoNota(null)}
                    />
                  ) : (
                    <button
                      onClick={() => setEditandoNota(l.clave)}
                      className="mt-1 text-xs text-ink-muted hover:text-ink"
                    >
                      {l.notas ? <span className="italic">“{l.notas}”</span> : 'Agregar nota'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          <dl className="space-y-1 border-t border-dashed border-line px-4 py-3 text-sm">
            <div className="flex justify-between text-ink-muted">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{dinero(bruto, moneda)}</dd>
            </div>
            {descuento > 0 && (
              <div className="flex justify-between font-semibold text-brand-red">
                <dt>Promociones</dt>
                <dd className="tabular-nums">−{dinero(descuento, moneda)}</dd>
              </div>
            )}
            <div className="flex justify-between text-ink-muted">
              <dt>Impuesto ({Math.round(Number(menu.sede.tasaImpuesto) * 100)} %)</dt>
              <dd className="tabular-nums">{dinero(impuesto, moneda)}</dd>
            </div>
            <div className="flex items-baseline justify-between pt-1">
              <dt className="font-semibold">Total</dt>
              <dd className="cifra text-3xl">{dinero(subtotal + impuesto, moneda)}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-3 pt-4">
          <input
            className="campo"
            placeholder={grande ? '¿A nombre de quién?' : 'Nombre del cliente (opcional)'}
            value={nombre}
            maxLength={80}
            onChange={(e) => setNombre(e.target.value)}
          />
          <Segmentos
            etiqueta="Método de pago"
            valor={metodoPago}
            onChange={setMetodoPago}
            opciones={PAGOS}
          />
          {error && <Aviso>{error}</Aviso>}
          <Boton
            tamano="lg"
            className="w-full"
            disabled={!lineas.length || hayAgotados}
            cargando={enviando}
            onClick={enviar}
          >
            {grande ? 'Pagar y pedir' : 'Cobrar y enviar a cocina'}
          </Boton>
        </div>
      </aside>
    </div>
  );
}

function TarjetaProducto({
  p,
  icono,
  grande,
  moneda,
  unidades,
  onAgregar,
}: {
  p: ProductoMenu;
  icono: string;
  grande: boolean;
  moneda: string;
  unidades?: number;
  onAgregar: () => void;
}) {
  const precio = Number(p.precio);
  const conPromo = p.promocion?.precioConPromocion ?? null;
  const efectivo = conPromo ?? precio;
  const ahorroCombo =
    p.esCombo && p.precioSuelto && p.precioSuelto > efectivo ? p.precioSuelto - efectivo : 0;

  return (
    <button
      onClick={onAgregar}
      className={cx(
        'group relative flex flex-col rounded-xl border-2 bg-white p-3 text-left transition-colors hover:border-brand-red',
        unidades ? 'border-brand-red' : 'border-transparent shadow-[0_1px_0_#E7E2DC]',
        grande && 'p-4',
      )}
    >
      <span className={cx('relative mb-3 block w-full', grande ? 'h-36' : 'h-20')}>
        <FotoProducto
          url={p.imagenUrl}
          icono={icono}
          className="h-full w-full rounded-lg"
          tamanoIcono={grande ? 'h-12 w-12' : 'h-7 w-7'}
        />
        {p.promocion && (
          <span
            className={cx(
              'absolute left-0 top-2 rounded-r-md bg-brand-red px-2 py-0.5 font-display font-bold uppercase tracking-wide text-white',
              grande ? 'text-sm' : 'text-[11px]',
            )}
          >
            {p.promocion.etiqueta}
          </span>
        )}
      </span>
      <span className={cx('font-semibold leading-tight', grande && 'text-lg')}>{p.nombre}</span>
      {p.esCombo ? (
        <span className={cx('mt-1 text-ink-muted', grande ? 'text-sm' : 'line-clamp-2 text-xs')}>
          Incluye {contenidoCombo(p.componentes)}
        </span>
      ) : (
        grande && <span className="mt-1 line-clamp-2 text-sm text-ink-muted">{p.descripcion}</span>
      )}
      <span className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-2">
        <span
          className={cx(
            'font-display font-bold tabular-nums',
            grande ? 'text-xl' : 'text-base',
            conPromo !== null && 'text-brand-red',
          )}
        >
          {dinero(efectivo, moneda)}
        </span>
        {conPromo !== null && (
          <s className="text-sm text-ink-muted tabular-nums">{dinero(precio, moneda)}</s>
        )}
      </span>
      {ahorroCombo > 0 && (
        <span className={cx('font-semibold text-ok', grande ? 'text-sm' : 'text-xs')}>
          Ahorras {dinero(ahorroCombo, moneda)}
        </span>
      )}
      {p.promocion?.tipo === 'LLEVA_PAGA' && (
        <span className={cx('font-semibold text-brand-red', grande ? 'text-sm' : 'text-xs')}>
          {p.promocion.nombre}
        </span>
      )}
      {unidades ? (
        <span className="cifra absolute right-2 top-2 grid h-7 min-w-7 place-items-center rounded-full bg-brand-red px-1.5 text-sm text-white">
          {unidades}
        </span>
      ) : null}
    </button>
  );
}
