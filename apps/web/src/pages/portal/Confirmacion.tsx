import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Aviso, Boton, Cargando } from '../../components/ui';
import { ComprobanteReserva } from '../../components/ComprobanteReserva';
import { apiCliente, mensajeError } from '../../lib/sesion';
import type { Reserva } from '../../lib/tipos';
import { useSesionCliente } from './LayoutPortal';

export default function Confirmacion() {
  const { id } = useParams();
  const { token, lista } = useSesionCliente();
  const reserva = useQuery({
    queryKey: ['reserva', id],
    queryFn: async () => (await apiCliente.get<Reserva>(`/clientes/me/reservas/${id}`)).data,
    enabled: Boolean(token),
  });

  if (lista && !token)
    return <Navigate to={`/portal/entrar?volver=/portal/reserva/${id}`} replace />;
  if (!token || reserva.isLoading) return <Cargando />;
  if (reserva.isError) return <Aviso>{mensajeError(reserva.error)}</Aviso>;
  const r = reserva.data!;

  return (
    <div className="mx-auto max-w-md text-center">
      <CheckCircle2 className="mx-auto h-12 w-12 text-ok" aria-hidden />
      <h1 className="mt-3 text-3xl">Reserva confirmada</h1>
      <p className="mt-1 text-ink-muted">Te enviamos los detalles a {r.cliente.email}.</p>

      <div className="mt-8">
        <ComprobanteReserva r={r} />
      </div>
      <p className="mt-4 text-sm text-ink-muted">
        Guarda una captura de este comprobante. Te avisamos aquí cuando la mesa esté lista.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Link to="/portal/mis-reservas">
          <Boton variante="secundario">Ver mis reservas</Boton>
        </Link>
        <Link to="/portal">
          <Boton variante="fantasma">Reservar otra</Boton>
        </Link>
      </div>
    </div>
  );
}
