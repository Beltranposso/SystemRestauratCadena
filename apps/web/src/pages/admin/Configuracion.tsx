import { useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CalendarCheck, DoorOpen } from 'lucide-react';
import { Aviso, Cargando, Interruptor } from '../../components/ui';
import {
  refrescarConfiguracion,
  useConfiguracion,
  type Configuracion,
} from '../../lib/configuracion';
import { apiPersonal, mensajeError } from '../../lib/sesion';

/** Funciones que la casa matriz activa o desactiva para toda la cadena. */
export default function ConfiguracionPagina() {
  const c = useConfiguracion();
  const [error, setError] = useState('');
  const guardar = useMutation({
    mutationFn: async (cambio: Partial<Configuracion>) =>
      (await apiPersonal.put<Configuracion>('/configuracion', cambio)).data,
    onSuccess: (r) => (setError(''), void refrescarConfiguracion(r)),
    onError: (e) => setError(mensajeError(e)),
  });

  if (!c.cargada) return <Cargando />;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-3xl">Configuración</h1>
        <p className="mt-1 max-w-2xl text-ink-muted">
          Funciones que se activan o desactivan para toda la cadena. Los cambios llegan al instante
          al portal de clientes, a los celulares en la fila y a las pantallas del personal.
        </p>
      </header>
      {error && <Aviso>{error}</Aviso>}

      <Ajuste
        icono={<CalendarCheck className="h-6 w-6" aria-hidden />}
        titulo="Reservas de mesa"
        activo={c.reservasHabilitadas}
        ocupado={guardar.isPending}
        onChange={(v) => guardar.mutate({ reservasHabilitadas: v })}
        descripcion="Para cadenas con servicio a la mesa. Si está apagado, el portal no muestra «Reservar» ni «Mis reservas» y la API no acepta reservas nuevas; los clientes solo se anotan en la fila."
        detalle={
          c.reservasHabilitadas
            ? 'Encendido: los clientes reservan desde el portal y reciben un comprobante con QR y número de reserva.'
            : 'Apagado: modo comida rápida. Las reservas que ya existían se conservan y el personal las sigue viendo en Mesas.'
        }
      />
      <Ajuste
        icono={<DoorOpen className="h-6 w-6" aria-hidden />}
        titulo="«Ya no voy a esperar» en la fila"
        activo={c.salirFilaHabilitado}
        ocupado={guardar.isPending}
        onChange={(v) => guardar.mutate({ salirFilaHabilitado: v })}
        descripcion="Permite que el cliente salga de la fila desde su celular y libere su lugar."
        detalle={
          c.salirFilaHabilitado
            ? 'Encendido: el cliente ve el botón «Ya no voy a esperar».'
            : 'Apagado: el botón no aparece; para salir, el cliente le avisa al personal, que lo marca en Mesas y fila.'
        }
      />
    </div>
  );
}

function Ajuste({
  icono,
  titulo,
  descripcion,
  detalle,
  activo,
  ocupado,
  onChange,
}: {
  icono: ReactNode;
  titulo: string;
  descripcion: string;
  detalle: string;
  activo: boolean;
  ocupado: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <section className="flex gap-4 rounded-xl border border-line bg-white p-5">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-brand-gold-soft text-brand-red-dark">
        {icono}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg leading-tight">{titulo}</h2>
          <Interruptor etiqueta={titulo} activo={activo} disabled={ocupado} onChange={onChange} />
        </div>
        <p className="mt-1 text-sm text-ink-muted">{descripcion}</p>
        <p className={`mt-3 text-sm font-semibold ${activo ? 'text-ok' : 'text-ink'}`}>{detalle}</p>
      </div>
    </section>
  );
}
