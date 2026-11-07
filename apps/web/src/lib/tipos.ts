import type {
  CanalPedido,
  EstadoEspera,
  EstadoMesa,
  EstadoPedido,
  EstadoReserva,
  EstadoTurno,
  FormaMesa,
  MetodoPago,
  PuestoTurno,
  ReglaPromocion,
  RolUsuario,
  TipoDispositivo,
  TipoPromocion,
} from '@restaurantes/shared';

/** Montos: la API los envía como texto decimal ("29600.00"). */
export type Monto = string;

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  paisId: number | null;
  sedeId: number | null;
  sede?: { id: number; codigo: string; nombre: string } | null;
}

export interface Cliente {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
}

export interface Pais {
  id: number;
  codigoIso: string;
  nombre: string;
  moneda: string;
  tasaUsd: Monto;
  tasaImpuesto: Monto;
}

export interface Sede {
  id: number;
  codigo: string;
  nombre: string;
  direccion: string;
  zonaHoraria: string;
  prefijoPedido: string;
  horaApertura: string;
  horaCierre: string;
  duracionReservaMin: number;
  horasMinimasCancelacion: number;
  activa: boolean;
  ciudadId: number;
  ciudad: { id: number; nombre: string; paisId: number; pais: Pais };
}

export interface SedePublica {
  id: number;
  codigo: string;
  nombre: string;
  direccion: string;
  zonaHoraria: string;
  horaApertura: string;
  horaCierre: string;
  duracionReservaMin: number;
  horasMinimasCancelacion: number;
  ciudad: { nombre: string; pais: { nombre: string; codigoIso: string; moneda: string } };
}

export interface ProductoMenu {
  id: number;
  sku: string;
  nombre: string;
  descripcion: string;
  imagenUrl: string | null;
  categoriaId: number;
  precio: Monto;
  esCombo: boolean;
  componentes: { productoId: number; nombre: string; cantidad: number }[];
  /** Lo que costaría el contenido del combo por separado */
  precioSuelto: number | null;
  promocion: {
    id: number;
    nombre: string;
    tipo: TipoPromocion;
    etiqueta: string;
    precioConPromocion: number | null;
  } | null;
}

export interface Menu {
  sede: { id: number; nombre: string; moneda: string; tasaImpuesto: Monto };
  categorias: { id: number; nombre: string; icono: string; productos: ProductoMenu[] }[];
  promociones: (ReglaPromocion & { descripcion: string })[];
}

export type EstadoPromocion = 'VIGENTE' | 'FUERA_DE_HORARIO' | 'PROGRAMADA' | 'VENCIDA' | 'PAUSADA';

export interface Promocion {
  id: number;
  nombre: string;
  descripcion: string;
  tipo: TipoPromocion;
  productoId: number | null;
  categoriaId: number | null;
  porcentaje: number | null;
  precioEspecial: Monto | null;
  llevaN: number | null;
  pagaM: number | null;
  fechaInicio: string;
  fechaFin: string | null;
  diasSemana: number[];
  horaInicio: string | null;
  horaFin: string | null;
  activa: boolean;
  etiqueta: string;
  estado: EstadoPromocion;
  usos: number;
  producto: { id: number; nombre: string; sku: string; esCombo: boolean } | null;
  categoria: { id: number; nombre: string } | null;
  sedes: { id: number; codigo: string; nombre: string }[];
  otrasSedes: number;
}

export interface Combo {
  id: number;
  sku: string;
  nombre: string;
  imagenUrl: string | null;
  descripcion: string;
  activo: boolean;
  categoriaId: number;
  componentes: {
    productoId: number;
    cantidad: number;
    producto: { id: number; nombre: string; sku: string };
  }[];
  sedes: {
    sede: { id: number; codigo: string; nombre: string };
    precio: Monto;
    disponible: boolean;
    precioSuelto: number;
  }[];
}

export interface ProductoCatalogo {
  id: number;
  sku: string;
  nombre: string;
  esCombo: boolean;
  activo: boolean;
  categoria: { id: number; nombre: string; orden: number };
}

export interface Categoria {
  id: number;
  nombre: string;
  icono: string;
  orden: number;
}

export interface ProductoGestion {
  id: number;
  sku: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
  esCombo: boolean;
  imagenUrl: string | null;
  categoria: { id: number; nombre: string; orden: number; icono: string };
  enMenu: boolean;
  precio: Monto | null;
  disponible: boolean;
}

export interface PedidoItem {
  id: string;
  productoId: number;
  nombreProducto: string;
  cantidad: number;
  precioUnitario: Monto;
  descuento: Monto;
  subtotal: Monto;
  notas: string | null;
  promocionNombre: string | null;
  componentes: { nombre: string; cantidad: number }[] | null;
}

export interface Pedido {
  id: string;
  sedeId: number;
  codigo: string;
  canal: CanalPedido;
  estado: EstadoPedido;
  clienteNombre: string | null;
  cajero: { id: string; nombre: string } | null;
  subtotal: Monto;
  descuento: Monto;
  impuestos: Monto;
  total: Monto;
  moneda: string;
  totalUsd: Monto;
  metodoPago: MetodoPago;
  creadoEn: string;
  listoEn: string | null;
  entregadoEn: string | null;
  items: PedidoItem[];
  minutosTranscurridos?: number;
}

export interface PedidoPantalla {
  id: string;
  codigo: string;
  estado: EstadoPedido;
  clienteNombre: string | null;
  creadoEn: string;
  listoEn: string | null;
}

