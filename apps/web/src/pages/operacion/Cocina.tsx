import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Volume2, VolumeX } from 'lucide-react';
import { EVENTOS, type EstadoPedido } from '@restaurantes/shared';
import { BarraOperacion } from '../../components/BarraOperacion';
import { Aviso, Boton, Cargando, cx } from '../../components/ui';
import { useSedeTrabajo } from '../../lib/consultas';
import { horaDe, minutosDesde } from '../../lib/formato';
import { apiPersonal, mensajeError, usePersonal } from '../../lib/sesion';
import { sonar, useTiempoReal } from '../../lib/socket';
import type { Pedido } from '../../lib/tipos';

const COLUMNAS: {
  estado: EstadoPedido;
  titulo: string;
  siguiente: EstadoPedido;
  accion: string;
}[] = [
  { estado: 'RECIBIDO', titulo: 'Por empezar', siguiente: 'EN_PREPARACION', accion: 'Empezar' },
  { estado: 'EN_PREPARACION', titulo: 'En preparación', siguiente: 'LISTO', accion: 'Listo' },
  { estado: 'LISTO', titulo: 'Listos', siguiente: 'ENTREGADO', accion: 'Entregado' },
];

/** Semáforo de antigüedad: a los 7 min la comanda se pone ámbar y a los 12, roja. */
function semaforo(min: number) {
  if (min >= 12) return { barra: 'bg-danger text-white', texto: 'Atrasado' };
  if (min >= 7) return { barra: 'bg-warn text-ink', texto: 'Apurar' };
  return { barra: 'bg-ink/10 text-ink', texto: '' };
}

export default function Cocina() {
  const { sedeId, sede } = useSedeTrabajo();
  const token = usePersonal((s) => s.token);
  const qc = useQueryClient();
  const [, setPulso] = useState(0);
  const [conSonido, setConSonido] = useState(true);
  const [error, setError] = useState('');

  const activos = useQuery({
    queryKey: ['activos', sedeId],
    queryFn: async () => (await apiPersonal.get<Pedido[]>(`/sedes/${sedeId}/pedidos/activos`)).data,
    enabled: Boolean(sedeId),
  });

  // Los minutos de cada comanda avanzan sin pedir nada al servidor
  useEffect(() => {
    const t = setInterval(() => setPulso((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const refrescar = () => void qc.invalidateQueries({ queryKey: ['activos', sedeId] });
  const conectado = useTiempoReal(
    sedeId ? { token } : null,
    sedeId ? [{ sedeId, canal: 'cocina' }] : [],
    {
      [EVENTOS.pedidoCreado]: () => {
        if (conSonido) sonar('nuevo');
        refrescar();
      },
      [EVENTOS.pedidoActualizado]: refrescar,
    },
  );

  const avanzar = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoPedido }) =>
      apiPersonal.patch(`/pedidos/${id}/estado`, { estado }),
    onSuccess: () => {
      setError('');
      refrescar();
    },
    onError: (e) => {
      setError(mensajeError(e));
      refrescar();
    },
  });

  return (
    <div className="flex min-h-screen flex-col bg-ink">
      <BarraOperacion
        titulo="Cocina"
        conectado={conectado}
        extra={
          <button
            onClick={() => setConSonido(!conSonido)}
            className="text-white/70 hover:text-white"
            aria-label={conSonido ? 'Silenciar avisos' : 'Activar avisos'}
            aria-pressed={conSonido}
          >
            {conSonido ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
        }
      />
      {error && (
        <div className="px-4 pt-3">
          <Aviso>{error}</Aviso>
        </div>
      )}
      {activos.isLoading ? (
        <Cargando className="flex-1 text-white/70" />
      ) : (
        <div className="grid flex-1 gap-4 p-4 lg:grid-cols-3">
          {COLUMNAS.map((col) => {
            const pedidos = (activos.data ?? []).filter((p) => p.estado === col.estado);
            return (
              <section key={col.estado} aria-label={col.titulo} className="flex min-h-0 flex-col">
                <h2 className="mb-3 flex items-baseline justify-between text-white">
                  <span className="text-lg">{col.titulo}</span>
                  <span className="cifra text-3xl text-brand-gold">{pedidos.length}</span>
                </h2>
                <ol className="space-y-3">
                  {pedidos.map((p) => {
                    const min = minutosDesde(p.creadoEn);
                    const s = semaforo(col.estado === 'LISTO' ? 0 : min);
                    return (
                      <li key={p.id} className="comanda animate-entra overflow-hidden rounded-t-lg">
                        <div
                          className={cx(
                            'flex items-center justify-between px-3 py-1.5 text-sm font-semibold',
                            s.barra,
                          )}
                        >
                          <span>
                            {horaDe(p.creadoEn, sede?.zonaHoraria)}, hace {min} min
                          </span>
                          <span>{s.texto || (p.canal === 'KIOSCO' ? 'Kiosco' : 'Caja')}</span>
                        </div>
                        <div className="px-3 pt-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="cifra text-5xl leading-none">{p.codigo}</span>
                            {p.clienteNombre && (
                              <span className="truncate text-sm font-semibold">
                                {p.clienteNombre}
                              </span>
                            )}
                          </div>
                          <ul className="mt-2 space-y-1 border-t border-dashed border-line pt-2">
                            {p.items.map((i) => (
                              <li key={i.id}>
                                <span className="cifra mr-2 text-xl">{i.cantidad}×</span>
                                <span className="font-medium">{i.nombreProducto}</span>
                                {i.notas && (
                                  <span className="ml-1 inline-block rounded bg-brand-gold-soft px-1.5 text-sm font-semibold">
                                    {i.notas}
                                  </span>
                                )}
                                {i.componentes && (
                                  <ul className="ml-8 border-l-2 border-line pl-2 text-sm text-ink-muted">
                                    {i.componentes.map((c) => (
                                      <li key={c.nombre}>
                                        {c.cantidad * i.cantidad} {c.nombre}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ul>
                          <Boton
                            className="mt-3 w-full"
                            tamano="lg"
                            variante={
                              col.estado === 'LISTO'
                                ? 'secundario'
                                : col.estado === 'EN_PREPARACION'
                                  ? 'oro'
                                  : 'primario'
                            }
                            cargando={avanzar.isPending && avanzar.variables?.id === p.id}
                            onClick={() => avanzar.mutate({ id: p.id, estado: col.siguiente })}
                          >
                            {col.accion}
                          </Boton>
                        </div>
                      </li>
                    );
                  })}
                  {pedidos.length === 0 && (
                    <li className="rounded-lg border border-dashed border-white/15 py-8 text-center text-sm text-white/40">
                      Sin comandas
                    </li>
                  )}
                </ol>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
