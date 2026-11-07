import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Minus, MonitorPlay, Plus, Power, Tablet, Trash2 } from 'lucide-react';
import QRCode from 'qrcode';
import type { TipoDispositivo } from '@restaurantes/shared';
import { SelectorSede } from '../../components/Filtros';
import { Aviso, Boton, Campo, Cargando, cx, Insignia, Modal } from '../../components/ui';
import { useSedeTrabajo } from '../../lib/consultas';
import { apiPersonal, mensajeError, usePersonal } from '../../lib/sesion';
import type { Cupos, CuposSede, EquipoSede } from '../../lib/tipos';

const TIPOS: Record<
  TipoDispositivo,
  { titulo: string; singular: string; icono: typeof Tablet; ayuda: string }
> = {
  KIOSCO: {
    titulo: 'Kioscos de autoservicio',
    singular: 'kiosco',
    icono: Tablet,
    ayuda: 'Pantallas táctiles donde el cliente arma y paga su pedido.',
  },
  PANTALLA: {
    titulo: 'Pantallas de pedidos',
    singular: 'pantalla',
    icono: MonitorPlay,
    ayuda: 'Televisores que llaman los números de pedido listos.',
  },
};

/** "hace 3 min", "hace 2 h", "el 12 oct" */
function haceCuanto(iso: string | null) {
  if (!iso) return 'Nunca se ha conectado';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'Activo hace un momento';
  if (min < 60) return `Activo hace ${min} min`;
  if (min < 24 * 60) return `Activo hace ${Math.round(min / 60)} h`;
  return `Activo el ${new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}`;
}

export default function Dispositivos() {
  const { sedeId, sede } = useSedeTrabajo();
  const usuario = usePersonal((s) => s.usuario)!;
  const asignaCupos = usuario.rol === 'ADMIN_GLOBAL' || usuario.rol === 'GERENTE_PAIS';
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [nuevo, setNuevo] = useState<TipoDispositivo | null>(null);
  const [conToken, setConToken] = useState<EquipoSede | null>(null);

  const detalle = useQuery({
    queryKey: ['equipos', sedeId],
    queryFn: async () =>
      (
        await apiPersonal.get<{ cupos: Cupos; dispositivos: EquipoSede[] }>(
          `/sedes/${sedeId}/dispositivos`,
        )
      ).data,
    enabled: Boolean(sedeId),
    refetchInterval: 20_000, // presencia en línea
  });
  const resumen = useQuery({
    queryKey: ['cupos'],
    queryFn: async () => (await apiPersonal.get<CuposSede[]>('/dispositivos/cupos')).data,
    enabled: asignaCupos,
    refetchInterval: 20_000,
  });

  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ['equipos', sedeId] });
    void qc.invalidateQueries({ queryKey: ['cupos'] });
  };
  const alError = (e: unknown) => setError(mensajeError(e));

  const cambiar = useMutation({
    mutationFn: ({ id, ...datos }: { id: string; activo?: boolean; nombre?: string }) =>
      apiPersonal.patch(`/dispositivos/${id}`, datos),
    onSuccess: () => (setError(''), refrescar()),
    onError: alError,
  });
  const nuevoToken = useMutation({
    mutationFn: async (id: string) =>
      (await apiPersonal.post<EquipoSede>(`/dispositivos/${id}/token`)).data,
    onSuccess: (d) => (setError(''), setConToken(d), refrescar()),
    onError: alError,
  });
  const eliminar = useMutation({
    mutationFn: (id: string) => apiPersonal.delete(`/dispositivos/${id}`),
    onSuccess: () => (setError(''), refrescar()),
    onError: alError,
  });

  const equipos = detalle.data?.dispositivos ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-3xl">Pantallas y kioscos</h1>
        <p className="mt-1 max-w-2xl text-ink-muted">
          {asignaCupos
            ? 'Asigna a cada sede cuántos kioscos y pantallas puede tener activos. El gerente de la sede vincula los equipos dentro de ese cupo.'
            : 'Tu sede puede tener activos tantos equipos como cupos le asignó el gerente de país. Desactivar un equipo libera su cupo.'}
        </p>
      </header>

      {error && <Aviso>{error}</Aviso>}

      {asignaCupos && (
        <TablaCupos
          filas={resumen.data}
          cargando={resumen.isLoading}
          sedeActual={sedeId}
          onGuardado={refrescar}
          onError={alError}
        />
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl">Equipos de la sede</h2>
          <SelectorSede />
        </div>

        {detalle.isLoading || !detalle.data ? (
          <Cargando />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {(['KIOSCO', 'PANTALLA'] as const).map((tipo) => (
              <BloqueTipo
                key={tipo}
                tipo={tipo}
                cupo={detalle.data.cupos[tipo]}
                equipos={equipos.filter((d) => d.tipo === tipo)}
                ocupado={cambiar.isPending || nuevoToken.isPending || eliminar.isPending}
                onRegistrar={() => setNuevo(tipo)}
                onActivar={(d, activo) => cambiar.mutate({ id: d.id, activo })}
                onToken={(d) => {
                  if (
                    confirm(
                      `¿Generar un token nuevo para ${d.nombre}? El equipo se desconecta hasta que lo vuelvas a vincular.`,
                    )
                  )
                    nuevoToken.mutate(d.id);
                }}
                onEliminar={(d) => {
                  if (confirm(`¿Eliminar ${d.nombre}? Se libera su cupo.`)) eliminar.mutate(d.id);
                }}
              />
            ))}
          </div>
        )}
      </section>

      <ModalNuevo
        tipo={nuevo}
        sedeId={sedeId}
        sedeNombre={sede?.nombre ?? ''}
        onCerrar={() => setNuevo(null)}
        onCreado={(d) => {
          setNuevo(null);
          setConToken(d);
          refrescar();
        }}
      />
      <ModalToken equipo={conToken} onCerrar={() => setConToken(null)} />
    </div>
  );
}

