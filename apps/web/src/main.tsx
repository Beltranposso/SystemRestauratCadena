import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';
import { store } from './application/store';
import { enrutador } from './presentation/app/rutas';
import { SincronizarMarca, aplicarMarcaGuardada } from './infrastructure/marca';
import { SincronizarConfiguracion } from './infrastructure/configuracion';
// Fuentes alojadas con la app: el kiosco y la pantalla funcionan aunque no haya salida a Google Fonts
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/figtree';
import './presentation/styles.css';

aplicarMarcaGuardada();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <SincronizarMarca />
      <SincronizarConfiguracion />
      <RouterProvider router={enrutador} />
    </Provider>
  </StrictMode>,
);
