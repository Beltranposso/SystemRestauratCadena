/**
 * Datos de referencia del seed. Las tasas de cambio e impuestos son valores de
 * demostración: el admin global los ajusta desde la API.
 */

export const PASSWORD_DEMO = 'Demo1234!';
export const DOMINIO = 'restaurantes.demo';

export interface SedeSeed {
  codigo: string;
  nombre: string;
  direccion: string;
  prefijo: string;
  /** Multiplicador de demanda (1 = sede promedio) */
  demanda: number;
  /** Ajuste de precios de la sede sobre el precio del país (1.05 = 5 % más caro) */
  ajustePrecio: number;
  /** Cupos de equipos que asignó el gerente de país (por defecto 2 kioscos y 1 pantalla) */
  cupoKioscos?: number;
  cupoPantallas?: number;
  /** Kioscos ya instalados (por defecto 1) */
  kioscos?: number;
}

export interface PaisSeed {
  codigoIso: string;
  nombre: string;
  moneda: string;
  tasaUsd: number;
  tasaImpuesto: number;
  zonaHoraria: string;
  /** Precios se redondean a este múltiplo (COP de 100 en 100) */
  redondeo: number;
  /** Ajuste de precios del país sobre el precio base en USD */
  ajustePrecio: number;
  ciudades: { nombre: string; sedes: SedeSeed[] }[];
}

export const PAISES: PaisSeed[] = [
  {
    codigoIso: 'CO',
    nombre: 'Colombia',
    moneda: 'COP',
    tasaUsd: 4000,
    tasaImpuesto: 0.08,
    zonaHoraria: 'America/Bogota',
    redondeo: 100,
    ajustePrecio: 1,
    ciudades: [
      {
        nombre: 'Cartagena',
        sedes: [
          { codigo: 'CTG-01', nombre: 'Cartagena Bocagrande', direccion: 'Av. San Martín #8-23, Bocagrande', prefijo: 'A', demanda: 1.2, ajustePrecio: 1.05, cupoKioscos: 3, cupoPantallas: 2, kioscos: 2 },
          { codigo: 'CTG-02', nombre: 'Cartagena Centro Histórico', direccion: 'Calle de la Moneda #7-52, Centro', prefijo: 'B', demanda: 1.0, ajustePrecio: 1.05 },
        ],
      },
      {
        nombre: 'Barranquilla',
        sedes: [
          { codigo: 'BAQ-01', nombre: 'Barranquilla Alto Prado', direccion: 'Carrera 53 #79-212, Alto Prado', prefijo: 'F', demanda: 1.0, ajustePrecio: 1 },
        ],
      },
      {
        nombre: 'Bogotá',
        sedes: [
          { codigo: 'BOG-01', nombre: 'Bogotá Chapinero', direccion: 'Carrera 13 #57-40, Chapinero', prefijo: 'C', demanda: 1.3, ajustePrecio: 1 },
          { codigo: 'BOG-02', nombre: 'Bogotá Usaquén', direccion: 'Calle 119 #6-20, Usaquén', prefijo: 'D', demanda: 0.9, ajustePrecio: 1 },
        ],
      },
      {
        nombre: 'Medellín',
        sedes: [
          { codigo: 'MED-01', nombre: 'Medellín El Poblado', direccion: 'Carrera 37 #8A-46, El Poblado', prefijo: 'E', demanda: 1.1, ajustePrecio: 1 },
        ],
      },
    ],
  },
  {
    codigoIso: 'MX',
    nombre: 'México',
    moneda: 'MXN',
    tasaUsd: 18.5,
    tasaImpuesto: 0.16,
    zonaHoraria: 'America/Mexico_City',
    redondeo: 1,
    ajustePrecio: 1.05,
    ciudades: [
      {
        nombre: 'Ciudad de México',
        sedes: [
          { codigo: 'CDMX-01', nombre: 'CDMX Polanco', direccion: 'Av. Presidente Masaryk 360, Polanco', prefijo: 'A', demanda: 1.25, ajustePrecio: 1.04 },
        ],
      },
      {
        nombre: 'Guadalajara',
        sedes: [
          { codigo: 'GDL-01', nombre: 'Guadalajara Chapultepec', direccion: 'Av. Chapultepec Sur 120, Americana', prefijo: 'B', demanda: 0.95, ajustePrecio: 1 },
        ],
      },
    ],
  },
  {
    codigoIso: 'PE',
    nombre: 'Perú',
    moneda: 'PEN',
    tasaUsd: 3.75,
    tasaImpuesto: 0.18,
    zonaHoraria: 'America/Lima',
    redondeo: 0.1,
    ajustePrecio: 0.95,
    ciudades: [
      {
        nombre: 'Lima',
        sedes: [
          { codigo: 'LIM-01', nombre: 'Lima Miraflores', direccion: 'Av. José Larco 812, Miraflores', prefijo: 'A', demanda: 1.05, ajustePrecio: 1 },
        ],
      },
    ],
  },
];

