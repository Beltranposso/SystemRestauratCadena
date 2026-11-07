import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Move, Phone, UserPlus, Users } from 'lucide-react';
import {
  EVENTOS,
  TRANSICIONES_MESA,
  type EstadoMesa,
  type EstadoReserva,
} from '@restaurantes/shared';
import { SelectorSede } from '../../components/Filtros';
import { ESTILO_MESA, LeyendaMesas, MapaSalon, type Posiciones } from '../../components/MapaSalon';
import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  cx,
  EnVivo,
  Insignia,
  Modal,
  Segmentos,
  Vacio,
} from '../../components/ui';
import { useSedeTrabajo } from '../../lib/consultas';
import { hoyEn, minutosDesde } from '../../lib/formato';
import { apiPersonal, apiPublica, mensajeError, usePersonal } from '../../lib/sesion';
import { useTiempoReal } from '../../lib/socket';
import type { Mesa, Paginado, PanelMesas, Reserva, TurnoEspera } from '../../lib/tipos';
import { useConfiguracion } from '../../lib/configuracion';

const ACCION_MESA: Record<EstadoMesa, string> = {
  LIBRE: 'Liberar',
  OCUPADA: 'Sentar clientes sin reserva',
  RESERVADA: 'Apartar',
  LIMPIEZA: 'Mandar a limpieza',
  FUERA_SERVICIO: 'Sacar de servicio',
};

const ESTADO_RESERVA: Record<
  EstadoReserva,
  { texto: string; color: 'neutro' | 'ok' | 'warn' | 'danger' | 'oro' | 'tinta' }
> = {
  PENDIENTE: { texto: 'Por confirmar', color: 'warn' },
  CONFIRMADA: { texto: 'Confirmada', color: 'oro' },
  SENTADA: { texto: 'En mesa', color: 'tinta' },
  COMPLETADA: { texto: 'Terminó', color: 'neutro' },
  CANCELADA: { texto: 'Cancelada', color: 'danger' },
  NO_SHOW: { texto: 'No llegó', color: 'danger' },
};

