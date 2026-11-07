import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { EVENTOS } from '@restaurantes/shared';
import { useConfiguracion } from '../../lib/configuracion';
import { Aviso, Boton, Cargando, cx, EnVivo } from '../../components/ui';
import { apiPublica, mensajeError } from '../../lib/sesion';
import { sonar, useTiempoReal } from '../../lib/socket';
import type { TurnoEspera } from '../../lib/tipos';
import { CLAVE_TURNO } from './UnirseFila';

/** Seguimiento del turno en vivo. Cuando el restaurante avisa, la pantalla cambia a dorado y suena. */
export default function MiTurno() {
  const puedeSalir = useConfiguracion((c) => c.salirFilaHabilitado);
  const { id } = useParams();
  const qc = useQueryClient();
  const [aviso, setAviso] = useState<string | null>(null);

  const turno = useQuery({
    queryKey: ['turno', id],
    queryFn: async () => (await apiPublica.get<TurnoEspera>(`/espera/${id}`)).data,
    refetchInterval: 60_000,
  });

  const conectado = useTiempoReal({}, id ? [{ entradaId: id }] : [], {
    [EVENTOS.esperaActualizada]: (t: TurnoEspera) => {
      if (t.id === id) qc.setQueryData(['turno', id], t);
    },
    [EVENTOS.notificacion]: (n: { tipo: string; mensaje: string }) => {
      if (n.tipo !== 'MESA_LISTA') return;
      setAviso(n.mensaje);
      sonar('listo');
      navigator.vibrate?.([300, 120, 300, 120, 300]);
      void qc.invalidateQueries({ queryKey: ['turno', id] });
    },
  });

  const salir = useMutation({
    mutationFn: async () => (await apiPublica.post<TurnoEspera>(`/espera/${id}/salir`)).data,
    onSuccess: (t) => qc.setQueryData(['turno', id], t),
  });

  // Un turno cerrado ya no se retoma desde la página de la fila
  const cerrado = turno.data && ['SENTADO', 'ABANDONO'].includes(turno.data.estado);
  useEffect(() => {
    if (!cerrado) return;
    try {
      localStorage.removeItem(CLAVE_TURNO);
    } catch {
      /* nada */
    }
  }, [cerrado]);

  if (turno.isLoading) return <Cargando />;
  if (turno.isError || !turno.data) return <Aviso>{mensajeError(turno.error)}</Aviso>;
  const t = turno.data;
  const lista = t.estado === 'NOTIFICADO';

  return (
    <div
      className={cx(
        '-mx-4 -my-8 min-h-[calc(100vh-65px)] px-4 py-10 text-center transition-colors',
        lista ? 'bg-brand-gold' : '',
      )}
    >
      <div className="mx-auto max-w-sm">
        <div className="flex justify-center">
          <EnVivo conectado={conectado} />
        </div>
        <p className="mt-6 text-lg">{t.nombre}, tu turno es el</p>
        <p className={cx('cifra text-[9rem] leading-none', lista ? 'text-ink' : 'text-brand-red')}>
          {t.numeroTurno}
        </p>

        {t.estado === 'ESPERANDO' && (
          <>
            <p className="text-2xl font-semibold">
              {t.posicion === 1
                ? 'Eres el siguiente'
                : `Hay ${(t.posicion ?? 1) - 1} grupos antes que tú`}
            </p>
            <p className="mt-2 text-ink-muted">
              Espera estimada: unos {t.esperaEstimadaMin} minutos para {t.personas} personas.
            </p>
            <p className="mt-6 text-sm text-ink-muted">
              Deja esta página abierta. Sonará y vibrará cuando tu mesa esté lista.
            </p>
          </>
        )}
        {lista && (
          <div className="animate-entra">
            <p className="text-3xl font-bold">¡Tu mesa está lista!</p>
            <p className="mt-2 text-lg">
              {aviso ?? (t.mesa ? `Te esperamos en la mesa ${t.mesa}.` : 'Acércate a la entrada.')}
            </p>
          </div>
        )}
        {t.estado === 'SENTADO' && (
          <p className="text-2xl font-semibold">
            Ya estás en tu mesa{t.mesa ? ` ${t.mesa}` : ''}. ¡Buen provecho!
          </p>
        )}
        {t.estado === 'ABANDONO' && (
          <>
            <p className="text-2xl font-semibold">Saliste de la fila</p>
            <Link to={`/portal/fila/${t.sedeId}`}>
              <Boton className="mt-6">Volver a anotarme</Boton>
            </Link>
          </>
        )}

        {(t.estado === 'ESPERANDO' || lista) && !puedeSalir && (
          <p className="mt-10 text-sm text-ink-muted">
            ¿Cambiaste de planes? Avísale al personal en la entrada.
          </p>
        )}
        {(t.estado === 'ESPERANDO' || lista) && puedeSalir && (
          <Boton
            variante={lista ? 'secundario' : 'fantasma'}
            className="mt-10"
            cargando={salir.isPending}
            onClick={() => confirm('¿Salir de la fila?') && salir.mutate()}
          >
            Ya no voy a esperar
          </Boton>
        )}
      </div>
    </div>
  );
}
