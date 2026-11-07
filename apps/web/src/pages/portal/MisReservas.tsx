import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import { QrCode, Star } from 'lucide-react';
import type { EstadoReserva } from '@restaurantes/shared';
import { ComprobanteReserva } from '../../components/ComprobanteReserva';
import { SelectorFranja } from '../../components/SelectorFranja';
import { Aviso, Boton, Cargando, cx, Insignia, Modal, Vacio } from '../../components/ui';
import { diaLargo } from '../../lib/formato';
import { apiCliente, mensajeError } from '../../lib/sesion';
import type { Reserva } from '../../lib/tipos';
import { useSesionCliente } from './LayoutPortal';

const ESTADO: Record<
  EstadoReserva,
  { texto: string; color: 'oro' | 'warn' | 'tinta' | 'neutro' | 'danger' }
> = {
  PENDIENTE: { texto: 'Por confirmar', color: 'warn' },
  CONFIRMADA: { texto: 'Confirmada', color: 'oro' },
  SENTADA: { texto: 'En la mesa', color: 'tinta' },
  COMPLETADA: { texto: 'Visitada', color: 'neutro' },
  CANCELADA: { texto: 'Cancelada', color: 'danger' },
  NO_SHOW: { texto: 'No asististe', color: 'danger' },
};