export default function Mesas() {
  const { sedeId, sede } = useSedeTrabajo();
  const token = usePersonal((s) => s.token);
  const qc = useQueryClient();
  const [seleccionada, setSeleccionada] = useState<number>();
  const [editando, setEditando] = useState(false);
  const [posiciones, setPosiciones] = useState<Posiciones>({});
  const [pestana, setPestana] = useState<'fila' | 'reservas'>('fila');
  const reservasActivas = useConfiguracion((c) => c.reservasHabilitadas);
  // Con las reservas apagadas, la pestaña sigue visible mientras queden reservas de hoy por atender
  const pendientesHoy = useQuery({
    queryKey: ['reservas-hoy-total', sedeId],
    queryFn: async () =>
      (
        await apiPersonal.get<Paginado<Reserva>>(
          `/reservas?sedeId=${sedeId}&estado=PENDIENTE,CONFIRMADA&porPagina=1`,
        )
      ).data.meta.total,
    enabled: Boolean(sedeId) && !reservasActivas,
  });
  const verReservas = reservasActivas || (pendientesHoy.data ?? 0) > 0;
  const [error, setError] = useState('');

  const panel = useQuery({
    queryKey: ['mesas', sedeId],
    queryFn: async () => (await apiPersonal.get<PanelMesas>(`/sedes/${sedeId}/mesas`)).data,
    enabled: Boolean(sedeId),
    refetchInterval: 60_000, // refresca los minutos de cada mesa
  });

  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ['mesas', sedeId] });
    void qc.invalidateQueries({ queryKey: ['fila', sedeId] });
    void qc.invalidateQueries({ queryKey: ['reservas-hoy', sedeId] });
  };

  const conectado = useTiempoReal(
    sedeId ? { token } : null,
    sedeId ? [{ sedeId, canal: 'salon' }] : [],
    {
      [EVENTOS.mesaEstado]: refrescar,
      [EVENTOS.reservaActualizada]: refrescar,
      [EVENTOS.esperaActualizada]: refrescar,
    },
  );

  const guardarPlano = useMutation({
    mutationFn: () =>
      apiPersonal.put(`/sedes/${sedeId}/plano`, {
        mesas: Object.entries(posiciones).map(([id, p]) => {
          const m = panel.data!.mesas.find((x) => x.id === Number(id))!;
          return { id: Number(id), ...p, ancho: m.ancho, alto: m.alto, rotacion: m.rotacion };
        }),
      }),
    onSuccess: () => {
      setEditando(false);
      setPosiciones({});
      refrescar();
    },
    onError: (e) => setError(mensajeError(e)),
  });

  const mesa = panel.data?.mesas.find((m) => m.id === seleccionada);
  const r = panel.data?.resumen;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">Mesas y fila</h1>
          <div className="mt-1 flex items-center gap-3 text-ink-muted">
            <SelectorSede />
            <EnVivo conectado={conectado} />
          </div>
        </div>
        {r && (
          <dl className="flex gap-5 text-sm">
            {(['LIBRE', 'OCUPADA', 'RESERVADA', 'LIMPIEZA'] as EstadoMesa[]).map((e) => (
              <div key={e} className="text-center">
                <dt className="text-ink-muted">{ESTILO_MESA[e].nombre}</dt>
                <dd className="cifra text-3xl leading-none">{r[e]}</dd>
              </div>
            ))}
            <div className="border-l border-line pl-5 text-center">
              <dt className="text-ink-muted">Ocupación</dt>
              <dd className="cifra text-3xl leading-none text-brand-red">{r.ocupacionPct}%</dd>
            </div>
          </dl>
        )}
      </header>

      {error && (
        <div onClick={() => setError('')}>
          <Aviso>{error}</Aviso>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <LeyendaMesas />
            {editando ? (
              <div className="flex gap-2">
                <Boton
                  tamano="sm"
                  variante="secundario"
                  onClick={() => (setEditando(false), setPosiciones({}))}
                >
                  Descartar
                </Boton>
                <Boton
                  tamano="sm"
                  cargando={guardarPlano.isPending}
                  disabled={!Object.keys(posiciones).length}
                  onClick={() => guardarPlano.mutate()}
                >
                  Guardar plano
                </Boton>
              </div>
            ) : (
              <Boton
                tamano="sm"
                variante="secundario"
                onClick={() => (setEditando(true), setSeleccionada(undefined))}
              >
                <Move className="h-4 w-4" aria-hidden /> Mover mesas
              </Boton>
            )}
          </div>
          {editando && (
            <Aviso tipo="info">
              Arrastra las mesas para ubicarlas como están en el local. Se ajustan a una rejilla.
            </Aviso>
          )}
          {panel.isLoading ? (
            <Cargando />
          ) : panel.data ? (
            <MapaSalon
              mesas={panel.data.mesas}
              lienzo={panel.data.lienzo}
              seleccionada={seleccionada}
              onSeleccionar={setSeleccionada}
              editando={editando}
              posiciones={posiciones}
              onMover={(id, p) => setPosiciones((a) => ({ ...a, [id]: p }))}
            />
          ) : null}

          {mesa && !editando && (
            <DetalleMesa
              mesa={mesa}
              onCambio={refrescar}
              onError={setError}
              onCerrar={() => setSeleccionada(undefined)}
            />
          )}
        </section>

        <aside className="space-y-3">
          {verReservas && (
            <Segmentos
              etiqueta="Ver"
              valor={pestana}
              onChange={setPestana}
              opciones={[
                { valor: 'fila', texto: 'Fila de espera' },
                { valor: 'reservas', texto: 'Reservas de hoy' },
              ]}
            />
          )}
          {sedeId && (pestana === 'fila' || !verReservas) && (
            <Fila sedeId={sedeId} mesas={panel.data?.mesas ?? []} onError={setError} />
          )}
          {sedeId && pestana === 'reservas' && verReservas && (
            <ReservasHoy sedeId={sedeId} zona={sede?.zonaHoraria} onError={setError} />
          )}
        </aside>
      </div>
    </div>
  );
}

