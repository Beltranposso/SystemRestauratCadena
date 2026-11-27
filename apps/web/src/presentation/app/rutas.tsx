import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { Cargando } from '../components/ui';
import { ErrorDeRuta } from '../pages/ErrorDeRuta';
import { RequiereDispositivo, RequierePersonal } from './guardias';

/** Carga diferida por pantalla: el kiosco no descarga las gráficas del dashboard. */
const pagina = (cargar: () => Promise<{ default: ComponentType }>) => async () => ({
  Component: (await cargar()).default,
});

/** Vista del portal que solo existe si la cadena recibe reservas de mesa. */
const conReservas = (cargar: () => Promise<{ default: ComponentType }>) => async () => {
  const [{ default: Vista }, { SoloConReservas }] = await Promise.all([
    cargar(),
    import('../pages/portal/SinReservas'),
  ]);
  return {
    Component: () => (
      <SoloConReservas>
        <Vista />
      </SoloConReservas>
    ),
  };
};

const Diferido = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<Cargando className="min-h-screen" />}>{children}</Suspense>
);

const LayoutAdmin = lazy(() => import('../pages/admin/LayoutAdmin'));
const Caja = lazy(() => import('../pages/operacion/Caja'));
const Cocina = lazy(() => import('../pages/operacion/Cocina'));
const Kiosco = lazy(() => import('../pages/operacion/Kiosco'));
const Pantalla = lazy(() => import('../pages/operacion/Pantalla'));
const Apariencia = lazy(() => import('../pages/admin/Apariencia'));
const Configuracion = lazy(() => import('../pages/admin/Configuracion'));

const GERENTES = ['ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE'] as const;

const rutas: RouteObject[] = [
  { path: '/', lazy: pagina(() => import('../pages/Inicio')) },
  { path: '/entrar', lazy: pagina(() => import('../pages/Entrar')) },
  { path: '/dispositivo', lazy: pagina(() => import('../pages/ConfigurarDispositivo')) },

  // ─── Fase 3: dashboard administrativo ───
  {
    path: '/admin',
    element: (
      <RequierePersonal roles={[...GERENTES]}>
        <Diferido>
          <LayoutAdmin />
        </Diferido>
      </RequierePersonal>
    ),
    children: [
      { index: true, lazy: pagina(() => import('../pages/admin/Dashboard')) },
      { path: 'servicio', lazy: pagina(() => import('../pages/admin/Servicio')) },
      { path: 'mesas', lazy: pagina(() => import('../pages/admin/Mesas')) },
      { path: 'turnos', lazy: pagina(() => import('../pages/admin/Turnos')) },
      { path: 'menu', lazy: pagina(() => import('../pages/admin/Menu')) },
      { path: 'combos', lazy: pagina(() => import('../pages/admin/Combos')) },
      { path: 'promociones', lazy: pagina(() => import('../pages/admin/Promociones')) },
      { path: 'equipos', lazy: pagina(() => import('../pages/admin/Dispositivos')) },
      {
        path: 'configuracion',
        element: (
          <RequierePersonal roles={['ADMIN_GLOBAL']}>
            <Diferido>
              <Configuracion />
            </Diferido>
          </RequierePersonal>
        ),
      },
      {
        path: 'apariencia',
        element: (
          <RequierePersonal roles={['ADMIN_GLOBAL']}>
            <Diferido>
              <Apariencia />
            </Diferido>
          </RequierePersonal>
        ),
      },
    ],
  },

  // ─── Fase 4: operación en la sede ───
  {
    path: '/caja',
    element: (
      <RequierePersonal roles={['CAJERO', ...GERENTES]}>
        <Diferido>
          <Caja />
        </Diferido>
      </RequierePersonal>
    ),
  },
  {
    path: '/cocina',
    element: (
      <RequierePersonal roles={['COCINA', ...GERENTES]}>
        <Diferido>
          <Cocina />
        </Diferido>
      </RequierePersonal>
    ),
  },
  {
    path: '/kiosco',
    element: (
      <RequiereDispositivo tipo="KIOSCO">
        <Diferido>
          <Kiosco />
        </Diferido>
      </RequiereDispositivo>
    ),
  },
  {
    path: '/pantalla',
    element: (
      <RequiereDispositivo tipo="PANTALLA">
        <Diferido>
          <Pantalla />
        </Diferido>
      </RequiereDispositivo>
    ),
  },

  // ─── Portal de clientes ───
  {
    path: '/portal',
    lazy: pagina(() => import('../pages/portal/LayoutPortal')),
    children: [
      { index: true, lazy: pagina(() => import('../pages/portal/Sedes')) },
      // Reservas de mesa: solo si el admin las activó en Configuración
      { path: 'reservar/:sedeId', lazy: conReservas(() => import('../pages/portal/Reservar')) },
      { path: 'reserva/:id', lazy: conReservas(() => import('../pages/portal/Confirmacion')) },
      { path: 'mis-reservas', lazy: conReservas(() => import('../pages/portal/MisReservas')) },
      { path: 'entrar', lazy: pagina(() => import('../pages/portal/EntrarCliente')) },
      { path: 'fila/:sedeId', lazy: pagina(() => import('../pages/portal/UnirseFila')) },
      { path: 'turno/:id', lazy: pagina(() => import('../pages/portal/MiTurno')) },
    ],
  },
];

export const enrutador = createBrowserRouter(
  rutas.map((r) => ({ ...r, errorElement: <ErrorDeRuta /> })),
);