/** Íconos de lucide-react (los usa el frontend). */
export const CATEGORIAS = [
  { nombre: 'Combos', icono: 'package', orden: 1 },
  { nombre: 'Hamburguesas', icono: 'sandwich', orden: 2 },
  { nombre: 'Pollo', icono: 'drumstick', orden: 3 },
  { nombre: 'Acompañantes', icono: 'salad', orden: 4 },
  { nombre: 'Bebidas', icono: 'cup-soda', orden: 5 },
  { nombre: 'Postres', icono: 'ice-cream-cone', orden: 6 },
  { nombre: 'Especiales', icono: 'star', orden: 7 },
] as const;

export interface ProductoSeed {
  sku: string;
  nombre: string;
  descripcion: string;
  categoria: (typeof CATEGORIAS)[number]['nombre'];
  precioUsd: number;
  /** Peso de popularidad para los pedidos sintéticos */
  popularidad: number;
  /** Si se define, el producto solo existe en esos países (menú regional) */
  paises?: string[];
  /** Si se define, solo se vende en esas sedes (menú propio de la sede) */
  sedes?: string[];
  /** Combos: contenido fijo [sku, cantidad]. El precio del combo sale de precioUsd */
  componentes?: [string, number][];
}

export const PRODUCTOS: ProductoSeed[] = [
  { sku: 'COM-001', nombre: 'Combo Clásico', descripcion: 'Hamburguesa clásica, papas medianas y gaseosa', categoria: 'Combos', precioUsd: 7.4, popularidad: 16, componentes: [['HAM-001', 1], ['ACO-001', 1], ['BEB-001', 1]] },
  { sku: 'COM-002', nombre: 'Combo Doble Queso', descripcion: 'Doble Queso, papas medianas y gaseosa', categoria: 'Combos', precioUsd: 8.9, popularidad: 12, componentes: [['HAM-002', 1], ['ACO-001', 1], ['BEB-001', 1]] },
  { sku: 'COM-003', nombre: 'Combo Pollo Crispy', descripcion: 'Hamburguesa de pollo crispy, papas medianas y limonada', categoria: 'Combos', precioUsd: 8.2, popularidad: 9, componentes: [['HAM-004', 1], ['ACO-001', 1], ['BEB-002', 1]] },
  { sku: 'COM-004', nombre: 'Combo Familiar', descripcion: '4 hamburguesas clásicas, 2 papas grandes y 4 bebidas', categoria: 'Combos', precioUsd: 24.9, popularidad: 4, componentes: [['HAM-001', 4], ['ACO-002', 2], ['BEB-001', 4]] },
  { sku: 'COM-CTG', nombre: 'Combo Costeño', descripcion: 'Hamburguesa clásica, arepa con queso y jugo de lulo', categoria: 'Combos', precioUsd: 7.9, popularidad: 6, sedes: ['CTG-01', 'CTG-02'], componentes: [['HAM-001', 1], ['REG-CO1', 1], ['REG-CO2', 1]] },
  { sku: 'COM-BAQ', nombre: 'Combo Carnaval', descripcion: 'BBQ Bacon, aros de cebolla y limonada natural', categoria: 'Combos', precioUsd: 10.2, popularidad: 6, sedes: ['BAQ-01'], componentes: [['HAM-003', 1], ['ACO-003', 1], ['BEB-002', 1]] },
  { sku: 'HAM-001', nombre: 'Hamburguesa Clásica', descripcion: 'Carne de res 120 g, queso, lechuga, tomate y salsa de la casa', categoria: 'Hamburguesas', precioUsd: 4.5, popularidad: 10 },
  { sku: 'HAM-002', nombre: 'Doble Queso', descripcion: 'Dos carnes de res, doble queso cheddar, pepinillos y cebolla', categoria: 'Hamburguesas', precioUsd: 6.2, popularidad: 8 },
  { sku: 'HAM-003', nombre: 'BBQ Bacon', descripcion: 'Carne de res, tocineta crocante, aros de cebolla y salsa BBQ', categoria: 'Hamburguesas', precioUsd: 6.8, popularidad: 7 },
  { sku: 'HAM-004', nombre: 'Pollo Crispy', descripcion: 'Pechuga apanada, lechuga y mayonesa de ajo', categoria: 'Hamburguesas', precioUsd: 5.4, popularidad: 6 },
  { sku: 'HAM-005', nombre: 'Veggie Garden', descripcion: 'Medallón de garbanzo y quinoa, aguacate y vegetales asados', categoria: 'Hamburguesas', precioUsd: 5.6, popularidad: 3 },
  { sku: 'POL-001', nombre: 'Alitas BBQ x6', descripcion: 'Seis alitas glaseadas en salsa BBQ', categoria: 'Pollo', precioUsd: 5.9, popularidad: 6 },
  { sku: 'POL-002', nombre: 'Tiras de Pollo x5', descripcion: 'Cinco tiras de pechuga apanada con salsa miel mostaza', categoria: 'Pollo', precioUsd: 5.2, popularidad: 6 },
  { sku: 'POL-003', nombre: 'Nuggets x10', descripcion: 'Diez nuggets de pollo con dos salsas', categoria: 'Pollo', precioUsd: 4.6, popularidad: 7 },
  { sku: 'ACO-001', nombre: 'Papas Medianas', descripcion: 'Papas a la francesa, porción mediana', categoria: 'Acompañantes', precioUsd: 2.2, popularidad: 12 },
  { sku: 'ACO-002', nombre: 'Papas Grandes', descripcion: 'Papas a la francesa, porción grande', categoria: 'Acompañantes', precioUsd: 2.8, popularidad: 7 },
  { sku: 'ACO-003', nombre: 'Aros de Cebolla', descripcion: 'Ocho aros de cebolla apanados', categoria: 'Acompañantes', precioUsd: 2.9, popularidad: 4 },
  { sku: 'ACO-004', nombre: 'Ensalada César', descripcion: 'Lechuga romana, pollo a la plancha, crutones y parmesano', categoria: 'Acompañantes', precioUsd: 4.1, popularidad: 3 },
  { sku: 'BEB-001', nombre: 'Gaseosa Mediana', descripcion: 'Bebida gaseosa de 16 oz', categoria: 'Bebidas', precioUsd: 1.8, popularidad: 13 },
  { sku: 'BEB-002', nombre: 'Limonada Natural', descripcion: 'Limonada natural de 16 oz', categoria: 'Bebidas', precioUsd: 2.3, popularidad: 7 },
  { sku: 'BEB-003', nombre: 'Té Helado', descripcion: 'Té negro con limón de 16 oz', categoria: 'Bebidas', precioUsd: 2.0, popularidad: 4 },
  { sku: 'BEB-004', nombre: 'Agua', descripcion: 'Agua sin gas de 500 ml', categoria: 'Bebidas', precioUsd: 1.2, popularidad: 5 },
  { sku: 'POS-001', nombre: 'Cono de Vainilla', descripcion: 'Helado suave de vainilla', categoria: 'Postres', precioUsd: 1.6, popularidad: 6 },
  { sku: 'POS-002', nombre: 'Brownie con Helado', descripcion: 'Brownie tibio con bola de helado de vainilla', categoria: 'Postres', precioUsd: 3.2, popularidad: 4 },
  { sku: 'POS-003', nombre: 'Pie de Manzana', descripcion: 'Pie de manzana y canela', categoria: 'Postres', precioUsd: 2.1, popularidad: 3 },
  { sku: 'REG-CO1', nombre: 'Arepa con Queso', descripcion: 'Arepa asada rellena de queso costeño', categoria: 'Especiales', precioUsd: 2.1, popularidad: 5, paises: ['CO'] },
  { sku: 'REG-CO2', nombre: 'Jugo de Lulo', descripcion: 'Jugo natural de lulo de 16 oz', categoria: 'Especiales', precioUsd: 2.2, popularidad: 4, paises: ['CO'] },
  { sku: 'REG-MX1', nombre: 'Tacos al Pastor x3', descripcion: 'Tres tacos de cerdo al pastor con piña y cilantro', categoria: 'Especiales', precioUsd: 4.8, popularidad: 7, paises: ['MX'] },
  { sku: 'REG-MX2', nombre: 'Agua de Horchata', descripcion: 'Agua fresca de horchata de 16 oz', categoria: 'Especiales', precioUsd: 1.9, popularidad: 4, paises: ['MX'] },
  { sku: 'REG-PE1', nombre: 'Salchipapa', descripcion: 'Papas fritas con salchicha y cremas', categoria: 'Especiales', precioUsd: 3.6, popularidad: 6, paises: ['PE'] },
  { sku: 'REG-PE2', nombre: 'Chicha Morada', descripcion: 'Bebida de maíz morado de 16 oz', categoria: 'Especiales', precioUsd: 1.9, popularidad: 4, paises: ['PE'] },
];

