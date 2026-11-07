import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { PuestoTurno } from '@restaurantes/shared';
import { SelectorSede } from '../../components/Filtros';
import { Aviso, Boton, Campo, Cargando, cx, Modal } from '../../components/ui';
import { useSedeTrabajo } from '../../lib/consultas';
import {
  diaCorto,
  ETIQUETA_PUESTO,
  ETIQUETA_ROL,
  hoyEn,
  lunesDe,
  sumarDias,
} from '../../lib/formato';
import { apiPersonal, mensajeError } from '../../lib/sesion';
import type { Personal, SemanaTurnos, Turno } from '../../lib/tipos';

const COLOR_PUESTO: Record<PuestoTurno, string> = {
  CAJA: 'bg-brand-gold-soft border-[#f0c94a]',
  COCINA: 'bg-[#fde2df] border-[#f2a59c]',
  SERVICIO: 'bg-[#e3efe7] border-[#9ccfae]',
  GERENCIA: 'bg-ink text-white border-ink',
};

const ESTADO_TURNO = {
  PROGRAMADO: '',
  EN_CURSO: 'En turno',
  COMPLETADO: 'Cumplido',
  AUSENTE: 'Ausente',
} as const;

type Edicion =
  { modo: 'crear'; usuario: Personal; fecha: string } | { modo: 'editar'; turno: Turno };

