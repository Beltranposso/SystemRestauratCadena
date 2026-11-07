import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Maximize } from 'lucide-react';
import { EVENTOS } from '@restaurantes/shared';
import { cx, EnVivo, Marca } from '../../components/ui';
import { apiDispositivo, useDispositivo } from '../../lib/sesion';
import { sonar, useTiempoReal } from '../../lib/socket';
import type { PedidoPantalla } from '../../lib/tipos';

/**
 * Pantalla para el televisor del local. Números grandes, legibles a varios metros.
 * Cuando un pedido pasa a LISTO suena un aviso y el número destella en dorado.
 */
export default function Pantalla() {
  const { token, dispositivo } = useDispositivo();
  const sedeId = dispositivo!.sede.id;
  const qc = useQueryClient();
  const [recientes, setRecientes] = useState<Set<string>>(new Set());
  const [sonidoActivo, setSonidoActivo] = useState(false);
  const sonidoRef = useRef(false);
  sonidoRef.current = sonidoActivo;

  const datos = useQuery({
    queryKey: ['pantalla', sedeId],
    queryFn: async () =>
      (
        await apiDispositivo.get<{ preparando: PedidoPantalla[]; listos: PedidoPantalla[] }>(
          `/pantalla/${sedeId}/pedidos`,
        )
      ).data,
    refetchInterval: 60_000, // red de seguridad si se pierde algún evento
  });

  const refrescar = () => void qc.invalidateQueries({ queryKey: ['pantalla', sedeId] });
  const conectado = useTiempoReal({ deviceToken: token }, [{ sedeId, canal: 'pantalla' }], {
    [EVENTOS.pedidoCreado]: refrescar,
    [EVENTOS.pedidoActualizado]: (p: PedidoPantalla) => {
      if (p.estado === 'LISTO') {
        setRecientes((r) => new Set(r).add(p.id));
        setTimeout(() => setRecientes((r) => (r.delete(p.id), new Set(r))), 8_000);
        if (sonidoRef.current) sonar('listo');
      }
      refrescar();
    },
  });

  // Los navegadores solo permiten audio después de un toque: el primero lo habilita
  useEffect(() => {
    const habilitar = () => setSonidoActivo(true);
    window.addEventListener('pointerdown', habilitar, { once: true });
    return () => window.removeEventListener('pointerdown', habilitar);
  }, []);

  const preparando = datos.data?.preparando ?? [];
  const listos = datos.data?.listos ?? [];

  return (
    <main className="grid h-screen grid-rows-[auto_1fr] bg-ink text-white">
      <header className="flex items-center justify-between px-8 py-4">
        <Marca claro />
        <div className="flex items-center gap-6">
          <span className="text-white/60">{dispositivo!.sede.nombre}</span>
          <EnVivo conectado={conectado} claro />
          <button
            onClick={() => void document.documentElement.requestFullscreen?.()}
            className="text-white/50 hover:text-white"
            aria-label="Pantalla completa"
          >
            <Maximize className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-[2fr_3fr]">
        <section
          aria-label="Preparando"
          className="min-h-0 overflow-hidden border-r border-white/10 px-8 py-6"
        >
          <h2 className="text-[clamp(1.5rem,2.6vw,2.5rem)] text-white/60">Preparando</h2>
          <ul className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3">
            {preparando.map((p) => (
              <li
                key={p.id}
                className="cifra whitespace-nowrap text-[clamp(2.5rem,5vw,5.5rem)] leading-none text-white/85"
              >
                {p.codigo}
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-label="Listo para recoger"
          className="min-h-0 overflow-hidden bg-brand-red px-8 py-6"
        >
          <h2 className="text-[clamp(1.5rem,2.6vw,2.5rem)]">Listo, acércate a recoger</h2>
          <ul className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-3" aria-live="polite">
            {listos.map((p) => (
              <li
                key={p.id}
                className={cx(
                  'rounded-2xl px-4 py-3',
                  recientes.has(p.id) ? 'animate-destello bg-brand-gold text-ink' : 'bg-white/10',
                )}
              >
                <span
                  className={cx(
                    'cifra block whitespace-nowrap text-[clamp(3rem,6vw,7.5rem)] leading-none',
                    recientes.has(p.id) ? 'text-ink' : 'text-brand-gold',
                  )}
                >
                  {p.codigo}
                </span>
                {p.clienteNombre && (
                  <span className="mt-1 block truncate text-[clamp(1rem,1.6vw,1.5rem)] font-semibold">
                    {p.clienteNombre}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {listos.length === 0 && (
            <p className="mt-10 text-2xl text-white/60">
              Aquí aparece tu número cuando esté listo.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