export const NOMBRES = [
  'Andrés', 'Camila', 'Santiago', 'Valentina', 'Mateo', 'Isabella', 'Sebastián', 'Mariana', 'Daniel', 'Sofía',
  'Juan', 'Gabriela', 'Nicolás', 'Daniela', 'Alejandro', 'Laura', 'Carlos', 'Paula', 'Diego', 'Natalia',
  'Felipe', 'Juliana', 'Miguel', 'Carolina', 'Javier', 'Lucía', 'Ricardo', 'Fernanda', 'Óscar', 'Ana',
];

export const APELLIDOS = [
  'García', 'Rodríguez', 'Martínez', 'López', 'González', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flores',
  'Rivera', 'Gómez', 'Díaz', 'Morales', 'Herrera', 'Castro', 'Vargas', 'Rojas', 'Mendoza', 'Ortiz',
  'Jiménez', 'Ruiz', 'Navarro', 'Cárdenas', 'Mejía', 'Suárez', 'Reyes', 'Álvarez', 'Cortés', 'Salazar',
];

export const NOTAS_ITEM = ['Sin cebolla', 'Extra salsa', 'Sin hielo', 'Sin pepinillos', 'Bien cocida', 'Salsa aparte'];

export const COMENTARIOS_BUENOS = [
  'Muy buena atención y la comida llegó rápido.',
  'Las papas estaban perfectas, volveremos.',
  'Excelente servicio del equipo de sala.',
  'Todo muy rico y el lugar estaba limpio.',
];

