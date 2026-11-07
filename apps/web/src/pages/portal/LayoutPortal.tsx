import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { BellRing, X } from 'lucide-react';
import { EVENTOS } from '@restaurantes/shared';
import { cx, Marca } from '../../components/ui';
import { cerrarSesionCliente, renovarCliente, useCliente } from '../../lib/sesion';
import { sonar, useTiempoReal } from '../../lib/socket';
import { useConfiguracion } from '../../lib/configuracion';

let restaurando: Promise<unknown> | null = null;

export function useSesionCliente() {
  const { lista, cliente, token } = useCliente();
  useEffect(() => {
    if (!lista) restaurando ??= renovarCliente();
  }, [lista]);
  return { lista, cliente, token };
}

interface Notificacion {
  id: string;
  tipo: string;
  mensaje: string;
}

export default function LayoutPortal() {
  const { cliente, token } = useSesionCliente();
  const reservas = useConfiguracion((c) => c.reservasHabilitadas);
  const [aviso, setAviso] = useState<Notificacion | null>(null);

  // Avisos en vivo del cliente con sesión (confirmaciones, mesa lista…)
  useTiempoReal(token ? { token } : null, [], {
    [EVENTOS.notificacion]: (n: Notificacion) => {
      setAviso(n);
      if (n.tipo === 'MESA_LISTA') {
        sonar('listo');
        navigator.vibrate?.([200, 100, 200]);
      }
    },
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
          <Link to="/portal" aria-label="Inicio del portal">
            <Marca />
          </Link>
          <nav
            className="ml-auto flex items-center gap-1 text-sm font-semibold"
            aria-label="Portal"
          >
            <NavLink
              to="/portal"
              end
              className={({ isActive }) =>
                cx(
                  'rounded-lg px-3 py-2',
                  isActive ? 'text-brand-red' : 'text-ink-muted hover:text-ink',
                )
              }
            >
              {reservas ? 'Reservar' : 'Sedes'}
            </NavLink>
            {cliente ? (
              <>
                {reservas && (
                  <NavLink
                    to="/portal/mis-reservas"
                    className={({ isActive }) =>
                      cx(
                        'rounded-lg px-3 py-2',
                        isActive ? 'text-brand-red' : 'text-ink-muted hover:text-ink',
                      )
                    }
                  >
                    Mis reservas
                  </NavLink>
                )}
                <button
                  onClick={() => void cerrarSesionCliente()}
                  className="rounded-lg px-3 py-2 text-ink-muted hover:text-ink"
                >
                  Salir
                </button>
              </>
            ) : (
              <NavLink to="/portal/entrar" className="rounded-lg bg-ink px-3 py-2 text-white">
                Entrar
              </NavLink>
            )}
          </nav>
        </div>
      </header>

      {aviso && (
        <div
          role="status"
          className={cx(
            'animate-entra',
            aviso.tipo === 'MESA_LISTA' ? 'bg-brand-gold' : 'bg-ink text-white',
          )}
        >
          <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
            <BellRing className="h-5 w-5 shrink-0" aria-hidden />
            <p className="flex-1 font-semibold">{aviso.mensaje}</p>
            <button onClick={() => setAviso(null)} aria-label="Cerrar aviso">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-4xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
