import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Middleware } from 'redux';
import { useDispatch, useSelector } from 'react-redux';
import { MARCA_POR_DEFECTO } from '@shared';
import type { Cliente, Configuracion, Dispositivo, Marca, Usuario } from '../domain/tipos';
import { apisRTK } from '../infrastructure/api';
import { consultaApi } from '../infrastructure/consulta-api';
import { CLAVES, borrar, escribir, leer } from '../infrastructure/almacenamiento';
import { registrarPuente } from '../infrastructure/sesion-puente';

interface SesionPersonal {
  token: string | null;
  usuario: Usuario | null;
  lista: boolean;
}

interface SesionCliente {
  token: string | null;
  cliente: Cliente | null;
  lista: boolean;
}

interface SesionDispositivo {
  token: string | null;
  dispositivo: Dispositivo | null;
  revocado: boolean;
}

const MARCA_INICIAL: Marca = { ...MARCA_POR_DEFECTO, logo: null };
const CONFIGURACION_INICIAL: Configuracion & { cargada: boolean } = {
  reservasHabilitadas: false,
  salirFilaHabilitado: true,
  cargada: false,
};

const personal = createSlice({
  name: 'personal',
  initialState: { token: null, usuario: null, lista: false } as SesionPersonal,
  reducers: {
    fijarPersonal: (
      estado,
      accion: PayloadAction<{ token: string; usuario: Usuario }>,
    ): SesionPersonal => ({
      token: accion.payload.token,
      usuario: accion.payload.usuario,
      lista: true,
    }),
    cerrarPersonal: (): SesionPersonal => ({ token: null, usuario: null, lista: true }),
    marcarPersonalLista: (estado): SesionPersonal => ({ ...estado, lista: true }),
  },
});

const cliente = createSlice({
  name: 'cliente',
  initialState: { token: null, cliente: null, lista: false } as SesionCliente,
  reducers: {
    fijarCliente: (
      estado,
      accion: PayloadAction<{ token: string; cliente: Cliente }>,
    ): SesionCliente => ({
      token: accion.payload.token,
      cliente: accion.payload.cliente,
      lista: true,
    }),
    cerrarCliente: (): SesionCliente => ({ token: null, cliente: null, lista: true }),
    marcarClienteLista: (estado): SesionCliente => ({ ...estado, lista: true }),
  },
});

const dispositivo = createSlice({
  name: 'dispositivo',
  initialState: leer<SesionDispositivo>(CLAVES.dispositivo, {
    token: null,
    dispositivo: null,
    revocado: false,
  }),
  reducers: {
    fijarDispositivo: (
      _estado,
      accion: PayloadAction<{ token: string; dispositivo: Dispositivo }>,
    ): SesionDispositivo => {
      escribir(CLAVES.dispositivo, {
        token: accion.payload.token,
        dispositivo: accion.payload.dispositivo,
      });
      return { token: accion.payload.token, dispositivo: accion.payload.dispositivo, revocado: false };
    },
    olvidarDispositivo: (
      _estado,
      accion: PayloadAction<boolean | undefined>,
    ): SesionDispositivo => {
      borrar(CLAVES.dispositivo);
      return { token: null, dispositivo: null, revocado: accion.payload ?? false };
    },
  },
});

const marca = createSlice({
  name: 'marca',
  initialState: { marca: leer<Marca>(CLAVES.marca, MARCA_INICIAL) },
  reducers: {
    establecerMarca: (_estado, accion: PayloadAction<Marca>) => {
      escribir(CLAVES.marca, accion.payload);
      return { marca: accion.payload };
    },
  },
});

const configuracion = createSlice({
  name: 'configuracion',
  initialState: CONFIGURACION_INICIAL,
  reducers: {
    aplicarConfiguracion: (
      estado,
      accion: PayloadAction<Configuracion>,
    ): Configuracion & { cargada: boolean } => ({
      reservasHabilitadas: accion.payload.reservasHabilitadas,
      salirFilaHabilitado: accion.payload.salirFilaHabilitado,
      cargada: true,
    }),
  },
});

export const {
  fijarPersonal,
  cerrarPersonal,
  marcarPersonalLista,
} = personal.actions;
export const { fijarCliente, cerrarCliente, marcarClienteLista } = cliente.actions;
export const { fijarDispositivo, olvidarDispositivo } = dispositivo.actions;
export const { establecerMarca } = marca.actions;
export const { aplicarConfiguracion } = configuracion.actions;

const middlewaresRTK: Middleware[] = [
  consultaApi.middleware as Middleware,
  ...apisRTK.map((api) => api.middleware as Middleware),
];

/** Todo el estado global (sesiones, marca y configuración) vive en este único store. */
export const store = configureStore({
  reducer: {
    [personal.name]: personal.reducer,
    [cliente.name]: cliente.reducer,
    [dispositivo.name]: dispositivo.reducer,
    [marca.name]: marca.reducer,
    [configuracion.name]: configuracion.reducer,
    [consultaApi.reducerPath]: consultaApi.reducer,
    ...Object.fromEntries(apisRTK.map((api) => [api.reducerPath, api.reducer])),
  },
  middleware: (obtenerPorDefecto) => obtenerPorDefecto().concat(...middlewaresRTK),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

registrarPuente({
  obtenerEstado: () => store.getState(),
  despachar: (accion) => store.dispatch(accion as never),
  fijarPersonal: (token, usuario) => store.dispatch(fijarPersonal({ token, usuario })),
  cerrarPersonal: () => store.dispatch(cerrarPersonal()),
  fijarCliente: (token, cliente) => store.dispatch(fijarCliente({ token, cliente })),
  cerrarCliente: () => store.dispatch(cerrarCliente()),
  fijarDispositivo: (token, dispositivo) =>
    store.dispatch(fijarDispositivo({ token, dispositivo })),
  olvidarDispositivo: (revocado) => store.dispatch(olvidarDispositivo(revocado)),
});