export const COMENTARIOS_MALOS = [
  'Tuvimos que esperar bastante por la mesa.',
  'El pedido llegó incompleto.',
  'La comida llegó fría.',
];

/**
 * Plano base del salón (lienzo de 1000 × 700). Las sedes pequeñas usan solo una parte.
 * Salón a la izquierda, terraza a la derecha.
 */
export const PLANO_MESAS = [
  { codigo: 'S-01', zona: 'Salón', forma: 'REDONDA', capacidad: 2, posX: 60, posY: 80, ancho: 90, alto: 90 },
  { codigo: 'S-02', zona: 'Salón', forma: 'CUADRADA', capacidad: 4, posX: 210, posY: 70, ancho: 110, alto: 110 },
  { codigo: 'S-03', zona: 'Salón', forma: 'RECTANGULAR', capacidad: 6, posX: 380, posY: 75, ancho: 170, alto: 100 },
  { codigo: 'S-04', zona: 'Salón', forma: 'REDONDA', capacidad: 2, posX: 60, posY: 250, ancho: 90, alto: 90 },
  { codigo: 'S-05', zona: 'Salón', forma: 'CUADRADA', capacidad: 4, posX: 210, posY: 240, ancho: 110, alto: 110 },
  { codigo: 'S-06', zona: 'Salón', forma: 'RECTANGULAR', capacidad: 6, posX: 380, posY: 245, ancho: 170, alto: 100 },
  { codigo: 'S-07', zona: 'Salón', forma: 'REDONDA', capacidad: 2, posX: 60, posY: 420, ancho: 90, alto: 90 },
  { codigo: 'S-08', zona: 'Salón', forma: 'CUADRADA', capacidad: 4, posX: 210, posY: 410, ancho: 110, alto: 110 },
  { codigo: 'S-09', zona: 'Salón', forma: 'CUADRADA', capacidad: 4, posX: 380, posY: 410, ancho: 110, alto: 110 },
  { codigo: 'S-10', zona: 'Salón', forma: 'RECTANGULAR', capacidad: 10, posX: 60, posY: 570, ancho: 300, alto: 100 },
  { codigo: 'T-01', zona: 'Terraza', forma: 'REDONDA', capacidad: 2, posX: 660, posY: 80, ancho: 90, alto: 90 },
  { codigo: 'T-02', zona: 'Terraza', forma: 'REDONDA', capacidad: 4, posX: 660, posY: 230, ancho: 100, alto: 100 },
  { codigo: 'T-03', zona: 'Terraza', forma: 'REDONDA', capacidad: 2, posX: 660, posY: 380, ancho: 90, alto: 90 },
  { codigo: 'T-04', zona: 'Terraza', forma: 'CUADRADA', capacidad: 4, posX: 820, posY: 230, ancho: 110, alto: 110 },
  { codigo: 'T-05', zona: 'Terraza', forma: 'RECTANGULAR', capacidad: 8, posX: 790, posY: 420, ancho: 170, alto: 110 },
] as const;