// ───────────────────────────── Bloque por tipo con sus cupos ─────────────────────────────

function BloqueTipo({
  tipo,
  cupo,
  equipos,
  ocupado,
  onRegistrar,
  onActivar,
  onToken,
  onEliminar,
}: {
  tipo: TipoDispositivo;
  cupo: { activos: number; cupo: number };
  equipos: EquipoSede[];
  ocupado: boolean;
  onRegistrar: () => void;
  onActivar: (d: EquipoSede, activo: boolean) => void;
  onToken: (d: EquipoSede) => void;
  onEliminar: (d: EquipoSede) => void;
}) {
  const info = TIPOS[tipo];
  const Icono = info.icono;
  const activos = equipos.filter((d) => d.activo);
  const inactivos = equipos.filter((d) => !d.activo);
  const libres = Math.max(0, cupo.cupo - cupo.activos);
  const lleno = libres === 0;

  return (
    <article className="flex flex-col rounded-xl border border-line bg-white">
      <header className="flex items-start gap-3 border-b border-line px-4 py-3">
        <Icono className="mt-0.5 h-5 w-5 text-brand-red" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-base">{info.titulo}</h3>
          <p className="text-sm text-ink-muted">{info.ayuda}</p>
        </div>
        <div className="text-right">
          <p className="cifra text-3xl leading-none">
            {cupo.activos}
            <span className="text-ink-muted">/{cupo.cupo}</span>
          </p>
          <p className="text-xs text-ink-muted">cupos usados</p>
        </div>
      </header>

      <ul className="flex-1 divide-y divide-line">
        {activos.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className={cx(
                'h-2.5 w-2.5 shrink-0 rounded-full',
                d.enLinea ? 'bg-ok' : 'bg-line ring-1 ring-ink/20',
              )}
              title={d.enLinea ? 'En línea' : 'Desconectado'}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{d.nombre}</p>
              <p className="text-xs text-ink-muted">
                {d.enLinea ? 'En línea ahora' : haceCuanto(d.ultimaConexionEn)}
              </p>
            </div>
            <Boton
              tamano="sm"
              variante="fantasma"
              title="Generar token nuevo"
              aria-label={`Generar token nuevo para ${d.nombre}`}
              disabled={ocupado}
              onClick={() => onToken(d)}
            >
              <KeyRound className="h-4 w-4" />
            </Boton>
            <Boton
              tamano="sm"
              variante="secundario"
              disabled={ocupado}
              onClick={() => onActivar(d, false)}
            >
              <Power className="h-4 w-4" aria-hidden /> Desactivar
            </Boton>
          </li>
        ))}
        {Array.from({ length: libres }, (_, i) => (
          <li key={`libre-${i}`} className="px-4 py-2">
            <button
              onClick={onRegistrar}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:border-brand-red hover:text-brand-red"
            >
              <Plus className="h-4 w-4" aria-hidden /> Cupo libre: vincular {info.singular}
            </button>
          </li>
        ))}
        {cupo.cupo === 0 && (
          <li className="px-4 py-4 text-sm text-ink-muted">
            Esta sede no tiene cupo para {info.titulo.toLowerCase()}.
          </li>
        )}
      </ul>

      {inactivos.length > 0 && (
        <div className="border-t border-dashed border-line px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Desactivados (no usan cupo)
          </p>
          <ul className="space-y-1.5">
            {inactivos.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink-muted">{d.nombre}</span>
                <Boton
                  tamano="sm"
                  variante="secundario"
                  disabled={ocupado || lleno}
                  title={lleno ? 'No hay cupo libre' : undefined}
                  onClick={() => onActivar(d, true)}
                >
                  Activar
                </Boton>
                <Boton
                  tamano="sm"
                  variante="fantasma"
                  aria-label={`Eliminar ${d.nombre}`}
                  disabled={ocupado}
                  onClick={() => onEliminar(d)}
                >
                  <Trash2 className="h-4 w-4" />
                </Boton>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

// ───────────────────────────── Tabla de cupos (gerente de país / admin) ─────────────────────────────

function TablaCupos({
  filas,
  cargando,
  sedeActual,
  onGuardado,
  onError,
}: {
  filas?: CuposSede[];
  cargando: boolean;
  sedeActual?: number;
  onGuardado: () => void;
  onError: (e: unknown) => void;
}) {
  if (cargando || !filas) return <Cargando />;
  const totales = filas.reduce(
    (t, f) => ({
      kioscos: t.kioscos + f.cupos.KIOSCO.activos,
      cupoK: t.cupoK + f.cupos.KIOSCO.cupo,
      pantallas: t.pantallas + f.cupos.PANTALLA.activos,
      cupoP: t.cupoP + f.cupos.PANTALLA.cupo,
      enLinea: t.enLinea + f.enLinea,
    }),
    { kioscos: 0, cupoK: 0, pantallas: 0, cupoP: 0, enLinea: 0 },
  );

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line bg-canvas/60 px-4 py-2.5">
        <h2 className="text-base">Cupos por sede</h2>
        <p className="text-sm text-ink-muted">
          {totales.kioscos}/{totales.cupoK} kioscos y {totales.pantallas}/{totales.cupoP} pantallas
          en uso, {totales.enLinea} en línea ahora
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-2 font-semibold">Sede</th>
              <th className="px-4 py-2 font-semibold">Kioscos</th>
              <th className="px-4 py-2 font-semibold">Pantallas</th>
              <th className="px-4 py-2 font-semibold">En línea</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filas.map((f) => (
              <FilaCupos
                key={f.id}
                f={f}
                actual={f.id === sedeActual}
                onGuardado={onGuardado}
                onError={onError}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FilaCupos({
  f,
  actual,
  onGuardado,
  onError,
}: {
  f: CuposSede;
  actual: boolean;
  onGuardado: () => void;
  onError: (e: unknown) => void;
}) {
  const [k, setK] = useState(f.cupos.KIOSCO.cupo);
  const [p, setP] = useState(f.cupos.PANTALLA.cupo);
  useEffect(() => {
    setK(f.cupos.KIOSCO.cupo);
    setP(f.cupos.PANTALLA.cupo);
  }, [f.cupos.KIOSCO.cupo, f.cupos.PANTALLA.cupo]);
  const cambio = k !== f.cupos.KIOSCO.cupo || p !== f.cupos.PANTALLA.cupo;

  const guardar = useMutation({
    mutationFn: () => apiPersonal.put(`/sedes/${f.id}/cupos`, { cupoKioscos: k, cupoPantallas: p }),
    onSuccess: onGuardado,
    onError,
  });

  return (
    <tr className={cx(actual && 'bg-brand-gold-soft/30')}>
      <td className="px-4 py-2.5">
        <p className="font-semibold">{f.nombre}</p>
        <p className="text-xs text-ink-muted">
          {f.codigo}, {f.ciudad.nombre}
        </p>
      </td>
      <td className="px-4 py-2.5">
        <Paso
          etiqueta={`Cupo de kioscos de ${f.nombre}`}
          valor={k}
          minimo={f.cupos.KIOSCO.activos}
          onChange={setK}
          usados={f.cupos.KIOSCO.activos}
        />
      </td>
      <td className="px-4 py-2.5">
        <Paso
          etiqueta={`Cupo de pantallas de ${f.nombre}`}
          valor={p}
          minimo={f.cupos.PANTALLA.activos}
          onChange={setP}
          usados={f.cupos.PANTALLA.activos}
        />
      </td>
      <td className="px-4 py-2.5 tabular-nums">
        {f.enLinea > 0 ? <Insignia color="ok">{f.enLinea} en línea</Insignia> : '—'}
      </td>
      <td className="px-4 py-2.5 text-right">
        {cambio && (
          <Boton tamano="sm" cargando={guardar.isPending} onClick={() => guardar.mutate()}>
            Guardar
          </Boton>
        )}
      </td>
    </tr>
  );
}

/** Selector numérico: no deja bajar del número de equipos activos. */
function Paso({
  etiqueta,
  valor,
  minimo,
  usados,
  onChange,
}: {
  etiqueta: string;
  valor: number;
  minimo: number;
  usados: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center rounded-lg border border-line" aria-label={etiqueta}>
        <button
          className="p-1.5 hover:bg-canvas disabled:opacity-30"
          disabled={valor <= minimo}
          title={valor <= minimo ? 'Desactiva un equipo antes de bajar el cupo' : undefined}
          aria-label={`Bajar ${etiqueta.toLowerCase()}`}
          onClick={() => onChange(valor - 1)}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-8 text-center font-semibold tabular-nums">{valor}</span>
        <button
          className="p-1.5 hover:bg-canvas disabled:opacity-30"
          disabled={valor >= 50}
          aria-label={`Subir ${etiqueta.toLowerCase()}`}
          onClick={() => onChange(valor + 1)}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <span className="text-xs text-ink-muted">{usados} en uso</span>
    </div>
  );
}

// ───────────────────────────── Altas y token ─────────────────────────────

function ModalNuevo({
  tipo,
  sedeId,
  sedeNombre,
  onCerrar,
  onCreado,
}: {
  tipo: TipoDispositivo | null;
  sedeId?: number;
  sedeNombre: string;
  onCerrar: () => void;
  onCreado: (d: EquipoSede) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const crear = useMutation({
    mutationFn: async () =>
      (await apiPersonal.post<EquipoSede>(`/sedes/${sedeId}/dispositivos`, { nombre, tipo })).data,
    onSuccess: (d) => {
      setNombre('');
      onCreado(d);
    },
    onError: (e) => setError(mensajeError(e)),
  });
  useEffect(() => setError(''), [tipo]);
  if (!tipo) return null;
  const info = TIPOS[tipo];

  return (
    <Modal abierto onCerrar={onCerrar} titulo={`Vincular ${info.singular}`}>
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          crear.mutate();
        }}
      >
        <p className="text-sm text-ink-muted">
          Ocupa un cupo de {sedeNombre}. Al crearlo verás el enlace y el código QR para abrirlo en
          el equipo; el token se muestra una sola vez.
        </p>
        <Campo etiqueta="Nombre" ayuda="Para reconocerlo, p. ej. «Kiosco entrada» o «TV barra».">
          <input
            className="campo"
            required
            minLength={2}
            maxLength={80}
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </Campo>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <Boton type="button" variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={crear.isPending}>
            Crear y ver token
          </Boton>
        </div>
      </form>
    </Modal>
  );
}

function ModalToken({ equipo, onCerrar }: { equipo: EquipoSede | null; onCerrar: () => void }) {
  const [qr, setQr] = useState('');
  const [copiado, setCopiado] = useState(false);
  const enlace = equipo?.token
    ? `${window.location.origin}/dispositivo?token=${encodeURIComponent(equipo.token)}`
    : '';

  useEffect(() => {
    setCopiado(false);
    if (!enlace) return setQr('');
    void QRCode.toString(enlace, { type: 'svg', margin: 1, color: { dark: '#1F1A17' } }).then(
      setQr,
    );
  }, [enlace]);

  if (!equipo?.token) return null;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
    } catch {
      /* el usuario puede copiarlo a mano */
    }
  };

  return (
    <Modal abierto onCerrar={onCerrar} titulo={`${equipo.nombre} listo para vincular`}>
      <div className="space-y-4">
        <Aviso tipo="info">
          Abre este enlace en el {TIPOS[equipo.tipo].singular} (o escanea el código con su cámara).
          No volverá a mostrarse: si lo pierdes, genera un token nuevo.
        </Aviso>
        <div
          className="mx-auto w-48 [&_svg]:h-auto [&_svg]:w-full"
          role="img"
          aria-label="Código QR del enlace de vinculación"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
        <div className="flex gap-2">
          <input
            readOnly
            className="campo min-w-0 flex-1 font-mono text-xs"
            value={enlace}
            onFocus={(e) => e.target.select()}
            aria-label="Enlace de vinculación"
          />
          <Boton variante="secundario" onClick={() => void copiar()}>
            <Copy className="h-4 w-4" aria-hidden /> {copiado ? 'Copiado' : 'Copiar'}
          </Boton>
        </div>
        <p className="text-xs text-ink-muted">
          Token: <code className="break-all">{equipo.token}</code>
        </p>
        <Boton className="w-full" onClick={onCerrar}>
          Listo
        </Boton>
      </div>
    </Modal>
  );
}
