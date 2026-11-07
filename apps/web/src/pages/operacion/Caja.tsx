import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HandPlatter } from 'lucide-react';
import { EVENTOS } from '@restaurantes/shared';
import { BarraOperacion } from '../../components/BarraOperacion';
import { TomaPedido, type DatosPedido } from '../../components/TomaPedido';
import { Boton, Cargando, Modal, Vacio } from '../../components/ui';
import { useSedeTrabajo } from '../../lib/consultas';
import { dinero } from '../../lib/formato';
import { apiPersonal, apiPublica, mensajeError, usePersonal } from '../../lib/sesion';
import { sonar, useTiempoReal } from '../../lib/socket';
import type { Menu, Pedido } from '../../lib/tipos';

export default function Caja() {
  const { sedeId } = useSedeTrabajo();
  const token = usePersonal((s) => s.token);
  const qc = useQueryClient();
  const [creado, setCreado] = useState<Pedido | null>(null);
  const [error, setError] = useState('');

  const menu = useQuery({
    queryKey: ['menu', sedeId],
    queryFn: async () => (await apiPublica.get<Menu>(`/menu?sedeId=${sedeId}`)).data,
    enabled: Boolean(sedeId),
    refetchInterval: 60_000, // promociones por horario
  });
  const activos = useQuery({
    queryKey: ['activos', sedeId],
    queryFn: async () => (await apiPersonal.get<Pedido[]>(`/sedes/${sedeId}/pedidos/activos`)).data,
    enabled: Boolean(sedeId),
  });
  const listos = (activos.data ?? []).filter((p) => p.estado === 'LISTO');

  const conectado = useTiempoReal(
    sedeId ? { token } : null,
    sedeId ? [{ sedeId, canal: 'caja' }] : [],
    {
      [EVENTOS.pedidoCreado]: () => void qc.invalidateQueries({ queryKey: ['activos', sedeId] }),
      [EVENTOS.menuActualizado]: () => void qc.invalidateQueries({ queryKey: ['menu', sedeId] }),
      [EVENTOS.pedidoActualizado]: (p: Pedido) => {
        if (p.estado === 'LISTO') sonar('nuevo');
        void qc.invalidateQueries({ queryKey: ['activos', sedeId] });
      },
    },
  );

  const crear = useMutation({
    mutationFn: async (d: DatosPedido) =>
      (await apiPersonal.post<Pedido>('/pedidos', { ...d, sedeId, canal: 'CAJA' })).data,
  });
  const entregar = useMutation({
    mutationFn: (id: string) => apiPersonal.patch(`/pedidos/${id}/estado`, { estado: 'ENTREGADO' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['activos', sedeId] }),
  });

  return (
    <div className="flex h-screen flex-col">
      <BarraOperacion titulo="Caja" conectado={conectado} />
      {menu.isLoading || !menu.data ? (
        <Cargando className="flex-1" />
      ) : (
        <TomaPedido
          menu={menu.data}
          modo="caja"
          enviando={crear.isPending}
          error={error}
          onEnviar={(d, limpiar) => {
            setError('');
            crear.mutate(d, {
              onSuccess: (p) => {
                setCreado(p);
                limpiar();
              },
              onError: (e) => setError(mensajeError(e)),
            });
          }}
          arriba={
            <section aria-label="Listos para entregar" className="mb-5">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-muted">
                <HandPlatter className="h-4 w-4" aria-hidden /> Listos para entregar
              </h2>
              {listos.length === 0 ? (
                <Vacio
                  titulo="Nada por entregar"
                  texto="Aquí aparecen los pedidos que cocina marca como listos."
                />
              ) : (
                <ul className="flex gap-2 overflow-x-auto pb-1">
                  {listos.map((p) => (
                    <li
                      key={p.id}
                      className="flex shrink-0 items-center gap-3 rounded-xl bg-brand-gold px-3 py-2"
                    >
                      <span className="cifra text-3xl leading-none">{p.codigo}</span>
                      <span className="max-w-28 truncate text-sm font-medium">
                        {p.clienteNombre ?? `${p.items.length} productos`}
                      </span>
                      <Boton
                        tamano="sm"
                        variante="secundario"
                        cargando={entregar.isPending && entregar.variables === p.id}
                        onClick={() => entregar.mutate(p.id)}
                      >
                        Entregar
                      </Boton>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          }
        />
      )}

      <Modal
        abierto={Boolean(creado)}
        onCerrar={() => setCreado(null)}
        titulo="Pedido enviado a cocina"
      >
        {creado && (
          <div className="text-center">
            <p className="text-ink-muted">Entrégale este número al cliente</p>
            <p className="cifra my-2 text-[7rem] leading-none text-brand-red">{creado.codigo}</p>
            <p className="text-lg">
              {dinero(creado.total, creado.moneda)} con {creado.metodoPago.toLowerCase()}
            </p>
            {Number(creado.descuento) > 0 && (
              <p className="mt-1 text-sm font-semibold text-brand-red">
                Incluye {dinero(creado.descuento, creado.moneda)} de descuento por promociones
              </p>
            )}
            <Boton className="mt-6 w-full" tamano="lg" autoFocus onClick={() => setCreado(null)}>
              Nuevo pedido
            </Boton>
          </div>
        )}
      </Modal>
    </div>
  );
}
