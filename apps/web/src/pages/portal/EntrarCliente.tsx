import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useConfiguracion } from '../../lib/configuracion';
import { Aviso, Boton, Campo, Segmentos } from '../../components/ui';
import { apiPublica, mensajeError, useCliente } from '../../lib/sesion';
import type { Cliente } from '../../lib/tipos';
import { useSesionCliente } from './LayoutPortal';

export default function EntrarCliente() {
  const reservas = useConfiguracion((c) => c.reservasHabilitadas);
  const { cliente } = useSesionCliente();
  const fijar = useCliente((s) => s.fijar);
  const [params] = useSearchParams();
  const [modo, setModo] = useState<'entrar' | 'registro'>('entrar');
  const [datos, setDatos] = useState({ nombre: '', email: '', telefono: '', password: '' });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const volver = params.get('volver') ?? '/portal/mis-reservas';

  if (cliente) return <Navigate to={volver} replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const ruta = modo === 'entrar' ? '/clientes/auth/login' : '/clientes/auth/registro';
      const cuerpo = modo === 'entrar' ? { email: datos.email, password: datos.password } : datos;
      const { data } = await apiPublica.post<{ accessToken: string; cliente: Cliente }>(
        ruta,
        cuerpo,
      );
      fijar(data.accessToken, data.cliente);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  const campo = (k: keyof typeof datos) => ({
    value: datos[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setDatos({ ...datos, [k]: e.target.value }),
  });

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-3xl">{modo === 'entrar' ? 'Entra a tu cuenta' : 'Crea tu cuenta'}</h1>
      <p className="mt-1 mb-6 text-ink-muted">
        {reservas
          ? 'Para reservar y recibir el aviso cuando tu mesa esté lista.'
          : 'Para anotarte en la fila más rápido y recibir el aviso cuando tu mesa esté lista.'}
      </p>
      <Segmentos
        etiqueta="Tengo cuenta"
        valor={modo}
        onChange={(m) => (setModo(m), setError(''))}
        opciones={[
          { valor: 'entrar', texto: 'Ya tengo cuenta' },
          { valor: 'registro', texto: 'Soy nuevo' },
        ]}
      />
      <form onSubmit={enviar} className="mt-6 space-y-4">
        {modo === 'registro' && (
          <>
            <Campo etiqueta="Nombre">
              <input
                className="campo"
                required
                minLength={2}
                autoComplete="name"
                {...campo('nombre')}
              />
            </Campo>
            <Campo etiqueta="Celular">
              <input
                className="campo"
                type="tel"
                required
                autoComplete="tel"
                {...campo('telefono')}
              />
            </Campo>
          </>
        )}
        <Campo etiqueta="Correo">
          <input className="campo" type="email" required autoComplete="email" {...campo('email')} />
        </Campo>
        <Campo
          etiqueta="Contraseña"
          ayuda={modo === 'registro' ? 'Mínimo 8 caracteres.' : undefined}
        >
          <input
            className="campo"
            type="password"
            required
            minLength={modo === 'registro' ? 8 : 1}
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            {...campo('password')}
          />
        </Campo>
        {error && <Aviso>{error}</Aviso>}
        <Boton type="submit" className="w-full" tamano="lg" cargando={enviando}>
          {modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
        </Boton>
      </form>
      {modo === 'entrar' && (
        <p className="mt-6 text-center text-sm text-ink-muted">
          Cuenta de demostración: cliente@restaurantes.demo / Demo1234!
        </p>
      )}
    </div>
  );
}
