import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  CalendarClock,
  ChefHat,
  LayoutGrid,
  LogOut,
  Palette,
  SlidersHorizontal,
  MonitorSmartphone,
  Package,
  ReceiptText,
  Soup,
  Star,
  Tag,
  TrendingUp,
} from 'lucide-react';
import { cerrarSesionPersonal, usePersonal } from '../../lib/sesion';
import { ETIQUETA_ROL } from '../../lib/formato';
import { cx, Marca } from '../../components/ui';

const NAV = [
  { a: '/admin', fin: true, icono: TrendingUp, texto: 'Ventas' },
  { a: '/admin/servicio', icono: Star, texto: 'Ocupación y servicio' },
  { a: '/admin/mesas', icono: LayoutGrid, texto: 'Mesas y fila' },
  { a: '/admin/turnos', icono: CalendarClock, texto: 'Turnos' },
  { a: '/admin/menu', icono: Soup, texto: 'Menú' },
  { a: '/admin/combos', icono: Package, texto: 'Combos' },
  { a: '/admin/promociones', icono: Tag, texto: 'Promociones' },
  { a: '/admin/equipos', icono: MonitorSmartphone, texto: 'Pantallas y kioscos' },
  { a: '/admin/configuracion', icono: SlidersHorizontal, texto: 'Configuración', soloAdmin: true },
  { a: '/admin/apariencia', icono: Palette, texto: 'Apariencia', soloAdmin: true },
];

export default function LayoutAdmin() {
  const usuario = usePersonal((s) => s.usuario)!;
  const { search } = useLocation();
  // Conserva la sede elegida al cambiar de sección
  const sede = new URLSearchParams(search).get('sedeId');
  const sufijo = sede ? `?sedeId=${sede}` : '';

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 z-30 flex flex-col bg-ink text-white lg:h-screen">
        <div className="flex items-center justify-between gap-3 px-5 py-4 lg:py-6">
          <Marca claro />
        </div>

        <nav
          aria-label="Secciones"
          className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:pb-0"
        >
          {NAV.filter((n) => !('soloAdmin' in n) || usuario.rol === 'ADMIN_GLOBAL').map(
            ({ a, fin, icono: Icono, texto }) => (
              <NavLink
                key={a}
                to={a + sufijo}
                end={fin}
                className={({ isActive }) =>
                  cx(
                    'flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-white text-ink'
                      : 'text-white/70 hover:bg-white/10 hover:text-white',
                  )
                }
              >
                <Icono className="h-4 w-4" aria-hidden />
                {texto}
              </NavLink>
            ),
          )}

          <div className="hidden pt-6 lg:block">
            <p className="px-3 pb-2 text-xs text-white/40">Abrir en la sede</p>
            <a
              href={`/caja${sufijo}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
            >
              <ReceiptText className="h-4 w-4" aria-hidden /> Caja
            </a>
            <a
              href={`/cocina${sufijo}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
            >
              <ChefHat className="h-4 w-4" aria-hidden /> Cocina
            </a>
          </div>
        </nav>

        <div className="hidden border-t border-white/10 p-4 lg:block">
          <p className="truncate text-sm font-semibold">{usuario.nombre}</p>
          <p className="truncate text-xs text-white/50">
            {ETIQUETA_ROL[usuario.rol]}
            {usuario.sede ? `, ${usuario.sede.nombre}` : ''}
          </p>
          <button
            onClick={() => void cerrarSesionPersonal()}
            className="mt-3 flex items-center gap-2 text-sm text-white/60 hover:text-white"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-6 sm:px-8">
        <Outlet />
      </main>
    </div>
  );
}
