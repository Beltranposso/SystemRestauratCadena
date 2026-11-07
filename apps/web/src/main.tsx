import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { enrutador } from './app/rutas';
import { SincronizarMarca, aplicarMarcaGuardada } from './lib/marca';
import { SincronizarConfiguracion } from './lib/configuracion';
// Fuentes alojadas con la app: el kiosco y la pantalla funcionan aunque no haya salida a Google Fonts
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/figtree';
import './styles.css';

const clienteConsultas = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
  },
});

aplicarMarcaGuardada();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={clienteConsultas}>
      <SincronizarMarca />
      <SincronizarConfiguracion />
      <RouterProvider router={enrutador} />
    </QueryClientProvider>
  </StrictMode>,
);