export default function Turnos() {
  const { sedeId, sede } = useSedeTrabajo();
  const [lunes, setLunes] = useState(() => lunesDe(hoyEn(sede?.zonaHoraria)));
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const hoy = hoyEn(sede?.zonaHoraria);

  const personal = useQuery({
    queryKey: ['personal', sedeId],
    queryFn: async () => (await apiPersonal.get<Personal[]>(`/sedes/${sedeId}/personal`)).data,
    enabled: Boolean(sedeId),
  });
  const semana = useQuery({
    queryKey: ['turnos', sedeId, lunes],
    queryFn: async () =>
      (
        await apiPersonal.get<SemanaTurnos>(
          `/turnos?sedeId=${sedeId}&desde=${lunes}&hasta=${sumarDias(lunes, 6)}`,
        )
      ).data,
    enabled: Boolean(sedeId),
  });

  const turnosDe = (usuarioId: string, fecha: string) =>
    semana.data?.datos.filter((t) => t.usuarioId === usuarioId && t.fecha === fecha) ?? [];
  const horasDe = (usuarioId: string) =>
    semana.data?.resumen.find((r) => r.usuarioId === usuarioId)?.horas ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Turnos</h1>
          <div className="mt-1 text-ink-muted">
            <SelectorSede />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Boton
            variante="secundario"
            tamano="sm"
            onClick={() => setLunes(sumarDias(lunes, -7))}
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Boton>
          <p className="min-w-44 text-center font-semibold">
            {diaCorto(lunes)} a {diaCorto(sumarDias(lunes, 6))}
          </p>
          <Boton
            variante="secundario"
            tamano="sm"
            onClick={() => setLunes(sumarDias(lunes, 7))}
            aria-label="Semana siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Boton>
          <Boton variante="fantasma" tamano="sm" onClick={() => setLunes(lunesDe(hoy))}>
            Esta semana
          </Boton>
        </div>
      </header>

      {personal.isLoading || semana.isLoading ? (
        <Cargando />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="w-52 p-3 text-left font-semibold">
                  Persona
                </th>
                {dias.map((d) => (
                  <th
                    key={d}
                    scope="col"
                    className={cx(
                      'p-3 text-left font-semibold first-letter:uppercase',
                      d === hoy && 'bg-brand-gold-soft/60',
                    )}
                  >
                    {diaCorto(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {personal.data?.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <th scope="row" className="p-3 text-left align-top font-normal">
                    <span className="block font-semibold">{p.nombre}</span>
                    <span className="text-xs text-ink-muted">
                      {ETIQUETA_ROL[p.rol]}, {horasDe(p.id).toLocaleString('es-CO')} h
                    </span>
                  </th>
                  {dias.map((d) => (
                    <td
                      key={d}
                      className={cx('group p-1.5 align-top', d === hoy && 'bg-brand-gold-soft/30')}
                    >
                      <div className="flex min-h-14 flex-col gap-1">
                        {turnosDe(p.id, d).map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setEdicion({ modo: 'editar', turno: t })}
                            className={cx(
                              'rounded-md border px-2 py-1 text-left text-xs',
                              COLOR_PUESTO[t.puesto],
                              t.estado === 'AUSENTE' && 'line-through opacity-60',
                            )}
                          >
                            <span className="block font-semibold tabular-nums">
                              {t.horaInicio}–{t.horaFin}
                            </span>
                            <span className="opacity-80">
                              {ETIQUETA_PUESTO[t.puesto]}
                              {ESTADO_TURNO[t.estado] && `, ${ESTADO_TURNO[t.estado]}`}
                            </span>
                          </button>
                        ))}
                        <button
                          onClick={() => setEdicion({ modo: 'crear', usuario: p, fecha: d })}
                          className="flex flex-1 items-center justify-center rounded-md border border-dashed border-transparent text-ink-muted opacity-0 transition-opacity hover:border-line focus-visible:opacity-100 group-hover:opacity-100"
                          aria-label={`Agregar turno a ${p.nombre} el ${diaCorto(d)}`}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ul className="flex flex-wrap gap-4 text-xs text-ink-muted">
        {(Object.keys(COLOR_PUESTO) as PuestoTurno[]).map((p) => (
          <li key={p} className="flex items-center gap-1.5">
            <span className={cx('h-3 w-3 rounded-sm border', COLOR_PUESTO[p])} />
            {ETIQUETA_PUESTO[p]}
          </li>
        ))}
      </ul>

      <Modal
        abierto={Boolean(edicion)}
        onCerrar={() => setEdicion(null)}
        titulo={edicion?.modo === 'crear' ? `Turno de ${edicion.usuario.nombre}` : 'Editar turno'}
      >
        {edicion && sedeId && (
          <FormTurno edicion={edicion} sedeId={sedeId} onListo={() => setEdicion(null)} />
        )}
      </Modal>
    </div>
  );
}

const PUESTO_POR_ROL: Record<string, PuestoTurno> = {
  CAJERO: 'CAJA',
  COCINA: 'COCINA',
  GERENTE_SEDE: 'GERENCIA',
};

function FormTurno({
  edicion,
  sedeId,
  onListo,
}: {
  edicion: Edicion;
  sedeId: number;
  onListo: () => void;
}) {
  const qc = useQueryClient();
  const t = edicion.modo === 'editar' ? edicion.turno : null;
  const [datos, setDatos] = useState({
    fecha: t?.fecha ?? (edicion.modo === 'crear' ? edicion.fecha : ''),
    horaInicio: t?.horaInicio ?? '07:00',
    horaFin: t?.horaFin ?? '15:00',
    puesto:
      t?.puesto ??
      (edicion.modo === 'crear' ? (PUESTO_POR_ROL[edicion.usuario.rol] ?? 'SERVICIO') : 'SERVICIO'),
    notas: t?.notas ?? '',
  });
  const [error, setError] = useState('');

  const listo = () => {
    void qc.invalidateQueries({ queryKey: ['turnos', sedeId] });
    onListo();
  };
  const guardar = useMutation({
    // Las dos ramas devuelven respuestas de axios distintas: solo importa que termine
    mutationFn: async (): Promise<void> => {
      await (edicion.modo === 'crear'
        ? apiPersonal.post('/turnos', {
            sedeId,
            usuarioId: edicion.usuario.id,
            ...datos,
            notas: datos.notas || undefined,
          })
        : apiPersonal.patch(`/turnos/${edicion.turno.id}`, {
            ...datos,
            notas: datos.notas || null,
          }));
    },
    onSuccess: listo,
    onError: (e) => setError(mensajeError(e)),
  });
  const ausente = useMutation({
    mutationFn: () =>
      apiPersonal.patch(`/turnos/${t!.id}`, {
        estado: t!.estado === 'AUSENTE' ? 'PROGRAMADO' : 'AUSENTE',
      }),
    onSuccess: listo,
    onError: (e) => setError(mensajeError(e)),
  });
  const eliminar = useMutation({
    mutationFn: () => apiPersonal.delete(`/turnos/${t!.id}`),
    onSuccess: listo,
    onError: (e) => setError(mensajeError(e)),
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    guardar.mutate();
  };
  const completado = t?.estado === 'COMPLETADO';
  const nocturno = datos.horaFin <= datos.horaInicio;

  return (
    <form onSubmit={enviar} className="space-y-4">
      {t && (
        <p className="text-sm text-ink-muted">
          {t.usuario.nombre}
          {t.entradaReal &&
            `, entró a las ${new Date(t.entradaReal).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`}
          {t.salidaReal &&
            ` y salió a las ${new Date(t.salidaReal).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`}
          .
        </p>
      )}
      <Campo etiqueta="Día">
        <input
          className="campo"
          type="date"
          required
          disabled={completado}
          value={datos.fecha}
          onChange={(e) => setDatos({ ...datos, fecha: e.target.value })}
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Entra">
          <input
            className="campo"
            type="time"
            required
            disabled={completado}
            value={datos.horaInicio}
            onChange={(e) => setDatos({ ...datos, horaInicio: e.target.value })}
          />
        </Campo>
        <Campo etiqueta="Sale" ayuda={nocturno ? 'Termina al día siguiente' : undefined}>
          <input
            className="campo"
            type="time"
            required
            disabled={completado}
            value={datos.horaFin}
            onChange={(e) => setDatos({ ...datos, horaFin: e.target.value })}
          />
        </Campo>
      </div>
      <Campo etiqueta="Puesto">
        <select
          className="campo"
          disabled={completado}
          value={datos.puesto}
          onChange={(e) => setDatos({ ...datos, puesto: e.target.value as PuestoTurno })}
        >
          {(Object.keys(ETIQUETA_PUESTO) as PuestoTurno[]).map((p) => (
            <option key={p} value={p}>
              {ETIQUETA_PUESTO[p]}
            </option>
          ))}
        </select>
      </Campo>
      <Campo etiqueta="Notas">
        <input
          className="campo"
          maxLength={200}
          value={datos.notas}
          onChange={(e) => setDatos({ ...datos, notas: e.target.value })}
        />
      </Campo>
      {error && <Aviso>{error}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" cargando={guardar.isPending}>
          {edicion.modo === 'crear' ? 'Programar turno' : 'Guardar cambios'}
        </Boton>
        {t && !completado && t.estado !== 'EN_CURSO' && (
          <Boton
            type="button"
            variante="secundario"
            cargando={ausente.isPending}
            onClick={() => ausente.mutate()}
          >
            {t.estado === 'AUSENTE' ? 'Quitar ausencia' : 'Marcar ausencia'}
          </Boton>
        )}
        {t?.estado === 'PROGRAMADO' && (
          <Boton
            type="button"
            variante="peligro"
            className="ml-auto"
            cargando={eliminar.isPending}
            onClick={() => eliminar.mutate()}
          >
            Eliminar
          </Boton>
        )}
      </div>
    </form>
  );
}
