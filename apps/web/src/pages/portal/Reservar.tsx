import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { SelectorFranja } from '../../components/SelectorFranja';
import { Aviso, Boton, Cargando } from '../../components/ui';
import { diaLargo, hoyEn } from '../../lib/formato';
import { apiCliente, apiPublica, codigoError, detallesError, mensajeError } from '../../lib/sesion';
import type { Reserva, SedePublica } from '../../lib/tipos';
import { useSesionCliente } from './LayoutPortal';

export default function Reservar() {
  const sedeId = Number(useParams().sedeId);
  const [params, setParams] = useSearchParams();
  const navegar = useNavigate();
  const { cliente, lista } = useSesionCliente();
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');

  const sede = useQuery({
    queryKey: ['sedes-publicas'],
    queryFn: async () => (await apiPublica.get<SedePublica[]>('/sedes/publicas')).data,
    select: (s) => s.find((x) => x.id === sedeId),
  });

  // La selección vive en la URL: sobrevive al paso por "Entrar" y se puede compartir
  const zona = sede.data?.zonaHoraria ?? 'America/Bogota';
  const valor = {
    fecha: params.get('fecha') ?? hoyEn(zona),
    hora: params.get('hora') ?? '',
    personas: Number(params.get('personas') ?? 2),
  };
  const cambiar = (v: typeof valor) => {
    setError('');
    setParams(
      { fecha: v.fecha, personas: String(v.personas), ...(v.hora ? { hora: v.hora } : {}) },
      { replace: true },
    );
  };

  const reservar = useMutation({
    mutationFn: async () =>
      (
        await apiCliente.post<Reserva>('/reservas', {
          sedeId,
          ...valor,
          notas: notas.trim() || undefined,
        })
      ).data,
    onSuccess: (r) => navegar(`/portal/reserva/${r.id}`),
    onError: (e) => {
      const alternativas = detallesError<{ alternativas?: string[] }>(e)?.alternativas;
      setError(
        codigoError(e) === 'SIN_DISPONIBILIDAD' && alternativas?.length
          ? `Esa hora se acaba de ocupar. Quedan mesas a las ${alternativas.slice(0, 4).join(', ')}.`
          : mensajeError(e),
      );
    },
  });

  if (sede.isLoading) return <Cargando />;
  if (!sede.data) return <Aviso>Esta sede no recibe reservas.</Aviso>;
  const s = sede.data;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <Link
          to="/portal"
          className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden /> Sedes
        </Link>
        <h1 className="text-3xl">{s.nombre}</h1>
        <p className="mb-8 text-ink-muted">
          {s.direccion}. La mesa queda reservada {s.duracionReservaMin} minutos.
        </p>
        <SelectorFranja sedeId={sedeId} zona={zona} valor={valor} onChange={cambiar} />
      </div>

      <aside className="h-fit lg:sticky lg:top-6">
        <div className="comanda rounded-t-xl p-5 shadow-sm">
          <h2 className="text-lg">Tu reserva</h2>
          <dl className="mt-3 space-y-2 border-t border-dashed border-line pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Día</dt>
              <dd className="font-semibold first-letter:uppercase">{diaLargo(valor.fecha)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Hora</dt>
              <dd className="font-semibold">{valor.hora || 'Elige una'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Personas</dt>
              <dd className="font-semibold">{valor.personas}</dd>
            </div>
          </dl>
          <label className="mt-4 block">
            <span className="text-sm font-semibold">¿Algo que debamos saber?</span>
            <textarea
              className="campo mt-1 h-20 resize-none text-sm"
              maxLength={300}
              placeholder="Cumpleaños, silla para bebé, terraza…"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </label>
          {error && (
            <div className="mt-3">
              <Aviso>{error}</Aviso>
            </div>
          )}
          {lista && !cliente ? (
            <Link
              to={`/portal/entrar?volver=${encodeURIComponent(`/portal/reservar/${sedeId}?${params.toString()}`)}`}
            >
              <Boton className="mt-4 w-full" tamano="lg" disabled={!valor.hora}>
                Entrar para confirmar
              </Boton>
            </Link>
          ) : (
            <Boton
              className="mt-4 w-full"
              tamano="lg"
              disabled={!valor.hora}
              cargando={reservar.isPending}
              onClick={() => reservar.mutate()}
            >
              Confirmar reserva
            </Boton>
          )}
          <p className="mt-3 text-xs text-ink-muted">
            Puedes cambiarla o cancelarla hasta {s.horasMinimasCancelacion} horas antes.
          </p>
        </div>
      </aside>
    </div>
  );
}