export interface Mesa {
  id: number;
  sedeId: number;
  codigo: string;
  capacidad: number;
  zona: string;
  forma: FormaMesa;
  posX: number;
  posY: number;
  ancho: number;
  alto: number;
  rotacion: number;
  estado: EstadoMesa;
  activa: boolean;
  sesionActual: {
    id: string;
    origen: string;
    personas: number;
    inicio: string;
    minutos: number;
  } | null;
  proximaReserva: {
    id: string;
    hora: string;
    inicio: string;
    personas: number;
    estado: EstadoReserva;
    cliente: { nombre: string; telefono: string };
    codigoConfirmacion: string;
  } | null;
}

export interface PanelMesas {
  lienzo: { ancho: number; alto: number };
  resumen: Record<EstadoMesa, number> & { total: number; ocupacionPct: number };
  mesas: Mesa[];
}

export interface Reserva {
  id: string;
  sedeId: number;
  clienteId: string;
  mesaId: number | null;
  inicio: string;
  fin: string;
  fecha: string;
  hora: string;
  duracionMin: number;
  personas: number;
  estado: EstadoReserva;
  codigoConfirmacion: string;
  notas: string | null;
  mesa: { id: number; codigo: string; zona: string; capacidad: number } | null;
  sede: { id: number; codigo: string; nombre: string; direccion: string; zonaHoraria: string };
  cliente: { id: string; nombre: string; email: string; telefono: string };
  puedeModificar?: boolean;
  puedeCalificar?: boolean;
}

export interface Franja {
  hora: string;
  inicio: string;
  mesasLibres: number;
  disponible: boolean;
}

export interface TurnoEspera {
  id: string;
  sedeId: number;
  numeroTurno: number;
  nombre: string;
  personas: number;
  estado: EstadoEspera;
  posicion: number | null;
  esperaEstimadaMin: number | null;
  mesa: string | null;
  creadoEn: string;
  notificadoEn: string | null;
  telefono?: string;
}

export interface Turno {
  id: string;
  sedeId: number;
  usuarioId: string;
  puesto: PuestoTurno;
  inicio: string;
  fin: string;
  estado: EstadoTurno;
  entradaReal: string | null;
  salidaReal: string | null;
  notas: string | null;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  horas: number;
  usuario: { id: string; nombre: string; rol: RolUsuario };
}

export interface SemanaTurnos {
  desde: string;
  hasta: string;
  zonaHoraria: string;
  datos: Turno[];
  resumen: { usuarioId: string; nombre: string; horas: number; turnos: number }[];
}

export interface Personal {
  id: string;
  nombre: string;
  rol: RolUsuario;
  email: string;
}

export interface Kpis {
  periodo: { desde: string; hasta: string; dias: number };
  sedes: number;
  ventasUsd: number;
  pedidos: number;
  ticketPromedioUsd: number | null;
  tiempoPreparacionMin: number | null;
  tasaCancelacionPct: number | null;
  calificacionPromedio: number | null;
  calificaciones: number;
  variacionPct: {
    ventasUsd: number | null;
    pedidos: number | null;
    ticketPromedioUsd: number | null;
    tiempoPreparacionMin: number | null;
  };
}

export interface FilaVentas {
  clave: string;
  etiqueta: string | null;
  pedidos: number;
  cancelados?: number;
  ventasUsd: number;
  ventasLocal?: number;
  moneda?: string;
  ticketPromedioUsd?: number | null;
  unidades?: number;
  sku?: string;
}

export interface Ocupacion {
  periodo: { desde: string; hasta: string; dias: number };
  resumen: {
    mesas: number;
    ocupacionPct: number | null;
    sesiones: number;
    comensales: number;
    rotacion: number | null;
    esperaPromedioMin: number | null;
    abandonoColaPct: number | null;
    reservas: number;
    cancelacionPct: number | null;
    noShowPct: number | null;
  };
  datos: {
    clave: string;
    etiqueta?: string;
    minutos: number;
    ocupacionPct: number | null;
    sesiones?: number;
    rotacion?: number | null;
    mesas?: number;
  }[];
}

export interface ReporteCalificaciones {
  promedio: number | null;
  total: number;
  distribucion: { puntaje: number; total: number }[];
  porSede: { clave: string; etiqueta: string; promedio: number; total: number }[];
  ultimosComentarios: {
    id: string;
    sede: string;
    puntaje: number;
    comentario: string;
    creadoEn: string;
  }[];
}

export interface Dispositivo {
  id: string;
  nombre: string;
  tipo: TipoDispositivo;
  sede: { id: number; codigo: string; nombre: string; zonaHoraria: string };
}

export interface Cupo {
  activos: number;
  cupo: number;
}
export type Cupos = Record<TipoDispositivo, Cupo>;

export interface EquipoSede {
  id: string;
  sedeId: number;
  nombre: string;
  tipo: TipoDispositivo;
  activo: boolean;
  creadoEn: string;
  ultimaConexionEn: string | null;
  enLinea: boolean;
  /** Solo al crear o al cambiar el token */
  token?: string;
}

export interface CuposSede {
  id: number;
  codigo: string;
  nombre: string;
  activa: boolean;
  ciudad: { id: number; nombre: string; pais: { id: number; nombre: string } };
  cupos: Cupos;
  enLinea: number;
}

export interface Paginado<T> {
  datos: T[];
  meta: { pagina: number; porPagina: number; total: number; paginas: number };
}
