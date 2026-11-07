import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Minus, Plus } from 'lucide-react';
import { Aviso, Boton, Campo, Cargando } from '../../components/ui';
import { apiCliente, apiPublica, detallesError, mensajeError, codigoError } from '../../lib/sesion';
import type { SedePublica, TurnoEspera } from '../../lib/tipos';
import { useSesionCliente } from './LayoutPortal';
import { useConfiguracion } from '../../lib/configuracion';

export const CLAVE_TURNO = 'fogon.turno';

/** Página del QR de la entrada: anotarse en la fila sin reserva, con o sin cuenta. */
export default function UnirseFila() {
  const sedeId = Number(useParams().sedeId);
  const navegar = useNavigate();
  const { cliente } = useSesionCliente();
  const reservas = useConfiguracion((c) => c.reservasHabilitadas);
  const [datos, setDatos] = useState({ nombre: '', telefono: '', personas: 2 });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const sede = useQuery({
    queryKey: ['sedes-publicas'],
    queryFn: async () => (await apiPublica.get<SedePublica[]>('/sedes/publicas')).data,
    select: (s) => s.find((x) => x.id === sedeId),
  });

  // Si este celular ya tiene un turno activo en la sede, se retoma
  useEffect(() => {
    try {
      const guardado = JSON.parse(localStorage.getItem(CLAVE_TURNO) ?? 'null') as {
        id: string;
        sedeId: number;
      } | null;
      if (guardado?.sedeId === sedeId) navegar(`/portal/turno/${guardado.id}`, { replace: true });
    } catch {
      /* sin almacenamiento */
    }
  }, [sedeId, navegar]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const api = cliente ? apiCliente : apiPublica;
      const cuerpo = cliente ? { personas: datos.personas } : datos;
      const { data } = await api.post<TurnoEspera>(`/sedes/${sedeId}/espera`, cuerpo);
      try {
        localStorage.setItem(CLAVE_TURNO, JSON.stringify({ id: data.id, sedeId }));
      } catch {
        /* nada */
      }
      navegar(`/portal/turno/${data.id}`);
    } catch (err) {
      const existente = detallesError<{ entradaId?: string }>(err)?.entradaId;
      if (codigoError(err) === 'CONFLICTO' && existente) navegar(`/portal/turno/${existente}`);
      else setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  if (sede.isLoading) return <Cargando />;
  if (!sede.data) return <Aviso>Esta sede no está recibiendo clientes.</Aviso>;

  return (
    <div className="mx-auto max-w-sm">
      <p className="text-ink-muted">{sede.data.nombre}</p>
      <h1 className="text-4xl leading-tight">Anótate en la fila</h1>
      <p className="mt-2 text-ink-muted">
        Te avisamos en este celular cuando tu mesa esté lista. No necesitas quedarte en la puerta.
      </p>

      <form onSubmit={enviar} className="mt-8 space-y-5">
        {cliente ? (
          <p className="rounded-lg bg-white p-3 text-sm ring-1 ring-line">
            Te anotamos como <strong>{cliente.nombre}</strong> ({cliente.telefono}).
          </p>
        ) : (
          <>
            <Campo etiqueta="Nombre">
              <input
                className="campo"
                required
                minLength={2}
                autoComplete="given-name"
                value={datos.nombre}
                onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
              />
            </Campo>
            <Campo etiqueta="Celular">
              <input
                className="campo"
                type="tel"
                required
                autoComplete="tel"
                value={datos.telefono}
                onChange={(e) => setDatos({ ...datos, telefono: e.target.value })}
              />
            </Campo>
          </>
        )}
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">¿Cuántos son?</legend>
          <div className="inline-flex items-center rounded-xl border border-line bg-white">
            <button
              type="button"
              className="p-3 disabled:opacity-40"
              disabled={datos.personas <= 1}
              onClick={() => setDatos({ ...datos, personas: datos.personas - 1 })}
              aria-label="Una persona menos"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="cifra w-12 text-center text-3xl">{datos.personas}</span>
            <button
              type="button"
              className="p-3 disabled:opacity-40"
              disabled={datos.personas >= 12}
              onClick={() => setDatos({ ...datos, personas: datos.personas + 1 })}
              aria-label="Una persona más"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </fieldset>
        {error && <Aviso>{error}</Aviso>}
        <Boton type="submit" tamano="lg" className="w-full" cargando={enviando}>
          Anotarme
        </Boton>
      </form>
      {reservas && (
        <p className="mt-6 text-center text-sm text-ink-muted">
          ¿Prefieres asegurar la mesa?{' '}
          <Link to={`/portal/reservar/${sedeId}`} className="font-semibold text-ink underline">
            Reserva
          </Link>
        </p>
      )}
    </div>
  );
}
