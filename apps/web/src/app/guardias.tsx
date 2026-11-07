import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import type { RolUsuario } from '@restaurantes/shared';
import { Boton, Cargando, Marca } from '../components/ui';
import { cerrarSesionPersonal, renovarPersonal, useDispositivo, usePersonal } from '../lib/sesion';
import { ETIQUETA_ROL } from '../lib/formato';

let restaurando: Promise<unknown> | null = null;

/** Al cargar la app se intenta recuperar la sesión con la cookie de refresh (una sola vez). */
export function useRestaurarSesion() {
  const lista = usePersonal((s) => s.lista);
  useEffect(() => {
    if (!lista) restaurando ??= renovarPersonal();
  }, [lista]);
  return lista;
}

export const RUTA_INICIO_ROL: Record<RolUsuario, string> = {
  ADMIN_GLOBAL: '/admin',
  GERENTE_PAIS: '/admin',
  GERENTE_SEDE: '/admin',
  CAJERO: '/caja',
  COCINA: '/cocina',
};

/** Solo deja pasar al personal con alguno de los roles indicados. */
export function RequierePersonal({
  roles,
  children,
}: {
  roles?: RolUsuario[];
  children: ReactNode;
}) {
  const lista = useRestaurarSesion();
  const usuario = usePersonal((s) => s.usuario);
  const ubicacion = useLocation();

  if (!lista) return <Cargando texto="Verificando tu sesión…" className="min-h-screen" />;
  if (!usuario)
    return (
      <Navigate
        to={`/entrar?volver=${encodeURIComponent(ubicacion.pathname + ubicacion.search)}`}
        replace
      />
    );
  if (roles && !roles.includes(usuario.rol)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <Marca />
        <h1 className="text-2xl">Esta pantalla no es para tu rol</h1>
        <p className="max-w-sm text-ink-muted">
          Entraste como {ETIQUETA_ROL[usuario.rol]}. Ve a tu pantalla de trabajo o entra con otra
          cuenta.
        </p>
        <div className="flex gap-2">
          <Link to={RUTA_INICIO_ROL[usuario.rol]}>
            <Boton>Ir a mi pantalla</Boton>
          </Link>
          <Boton variante="secundario" onClick={() => void cerrarSesionPersonal()}>
            Cambiar de cuenta
          </Boton>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

/** Pantallas de dispositivo: sin token, envía a la configuración del equipo. */
export function RequiereDispositivo({
  tipo,
  children,
}: {
  tipo: 'PANTALLA' | 'KIOSCO';
  children: ReactNode;
}) {
  const dispositivo = useDispositivo((s) => s.dispositivo);
  if (!dispositivo || dispositivo.tipo !== tipo)
    return <Navigate to={`/dispositivo?tipo=${tipo}`} replace />;
  return <>{children}</>;
}