function DetalleMesa({
  mesa,
  onCambio,
  onError,
  onCerrar,
}: {
  mesa: Mesa;
  onCambio: () => void;
  onError: (m: string) => void;
  onCerrar: () => void;
}) {
  const [personas, setPersonas] = useState(Math.min(2, mesa.capacidad));
  const cambiar = useMutation({
    mutationFn: (estado: EstadoMesa) =>
      apiPersonal.patch(`/mesas/${mesa.id}/estado`, {
        estado,
        ...(estado === 'OCUPADA' ? { personas } : {}),
      }),
    onSuccess: onCambio,
    onError: (e) => onError(mensajeError(e)),
  });
  const destinos = TRANSICIONES_MESA[mesa.estado];

  return (
    <div className="animate-entra rounded-xl border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-muted">
            {mesa.zona}, {mesa.capacidad} personas
          </p>
          <h2 className="cifra text-4xl leading-none">Mesa {mesa.codigo}</h2>
        </div>
        <Insignia className={cx(ESTILO_MESA[mesa.estado].caja, ESTILO_MESA[mesa.estado].texto)}>
          {ESTILO_MESA[mesa.estado].nombre}
        </Insignia>
      </div>

      {mesa.sesionActual && (
        <p className="mt-3 text-sm">
          {mesa.sesionActual.personas} personas desde hace {mesa.sesionActual.minutos} min
          {mesa.sesionActual.origen === 'RESERVA'
            ? ' (reserva)'
            : mesa.sesionActual.origen === 'ESPERA'
              ? ' (de la fila)'
              : ''}
          .
        </p>
      )}
      {mesa.proximaReserva && (
        <p className="mt-2 text-sm">
          Próxima reserva a las <strong>{mesa.proximaReserva.hora}</strong>:{' '}
          {mesa.proximaReserva.cliente.nombre}, {mesa.proximaReserva.personas} personas.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        {destinos.includes('OCUPADA') && (
          <label className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-ink-muted" aria-hidden />
            <span className="sr-only">Personas</span>
            <input
              type="number"
              min={1}
              max={mesa.capacidad}
              value={personas}
              onChange={(e) => setPersonas(Number(e.target.value))}
              className="campo h-10 w-16"
            />
          </label>
        )}
        {destinos.map((d) => (
          <Boton
            key={d}
            variante={
              d === 'OCUPADA' ? 'primario' : d === 'FUERA_SERVICIO' ? 'peligro' : 'secundario'
            }
            cargando={cambiar.isPending && cambiar.variables === d}
            onClick={() => cambiar.mutate(d)}
          >
            {ACCION_MESA[d]}
          </Boton>
        ))}
        <Boton variante="fantasma" onClick={onCerrar} className="ml-auto">
          Cerrar
        </Boton>
      </div>
    </div>
  );
}

// ───────────────────────────── Fila de espera ─────────────────────────────

function Fila({
  sedeId,
  mesas,
  onError,
}: {
  sedeId: number;
  mesas: Mesa[];
  onError: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [nueva, setNueva] = useState(false);
  const [asignar, setAsignar] = useState<{
    entrada: TurnoEspera;
    accion: 'notificar' | 'sentar';
  } | null>(null);
  const fila = useQuery({
    queryKey: ['fila', sedeId],
    queryFn: async () =>
      (
        await apiPersonal.get<{ esperando: number; notificados: number; datos: TurnoEspera[] }>(
          `/sedes/${sedeId}/espera`,
        )
      ).data,
    refetchInterval: 60_000,
  });
  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ['fila', sedeId] });
    void qc.invalidateQueries({ queryKey: ['mesas', sedeId] });
  };
  const accion = useMutation({
    mutationFn: ({
      id,
      ruta,
      mesaId,
    }: {
      id: string;
      ruta: 'notificar' | 'sentar' | 'abandono';
      mesaId?: number;
    }) => apiPersonal.post(`/espera/${id}/${ruta}`, mesaId ? { mesaId } : {}),
    onSuccess: () => {
      setAsignar(null);
      refrescar();
    },
    onError: (e) => onError(mensajeError(e)),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">
          {fila.data ? `${fila.data.esperando} esperando, ${fila.data.notificados} avisados` : ' '}
        </p>
        <Boton tamano="sm" variante="secundario" onClick={() => setNueva(true)}>
          <UserPlus className="h-4 w-4" aria-hidden /> Anotar
        </Boton>
      </div>

      {fila.isLoading ? (
        <Cargando />
      ) : !fila.data?.datos.length ? (
        <Vacio
          titulo="Nadie en la fila"
          texto="Los clientes se anotan desde el QR de la entrada o aquí con el botón Anotar."
        />
      ) : (
        <ol className="space-y-2">
          {fila.data.datos.map((e) => (
            <li
              key={e.id}
              className={cx(
                'rounded-xl border bg-white p-3',
                e.estado === 'NOTIFICADO' ? 'border-brand-gold' : 'border-line',
              )}
            >
              <div className="flex items-start gap-3">
                <span className="cifra w-12 text-3xl leading-none text-brand-red">
                  {e.numeroTurno}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{e.nombre}</p>
                  <p className="flex flex-wrap items-center gap-x-3 text-sm text-ink-muted">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" aria-hidden />
                      {e.personas}
                    </span>
                    <span>{minutosDesde(e.creadoEn)} min esperando</span>
                    {e.telefono && (
                      <a
                        href={`tel:${e.telefono}`}
                        className="inline-flex items-center gap-1 hover:text-ink"
                      >
                        <Phone className="h-3.5 w-3.5" aria-hidden />
                        {e.telefono}
                      </a>
                    )}
                  </p>
                  {e.estado === 'NOTIFICADO' && (
                    <p className="mt-1 text-sm font-semibold">
                      <Bell className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                      Avisado{e.mesa ? `, mesa ${e.mesa}` : ''}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                {e.estado === 'ESPERANDO' && (
                  <Boton
                    tamano="sm"
                    variante="oro"
                    onClick={() => setAsignar({ entrada: e, accion: 'notificar' })}
                  >
                    Avisar
                  </Boton>
                )}
                <Boton
                  tamano="sm"
                  onClick={() =>
                    e.mesa
                      ? accion.mutate({ id: e.id, ruta: 'sentar' })
                      : setAsignar({ entrada: e, accion: 'sentar' })
                  }
                >
                  Sentar
                </Boton>
                <Boton
                  tamano="sm"
                  variante="fantasma"
                  className="ml-auto"
                  onClick={() => accion.mutate({ id: e.id, ruta: 'abandono' })}
                >
                  Se fue
                </Boton>
              </div>
            </li>
          ))}
        </ol>
      )}

      <Modal
        abierto={Boolean(asignar)}
        onCerrar={() => setAsignar(null)}
        titulo={
          asignar?.accion === 'notificar' ? 'Avisar que su mesa está lista' : 'Sentar en una mesa'
        }
      >
        {asignar && (
          <ElegirMesa
            mesas={mesas.filter(
              (m) =>
                m.activa &&
                (m.estado === 'LIBRE' || m.estado === 'RESERVADA') &&
                m.capacidad >= asignar.entrada.personas,
            )}
            personas={asignar.entrada.personas}
            permitirSinMesa={asignar.accion === 'notificar'}
            cargando={accion.isPending}
            onElegir={(mesaId) =>
              accion.mutate({ id: asignar.entrada.id, ruta: asignar.accion, mesaId })
            }
          />
        )}
      </Modal>

      <Modal abierto={nueva} onCerrar={() => setNueva(false)} titulo="Anotar en la fila">
        <NuevaEntrada sedeId={sedeId} onListo={() => (setNueva(false), refrescar())} />
      </Modal>
    </div>
  );
}

function ElegirMesa({
  mesas,
  personas,
  permitirSinMesa,
  cargando,
  onElegir,
}: {
  mesas: Mesa[];
  personas: number;
  permitirSinMesa: boolean;
  cargando: boolean;
  onElegir: (mesaId?: number) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Mesas libres para {personas} personas, de la más ajustada a la más grande.
      </p>
      {mesas.length === 0 ? (
        <Aviso tipo="info">No hay mesas libres de ese tamaño ahora.</Aviso>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {[...mesas]
            .sort((a, b) => a.capacidad - b.capacidad)
            .map((m) => (
              <button
                key={m.id}
                disabled={cargando}
                onClick={() => onElegir(m.id)}
                className="rounded-xl border-2 border-line p-3 text-center hover:border-ink disabled:opacity-50"
              >
                <span className="cifra block text-2xl">{m.codigo}</span>
                <span className="text-xs text-ink-muted">
                  {m.capacidad} pers., {m.zona}
                </span>
              </button>
            ))}
        </div>
      )}
      {permitirSinMesa && (
        <Boton
          variante="secundario"
          className="w-full"
          cargando={cargando}
          onClick={() => onElegir()}
        >
          Avisar sin apartar mesa
        </Boton>
      )}
    </div>
  );
}

function NuevaEntrada({ sedeId, onListo }: { sedeId: number; onListo: () => void }) {
  const [datos, setDatos] = useState({ nombre: '', telefono: '', personas: 2 });
  const [error, setError] = useState('');
  const crear = useMutation({
    mutationFn: () => apiPublica.post(`/sedes/${sedeId}/espera`, datos),
    onSuccess: onListo,
    onError: (e) => setError(mensajeError(e)),
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    crear.mutate();
  };
  return (
    <form onSubmit={enviar} className="space-y-4">
      <Campo etiqueta="Nombre">
        <input
          className="campo"
          required
          minLength={2}
          value={datos.nombre}
          onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
        />
      </Campo>
      <Campo etiqueta="Teléfono" ayuda="Para avisarle cuando la mesa esté lista.">
        <input
          className="campo"
          type="tel"
          required
          value={datos.telefono}
          onChange={(e) => setDatos({ ...datos, telefono: e.target.value })}
        />
      </Campo>
      <Campo etiqueta="Personas">
        <input
          className="campo"
          type="number"
          min={1}
          max={30}
          required
          value={datos.personas}
          onChange={(e) => setDatos({ ...datos, personas: Number(e.target.value) })}
        />
      </Campo>
      {error && <Aviso>{error}</Aviso>}
      <Boton type="submit" className="w-full" cargando={crear.isPending}>
        Anotar en la fila
      </Boton>
    </form>
  );
}

// ───────────────────────────── Reservas de hoy ─────────────────────────────

function ReservasHoy({
  sedeId,
  zona,
  onError,
}: {
  sedeId: number;
  zona?: string;
  onError: (m: string) => void;
}) {
  const qc = useQueryClient();
  const fecha = hoyEn(zona);
  const [codigo, setCodigo] = useState('');
  const buscando = codigo.length === 6;
  const reservas = useQuery({
    queryKey: ['reservas-hoy', sedeId, buscando ? codigo : fecha],
    queryFn: async () =>
      (
        await apiPersonal.get<Paginado<Reserva>>(
          buscando
            ? `/reservas?sedeId=${sedeId}&codigo=${codigo}`
            : `/reservas?sedeId=${sedeId}&fecha=${fecha}&porPagina=100`,
        )
      ).data.datos,
  });
  const accion = useMutation({
    mutationFn: ({ id, ruta }: { id: string; ruta: string }) =>
      apiPersonal.post(`/reservas/${id}/${ruta}`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reservas-hoy', sedeId] });
      void qc.invalidateQueries({ queryKey: ['mesas', sedeId] });
    },
    onError: (e) => onError(mensajeError(e)),
  });

  const lista = reservas.data ?? [];
  const buscador = (
    <label className="block">
      <span className="sr-only">Buscar por número de reserva</span>
      <input
        className="campo font-mono uppercase"
        placeholder="Escanea el QR o escribe el número"
        maxLength={6}
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
      />
    </label>
  );
  if (reservas.isLoading)
    return (
      <>
        {buscador}
        <Cargando />
      </>
    );
  if (!lista.length)
    return (
      <>
        {buscador}
        <Vacio
          titulo={buscando ? `No hay reservas con el número ${codigo}` : 'Sin reservas para hoy'}
        />
      </>
    );

  return (
    <>
      {buscador}
      <ol className="space-y-2">
        {lista.map((r) => {
          const activa = r.estado === 'PENDIENTE' || r.estado === 'CONFIRMADA';
          return (
            <li
              key={r.id}
              className={cx('rounded-xl border border-line bg-white p-3', !activa && 'opacity-60')}
            >
              <div className="flex items-start gap-3">
                <span className="cifra w-16 text-2xl leading-none">{r.hora}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.cliente.nombre}</p>
                  <p className="text-sm text-ink-muted">
                    {r.personas} personas{r.mesa ? `, mesa ${r.mesa.codigo}` : ''}, código{' '}
                    {r.codigoConfirmacion}
                  </p>
                  {r.notas && <p className="mt-0.5 text-sm italic">“{r.notas}”</p>}
                </div>
                <Insignia color={ESTADO_RESERVA[r.estado].color}>
                  {ESTADO_RESERVA[r.estado].texto}
                </Insignia>
              </div>
              {activa && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.estado === 'PENDIENTE' && (
                    <Boton
                      tamano="sm"
                      variante="secundario"
                      onClick={() => accion.mutate({ id: r.id, ruta: 'confirmar' })}
                    >
                      Confirmar
                    </Boton>
                  )}
                  <Boton
                    tamano="sm"
                    variante="oro"
                    onClick={() => accion.mutate({ id: r.id, ruta: 'notificar-mesa-lista' })}
                  >
                    Avisar
                  </Boton>
                  <Boton tamano="sm" onClick={() => accion.mutate({ id: r.id, ruta: 'sentar' })}>
                    Sentar
                  </Boton>
                  <Boton
                    tamano="sm"
                    variante="fantasma"
                    onClick={() => accion.mutate({ id: r.id, ruta: 'no-show' })}
                  >
                    No llegó
                  </Boton>
                  <Boton
                    tamano="sm"
                    variante="fantasma"
                    className="text-danger"
                    onClick={() => accion.mutate({ id: r.id, ruta: 'cancelar' })}
                  >
                    Cancelar
                  </Boton>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
