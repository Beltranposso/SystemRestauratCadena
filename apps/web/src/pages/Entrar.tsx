import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { apiPublica, mensajeError, usePersonal } from '../lib/sesion';
import { RUTA_INICIO_ROL, useRestaurarSesion } from '../app/guardias';
import { Aviso, Boton, Campo, Cargando, Marca } from '../components/ui';
import { ETIQUETA_ROL } from '../lib/formato';
import type { Usuario } from '../lib/tipos';

/** Cuentas del seed, para probar cada rol con un clic. */
const DEMO = [
  { email: 'admin@restaurantes.demo', rol: 'ADMIN_GLOBAL' },
  { email: 'gerente.co@restaurantes.demo', rol: 'GERENTE_PAIS' },
  { email: 'gerente.ctg01@restaurantes.demo', rol: 'GERENTE_SEDE' },
  { email: 'cajero1.ctg01@restaurantes.demo', rol: 'CAJERO' },
  { email: 'cocina1.ctg01@restaurantes.demo', rol: 'COCINA' },
];

export default function Entrar() {
  const lista = useRestaurarSesion();
  const usuario = usePersonal((s) => s.usuario);
  const fijar = usePersonal((s) => s.fijar);
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (!lista) return <Cargando className="min-h-screen" />;
  if (usuario)
    return <Navigate to={params.get('volver') ?? RUTA_INICIO_ROL[usuario.rol]} replace />;

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const { data } = await apiPublica.post<{ accessToken: string; usuario: Usuario }>(
        '/auth/login',
        { email, password },
      );
      fijar(data.accessToken, data.usuario);
      navegar(params.get('volver') ?? RUTA_INICIO_ROL[data.usuario.rol], { replace: true });
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <section className="hidden flex-col justify-between bg-ink p-10 text-white lg:flex">
        <Marca claro />
        <div>
          <p className="cifra text-[9rem] leading-[0.85] text-brand-gold">A-042</p>
          <p className="mt-4 max-w-sm text-lg text-white/70">
            El mismo pedido, de la caja a la cocina y a la pantalla del local, en menos de un
            segundo.
          </p>
        </div>
        <p className="text-sm text-white/50">Acceso para el personal de la cadena</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Marca />
          </div>
          <h1 className="text-3xl">Entrar</h1>
          <p className="mt-1 text-ink-muted">Usa el correo de tu cuenta de trabajo.</p>

          <form onSubmit={entrar} className="mt-6 space-y-4">
            <Campo etiqueta="Correo">
              <input
                className="campo"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Campo>
            <Campo etiqueta="Contraseña">
              <input
                className="campo"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Campo>
            {error && <Aviso>{error}</Aviso>}
            <Boton type="submit" cargando={enviando} className="w-full" tamano="lg">
              Entrar
            </Boton>
          </form>

          <details className="mt-8 rounded-xl border border-line bg-white p-4 text-sm">
            <summary className="cursor-pointer font-semibold">Cuentas de demostración</summary>
            <p className="mt-2 text-ink-muted">Contraseña de todas: Demo1234!</p>
            <ul className="mt-3 space-y-1">
              {DEMO.map((d) => (
                <li key={d.email}>
                  <button
                    type="button"
                    className="flex w-full justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-canvas"
                    onClick={() => {
                      setEmail(d.email);
                      setPassword('Demo1234!');
                    }}
                  >
                    <span className="truncate">{d.email}</span>
                    <span className="shrink-0 text-ink-muted">{ETIQUETA_ROL[d.rol]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </section>
    </main>
  );
}
