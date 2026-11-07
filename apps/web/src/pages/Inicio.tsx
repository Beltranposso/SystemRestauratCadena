import { Link } from 'react-router-dom';
import {
  CalendarCheck,
  ChefHat,
  LayoutDashboard,
  MonitorPlay,
  ReceiptText,
  Tablet,
  UsersRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Marca } from '../components/ui';

interface Acceso {
  a: string;
  icono: ReactNode;
  nombre: string;
  texto: string;
}

const GRUPOS: { titulo: string; accesos: Acceso[] }[] = [
  {
    titulo: 'Gerencia',
    accesos: [
      {
        a: '/admin',
        icono: <LayoutDashboard />,
        nombre: 'Dashboard',
        texto: 'Ventas de toda la cadena por país, ciudad y sede; mesas, turnos y menú.',
      },
    ],
  },
  {
    titulo: 'En la sede',
    accesos: [
      {
        a: '/caja',
        icono: <ReceiptText />,
        nombre: 'Caja',
        texto: 'Toma pedidos, cobra y entrega los que cocina marcó como listos.',
      },
      {
        a: '/cocina',
        icono: <ChefHat />,
        nombre: 'Cocina',
        texto: 'Comandas en orden de llegada con el tiempo de cada una.',
      },
      {
        a: '/pantalla',
        icono: <MonitorPlay />,
        nombre: 'Pantalla de pedidos',
        texto: 'Para el televisor del local: qué se prepara y qué ya está listo.',
      },
      {
        a: '/kiosco',
        icono: <Tablet />,
        nombre: 'Kiosco',
        texto: 'El cliente arma y paga su pedido sin pasar por caja.',
      },
    ],
  },
  {
    titulo: 'Clientes',
    accesos: [
      {
        a: '/portal',
        icono: <CalendarCheck />,
        nombre: 'Portal de clientes',
        texto: 'Sedes y fila de espera; reservas de mesa si están activas en Configuración.',
      },
      {
        a: '/portal/fila/1',
        icono: <UsersRound />,
        nombre: 'Fila de espera',
        texto: 'Anotarse sin reserva y seguir el turno desde el celular.',
      },
    ],
  },
];

export default function Inicio() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-10 sm:py-16">
      <header className="mb-12 grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <Marca />
          <h1 className="mt-6 max-w-xl text-4xl leading-[1.05] sm:text-5xl">
            Todas las sedes de la cadena, en una sola plataforma.
          </h1>
        </div>
        <p className="max-w-xs text-ink-muted">
          Elige la pantalla que vas a usar. Cada una pide su propio acceso.
        </p>
      </header>

      <div className="grid gap-10 md:grid-cols-3">
        {GRUPOS.map((g) => (
          <section key={g.titulo} aria-labelledby={`g-${g.titulo}`}>
            <h2 id={`g-${g.titulo}`} className="mb-3 border-b-2 border-ink pb-2 text-lg">
              {g.titulo}
            </h2>
            <ul className="divide-y divide-line">
              {g.accesos.map((acc) => (
                <li key={acc.a}>
                  <Link to={acc.a} className="group flex gap-3 py-4 focus-visible:outline-offset-4">
                    <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-brand-red ring-1 ring-line transition-colors group-hover:bg-brand-red group-hover:text-white [&>svg]:h-5 [&>svg]:w-5">
                      {acc.icono}
                    </span>
                    <span>
                      <span className="block font-semibold group-hover:text-brand-red">
                        {acc.nombre}
                      </span>
                      <span className="block text-sm text-ink-muted">{acc.texto}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
