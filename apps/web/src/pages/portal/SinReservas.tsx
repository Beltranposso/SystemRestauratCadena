import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { Boton, Cargando } from '../../components/ui';
import { useConfiguracion } from '../../lib/configuracion';

/** Envuelve las vistas de reservas: si la cadena no las ofrece, muestra la alternativa (la fila). */
export function SoloConReservas({ children }: { children: ReactNode }) {
  const { reservasHabilitadas, cargada } = useConfiguracion();
  if (!cargada) return <Cargando />;
  if (reservasHabilitadas) return <>{children}</>;
  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <Users className="mx-auto h-10 w-10 text-brand-red" aria-hidden />
      <h1 className="mt-4 text-3xl">No recibimos reservas de mesa</h1>
      <p className="mt-2 text-ink-muted">
        Anótate en la fila desde tu celular y te avisamos cuando tu mesa esté lista.
      </p>
      <Link to="/portal">
        <Boton className="mt-6">Ver sedes y anotarme</Boton>
      </Link>
    </div>
  );
}
