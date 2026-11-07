import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { Boton, Marca } from '../components/ui';

export function ErrorDeRuta() {
  const error = useRouteError();
  const noExiste = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <Marca />
      <h1 className="text-3xl">
        {noExiste ? 'Esta página no existe' : 'La pantalla dejó de responder'}
      </h1>
      <p className="max-w-sm text-ink-muted">
        {noExiste
          ? 'Revisa la dirección o vuelve al inicio.'
          : 'Recarga la página. Si sigue pasando, revisa que la API esté encendida.'}
      </p>
      <div className="flex gap-2">
        <Link to="/">
          <Boton variante="secundario">Ir al inicio</Boton>
        </Link>
        {!noExiste && <Boton onClick={() => window.location.reload()}>Recargar</Boton>}
      </div>
    </main>
  );
}
