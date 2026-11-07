import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiPublica, mensajeError, useDispositivo } from '../lib/sesion';
import type { Dispositivo } from '../lib/tipos';
import { Aviso, Boton, Campo, Marca } from '../components/ui';

const DESTINO = { PANTALLA: '/pantalla', KIOSCO: '/kiosco' } as const;

/**
 * Configuración de una pantalla o kiosco: se pega el token que entregó el gerente
 * (o se abre /dispositivo?token=… desde un QR). Queda guardado en el equipo.
 */
export default function ConfigurarDispositivo() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const { dispositivo, fijar, olvidar, revocado } = useDispositivo();
  const [token, setToken] = useState(params.get('token') ?? '');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const tipo = params.get('tipo');

  async function vincular(t: string) {
    setError('');
    setEnviando(true);
    try {
      const { data } = await apiPublica.get<Dispositivo>('/dispositivos/yo', {
        headers: { 'X-Device-Token': t.trim() },
      });
      fijar(t.trim(), data);
      navegar(DESTINO[data.tipo], { replace: true });
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  useEffect(() => {
    const desdeUrl = params.get('token');
    if (desdeUrl) void vincular(desdeUrl);
    // Solo al abrir un enlace que ya trae el token
  }, []);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    void vincular(token);
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Marca />
        <h1 className="mt-6 text-3xl">Vincular este equipo</h1>
        <p className="mt-2 text-ink-muted">
          {tipo === 'KIOSCO'
            ? 'Este kiosco'
            : tipo === 'PANTALLA'
              ? 'Esta pantalla'
              : 'Este equipo'}{' '}
          necesita el token de dispositivo de la sede. El gerente lo genera en el dashboard y se
          muestra una sola vez.
        </p>

        {revocado && !dispositivo && (
          <div className="mt-6">
            <Aviso>
              Este equipo fue desactivado o su token se cambió desde el dashboard. Pide al gerente
              un token nuevo para volver a vincularlo.
            </Aviso>
          </div>
        )}

        {dispositivo && (
          <div className="mt-6 rounded-xl border border-line bg-white p-4">
            <p className="text-sm text-ink-muted">Vinculado ahora</p>
            <p className="font-semibold">
              {dispositivo.nombre}, {dispositivo.sede.nombre}
            </p>
            <div className="mt-3 flex gap-2">
              <Link to={DESTINO[dispositivo.tipo]}>
                <Boton tamano="sm">
                  Abrir {dispositivo.tipo === 'PANTALLA' ? 'pantalla' : 'kiosco'}
                </Boton>
              </Link>
              <Boton tamano="sm" variante="peligro" onClick={() => olvidar()}>
                Desvincular
              </Boton>
            </div>
          </div>
        )}

        <form onSubmit={enviar} className="mt-6 space-y-4">
          <Campo
            etiqueta="Token de dispositivo"
            ayuda="Lo genera el gerente en el dashboard, en Pantallas y kioscos. En la demo: pantalla-ctg-01-demo o kiosco-ctg-01-demo (cambia ctg-01 por otra sede)."
          >
            <input
              className="campo font-mono"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </Campo>
          {error && <Aviso>{error}</Aviso>}
          <Boton type="submit" cargando={enviando} className="w-full">
            Vincular
          </Boton>
        </form>
      </div>
    </main>
  );
}
