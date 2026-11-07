import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Clock, MapPin } from 'lucide-react';
import { Boton, Cargando } from '../../components/ui';
import { apiPublica } from '../../lib/sesion';
import type { SedePublica } from '../../lib/tipos';
import { useConfiguracion } from '../../lib/configuracion';

export default function Sedes() {
  const reservas = useConfiguracion((c) => c.reservasHabilitadas);
  const sedes = useQuery({
    queryKey: ['sedes-publicas'],
    queryFn: async () => (await apiPublica.get<SedePublica[]>('/sedes/publicas')).data,
    staleTime: 10 * 60_000,
  });

  const porPais = new Map<string, SedePublica[]>();
  for (const s of sedes.data ?? [])
    porPais.set(s.ciudad.pais.nombre, [...(porPais.get(s.ciudad.pais.nombre) ?? []), s]);

  return (
    <div>
      <h1 className="max-w-lg text-4xl leading-tight">
        {reservas ? 'Reserva tu mesa' : 'Anótate en la fila'}
      </h1>
      <p className="mt-2 max-w-lg text-ink-muted">
        {reservas
          ? 'Elige la sede. Te mostramos las horas con mesa libre y confirmamos al instante.'
          : 'Elige la sede y te avisamos en tu celular cuando tu mesa esté lista. Sin esperar en la puerta.'}
      </p>

      {sedes.isLoading ? (
        <Cargando />
      ) : (
        [...porPais].map(([pais, lista]) => (
          <section key={pais} className="mt-10">
            <h2 className="border-b-2 border-ink pb-2 text-xl">{pais}</h2>
            <ul className="divide-y divide-line">
              {lista.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold">{s.nombre}</p>
                    <p className="flex flex-wrap gap-x-4 text-sm text-ink-muted">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" aria-hidden />
                        {s.direccion}, {s.ciudad.nombre}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" aria-hidden />
                        {s.horaApertura} a {s.horaCierre}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/portal/fila/${s.id}`}>
                      <Boton variante={reservas ? 'secundario' : 'primario'} tamano="sm">
                        Anotarme en la fila
                      </Boton>
                    </Link>
                    {reservas && (
                      <Link to={`/portal/reservar/${s.id}`}>
                        <Boton tamano="sm">Reservar</Boton>
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
