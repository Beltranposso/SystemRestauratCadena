import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { cerrarSesionPersonal, usePersonal } from '../lib/sesion';
import { SelectorSede } from './Filtros';
import { EnVivo, Marca } from './ui';

/** Barra superior de las pantallas de la sede (caja y cocina). */
export function BarraOperacion({
  titulo,
  conectado,
  extra,
}: {
  titulo: string;
  conectado: boolean;
  extra?: ReactNode;
}) {
  const usuario = usePersonal((s) => s.usuario);
  const esGerente =
    usuario && ['ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE'].includes(usuario.rol);
  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-2 bg-ink px-4 py-2.5 text-white">
      <Link to={esGerente ? '/admin' : '/'} aria-label="Inicio">
        <Marca claro compacta />
      </Link>
      <h1 className="text-xl">{titulo}</h1>
      <SelectorSede oscuro />
      <EnVivo conectado={conectado} claro />
      <div className="ml-auto flex items-center gap-4">
        {extra}
        <span className="hidden text-sm text-white/70 sm:inline">{usuario?.nombre}</span>
        <button
          onClick={() => void cerrarSesionPersonal()}
          className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Salir
        </button>
      </div>
    </header>
  );
}