export interface PromocionSeed {
  nombre: string;
  descripcion: string;
  tipo: 'PORCENTAJE' | 'PRECIO_FIJO' | 'LLEVA_PAGA';
  sku?: string;
  categoria?: string;
  porcentaje?: number;
  /** Precio especial como fracción del precio de la sede (se redondea con la regla del país) */
  factorPrecio?: number;
  llevaN?: number;
  pagaM?: number;
  /** Días relativos a hoy */
  desde: number;
  hasta: number | null;
  diasSemana?: number[];
  horaInicio?: string;
  horaFin?: string;
  /** Códigos de sede, o 'TODAS', o códigos de país */
  sedes: string[] | 'TODAS';
  paises?: string[];
}

export const PROMOCIONES: PromocionSeed[] = [
  { nombre: 'Martes de conos 2x1', descripcion: 'Lleva dos conos de vainilla y paga uno, todos los martes', tipo: 'LLEVA_PAGA', sku: 'POS-001', llevaN: 2, pagaM: 1, desde: -30, hasta: null, diasSemana: [2], sedes: 'TODAS' },
  { nombre: 'Happy hour de bebidas', descripcion: '20 % en todas las bebidas de 3 a 6 p. m.', tipo: 'PORCENTAJE', categoria: 'Bebidas', porcentaje: 20, desde: -10, hasta: 50, horaInicio: '15:00', horaFin: '18:00', sedes: [], paises: ['CO'] },
  { nombre: 'Clásico a precio especial', descripcion: 'El Combo Clásico más barato en las sedes de Cartagena', tipo: 'PRECIO_FIJO', sku: 'COM-001', factorPrecio: 0.86, desde: -5, hasta: 25, sedes: ['CTG-01', 'CTG-02'] },
  { nombre: 'Nuggets 3x2', descripcion: 'Lleva tres cajas de nuggets y paga dos', tipo: 'LLEVA_PAGA', sku: 'POL-003', llevaN: 3, pagaM: 2, desde: -2, hasta: 12, sedes: ['CTG-01', 'BAQ-01'] },
  { nombre: 'Inauguración Barranquilla', descripcion: '15 % en todas las hamburguesas por la apertura', tipo: 'PORCENTAJE', categoria: 'Hamburguesas', porcentaje: 15, desde: -3, hasta: 27, sedes: ['BAQ-01'] },
  { nombre: 'Fin de semana familiar', descripcion: '10 % en el Combo Familiar sábados y domingos', tipo: 'PORCENTAJE', sku: 'COM-004', porcentaje: 10, desde: -20, hasta: null, diasSemana: [0, 6], sedes: [], paises: ['MX', 'PE'] },
];
