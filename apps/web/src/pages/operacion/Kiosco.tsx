import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { EVENTOS } from '@restaurantes/shared';
import { TomaPedido, type DatosPedido } from '../../components/TomaPedido';
import { Boton, Cargando, Marca } from '../../components/ui';
import { dinero } from '../../lib/formato';
import { apiDispositivo, apiPublica, mensajeError, useDispositivo } from '../../lib/sesion';
import { useTiempoReal } from '../../lib/socket';
import type { Menu, Pedido } from '../../lib/tipos';

const SEGUNDOS_CONFIRMACION = 12;

/** Kiosco de autoservicio: el cliente arma su pedido; la sede sale del token del equipo. */
export default function Kiosco() {
  const dispositivo = useDispositivo((s) => s.dispositivo)!;
  const token = useDispositivo((s) => s.token);
  const [creado, setCreado] = useState<Pedido | null>(null);
  const [error, setError] = useState('');
  const [restante, setRestante] = useState(SEGUNDOS_CONFIRMACION);

  const menu = useQuery({
    queryKey: ['menu', dispositivo.sede.id],
    queryFn: async () => (await apiPublica.get<Menu>(`/menu?sedeId=${dispositivo.sede.id}`)).data,
    // Las promociones con horario empiezan y terminan solas: se revisa cada minuto
    refetchInterval: 60_000,
  });
  // Conexión en vivo: marca el kiosco "en línea" en el dashboard, recarga el menú cuando el
  // admin cambia precios o promociones, y lo desvincula al instante si lo desactivan.
  useTiempoReal({ deviceToken: token }, [{ sedeId: dispositivo.sede.id, canal: 'pantalla' }], {
    [EVENTOS.menuActualizado]: () => void menu.refetch(),
  });
  const crear = useMutation({
    mutationFn: async (d: DatosPedido) => (await apiDispositivo.post<Pedido>('/pedidos', d)).data,
  });

  // La confirmación se cierra sola para el siguiente cliente
  useEffect(() => {
    if (!creado) return;
    setRestante(SEGUNDOS_CONFIRMACION);
    const t = setInterval(() => setRestante((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [creado]);
  useEffect(() => {
    if (creado && restante <= 0) setCreado(null);
  }, [restante, creado]);

  if (creado) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-brand-red p-8 text-center text-white">
        <p className="text-2xl">
          Gracias{creado.clienteNombre ? `, ${creado.clienteNombre}` : ''}. Tu número es
        </p>
        <p className="cifra my-4 text-[min(40vw,16rem)] leading-none text-brand-gold">
          {creado.codigo}
        </p>
        <p className="max-w-lg text-xl text-white/80">
          Te llamamos en la pantalla cuando esté listo. Total {dinero(creado.total, creado.moneda)}.
        </p>
        <Boton variante="oro" tamano="lg" className="mt-10" onClick={() => setCreado(null)}>
          Hacer otro pedido ({restante})
        </Boton>
      </main>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between bg-brand-red px-6 py-4 text-white">
        <Marca claro />
        <p className="text-lg font-semibold">{dispositivo.sede.nombre}</p>
      </header>
      {menu.isLoading || !menu.data ? (
        <Cargando className="flex-1" />
      ) : (
        <TomaPedido
          menu={menu.data}
          modo="kiosco"
          enviando={crear.isPending}
          error={error}
          onEnviar={(d, limpiar) => {
            setError('');
            crear.mutate(d, {
              onSuccess: (p) => {
                limpiar();
                setCreado(p);
              },
              onError: (e) => setError(mensajeError(e)),
            });
          }}
        />
      )}
    </div>
  );
}