export default function MisReservas() {
  const { token, lista } = useSesionCliente();
  const qc = useQueryClient();
  const [cambiando, setCambiando] = useState<Reserva | null>(null);
  const [calificando, setCalificando] = useState<Reserva | null>(null);
  const [comprobante, setComprobante] = useState<Reserva | null>(null);
  const [error, setError] = useState('');

  const reservas = useQuery({
    queryKey: ['mis-reservas'],
    queryFn: async () => (await apiCliente.get<Reserva[]>('/clientes/me/reservas')).data,
    enabled: Boolean(token),
  });
  const cancelar = useMutation({
    mutationFn: (id: string) => apiCliente.post(`/clientes/me/reservas/${id}/cancelar`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['mis-reservas'] }),
    onError: (e) => setError(mensajeError(e)),
  });

  if (lista && !token) return <Navigate to="/portal/entrar?volver=/portal/mis-reservas" replace />;
  if (!token || reservas.isLoading) return <Cargando />;

  const ahora = Date.now();
  const proximas = (reservas.data ?? [])
    .filter(
      (r) =>
        ['PENDIENTE', 'CONFIRMADA', 'SENTADA'].includes(r.estado) &&
        new Date(r.fin).getTime() > ahora,
    )
    .reverse();
  const pasadas = (reservas.data ?? []).filter((r) => !proximas.includes(r));

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl">Mis reservas</h1>
        <Link to="/portal">
          <Boton>Reservar mesa</Boton>
        </Link>
      </header>
      {error && <Aviso>{error}</Aviso>}

      <section>
        <h2 className="mb-3 text-lg">Próximas</h2>
        {proximas.length === 0 ? (
          <Vacio titulo="No tienes reservas próximas" />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {proximas.map((r) => (
              <li key={r.id} className="comanda rounded-t-xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{r.sede.nombre}</p>
                    <p className="text-sm first-letter:uppercase text-ink-muted">
                      {diaLargo(r.fecha)}
                    </p>
                  </div>
                  <Insignia color={ESTADO[r.estado].color}>{ESTADO[r.estado].texto}</Insignia>
                </div>
                <div className="mt-3 flex items-end justify-between border-t border-dashed border-line pt-3">
                  <p className="cifra text-5xl leading-none">{r.hora}</p>
                  <p className="text-right text-sm text-ink-muted">
                    {r.personas} personas
                    <br />
                    Código <span className="font-semibold text-ink">{r.codigoConfirmacion}</span>
                  </p>
                </div>
                {r.estado !== 'SENTADA' && (
                  <Boton
                    tamano="sm"
                    variante="secundario"
                    className="mt-4 w-full"
                    onClick={() => setComprobante(r)}
                  >
                    <QrCode className="h-4 w-4" aria-hidden /> Ver comprobante con QR
                  </Boton>
                )}
                {r.puedeModificar ? (
                  <div className="mt-2 flex gap-2">
                    <Boton tamano="sm" variante="secundario" onClick={() => setCambiando(r)}>
                      Cambiar
                    </Boton>
                    <Boton
                      tamano="sm"
                      variante="fantasma"
                      className="text-danger"
                      cargando={cancelar.isPending && cancelar.variables === r.id}
                      onClick={() => confirm('¿Cancelar esta reserva?') && cancelar.mutate(r.id)}
                    >
                      Cancelar
                    </Boton>
                  </div>
                ) : (
                  r.estado !== 'SENTADA' && (
                    <p className="mt-4 text-xs text-ink-muted">
                      Para cambios a última hora comunícate con la sede.
                    </p>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {pasadas.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg">Anteriores</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-white">
            {pasadas.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.sede.nombre}</p>
                  <p className="text-sm text-ink-muted">
                    <span className="first-letter:uppercase inline-block">{diaLargo(r.fecha)}</span>
                    , {r.hora}, {r.personas} personas
                  </p>
                </div>
                <Insignia color={ESTADO[r.estado].color}>{ESTADO[r.estado].texto}</Insignia>
                {r.puedeCalificar && (
                  <Boton tamano="sm" variante="oro" onClick={() => setCalificando(r)}>
                    Calificar
                  </Boton>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal
        abierto={Boolean(comprobante)}
        onCerrar={() => setComprobante(null)}
        titulo="Comprobante de reserva"
      >
        {comprobante && <ComprobanteReserva r={comprobante} />}
      </Modal>
      <Modal
        abierto={Boolean(cambiando)}
        onCerrar={() => setCambiando(null)}
        titulo="Cambiar reserva"
        ancho="lg"
      >
        {cambiando && (
          <CambiarReserva
            reserva={cambiando}
            onListo={() => (
              setCambiando(null),
              void qc.invalidateQueries({ queryKey: ['mis-reservas'] })
            )}
          />
        )}
      </Modal>
      <Modal
        abierto={Boolean(calificando)}
        onCerrar={() => setCalificando(null)}
        titulo="¿Cómo te fue?"
      >
        {calificando && (
          <Calificar
            reserva={calificando}
            onListo={() => (
              setCalificando(null),
              void qc.invalidateQueries({ queryKey: ['mis-reservas'] })
            )}
          />
        )}
      </Modal>
    </div>
  );
}

function CambiarReserva({ reserva, onListo }: { reserva: Reserva; onListo: () => void }) {
  const [valor, setValor] = useState({
    fecha: reserva.fecha,
    hora: reserva.hora,
    personas: reserva.personas,
  });
  const [error, setError] = useState('');
  const guardar = useMutation({
    mutationFn: () => apiCliente.patch(`/reservas/${reserva.id}`, valor),
    onSuccess: onListo,
    onError: (e) => setError(mensajeError(e)),
  });
  const igual =
    valor.fecha === reserva.fecha &&
    valor.hora === reserva.hora &&
    valor.personas === reserva.personas;
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-muted">
        Ahora: {diaLargo(reserva.fecha)} a las {reserva.hora}, {reserva.personas} personas. Las
        horas tachadas ya no tienen mesa.
      </p>
      <SelectorFranja
        sedeId={reserva.sedeId}
        zona={reserva.sede.zonaHoraria}
        valor={valor}
        onChange={(v) => (setValor(v), setError(''))}
      />
      {error && <Aviso>{error}</Aviso>}
      <Boton
        className="w-full"
        disabled={igual || !valor.hora}
        cargando={guardar.isPending}
        onClick={() => guardar.mutate()}
      >
        Guardar cambios
      </Boton>
    </div>
  );
}

function Calificar({ reserva, onListo }: { reserva: Reserva; onListo: () => void }) {
  const [puntaje, setPuntaje] = useState(0);
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState('');
  const enviar = useMutation({
    mutationFn: () =>
      apiCliente.post('/calificaciones', {
        reservaId: reserva.id,
        puntaje,
        comentario: comentario.trim() || undefined,
      }),
    onSuccess: onListo,
    onError: (e) => setError(mensajeError(e)),
  });
  return (
    <div className="space-y-4">
      <p className="text-ink-muted">
        Tu visita a {reserva.sede.nombre} el {diaLargo(reserva.fecha)}.
      </p>
      <div className="flex justify-center gap-2" role="radiogroup" aria-label="Puntaje">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            role="radio"
            aria-checked={puntaje === i}
            aria-label={`${i} de 5`}
            onClick={() => setPuntaje(i)}
            className="p-1"
          >
            <Star
              className={cx(
                'h-10 w-10 transition-colors',
                i <= puntaje
                  ? 'fill-brand-gold text-brand-gold'
                  : 'text-line hover:text-brand-gold',
              )}
            />
          </button>
        ))}
      </div>
      <textarea
        className="campo h-24 resize-none"
        maxLength={500}
        placeholder="Cuéntanos qué tal la comida y la atención (opcional)"
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
      />
      {error && <Aviso>{error}</Aviso>}
      <Boton
        className="w-full"
        disabled={!puntaje}
        cargando={enviar.isPending}
        onClick={() => enviar.mutate()}
      >
        Enviar calificación
      </Boton>
    </div>
  );
}
