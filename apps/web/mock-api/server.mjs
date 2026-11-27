/**
 * API falsa para desarrollar el frontend sin backend ni base de datos.
 *
 *   node mock-api/server.mjs          (o: npm run mock)
 *
 * Escucha en http://localhost:4000, que es a donde vite.config.ts proxea /api.
 * Los datos viven en memoria: al reiniciar vuelven al estado inicial.
 *
 * Cuentas (contraseña Demo1234!):
 *   admin@restaurantes.demo              ADMIN_GLOBAL
 *   gerente.co@restaurantes.demo         GERENTE_PAIS (Colombia)
 *   gerente.ctg01@restaurantes.demo      GERENTE_SEDE (CTG-01)
 *   cajero1.ctg01@restaurantes.demo      CAJERO (CTG-01)
 *   cocina1.ctg01@restaurantes.demo      COCINA (CTG-01)
 *   cliente@restaurantes.demo            portal de clientes
 *
 * Dispositivos (X-Device-Token): pantalla-ctg-01-demo, kiosco-ctg-01-demo,
 *   kiosco2-ctg-01-demo y el mismo patrón para BAQ-01, CDMX-01 y LIM-01.
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PUERTO = Number(process.env.MOCK_PORT ?? 4000);
const CLAVE = 'Demo1234!';

// ───────────────────────────── Utilidades ─────────────────────────────

const iso = (d = new Date()) => new Date(d).toISOString();
const fechaDe = (d = new Date()) => new Date(d).toISOString().slice(0, 10);
const sumarDias = (n, base = new Date()) => {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};
const sumarMinutos = (n, base = new Date()) => new Date(new Date(base).getTime() + n * 60_000);
const lunesDe = (fecha) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  return fechaDe(sumarDias(-((d.getUTCDay() + 6) % 7), d));
};
const dinero = (n) => Number(n).toFixed(2);
const redondear = (n, paso) => Math.round(n / paso) * paso;
const numero = (v, porDefecto) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
};

const json = (req, res, estado, datos, cabeceras = {}) => {
  const cuerpo = datos === undefined ? '' : JSON.stringify(datos);
  res.writeHead(estado, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': req.headers.origin ?? '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Cache-Control': 'no-store',
    ...cabeceras,
  });
  res.end(cuerpo);
};

const error = (req, res, estado, code, message, details) =>
  json(req, res, estado, { error: { code, message, ...(details ? { details } : {}) } });

async function leerCuerpo(req) {
  const trozos = [];
  for await (const t of req) trozos.push(t);
  if (trozos.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(trozos).toString('utf8'));
  } catch {
    return {};
  }
}

function cookies(req) {
  const salida = {};
  for (const parte of (req.headers.cookie ?? '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0) salida[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return salida;
}

// ───────────────────────────── Datos base ─────────────────────────────

const PAISES = [
  { id: 1, codigoIso: 'CO', nombre: 'Colombia', moneda: 'COP', tasaUsd: '4000.00', tasaImpuesto: '8.00' },
  { id: 2, codigoIso: 'MX', nombre: 'México', moneda: 'MXN', tasaUsd: '17.50', tasaImpuesto: '16.00' },
  { id: 3, codigoIso: 'PE', nombre: 'Perú', moneda: 'PEN', tasaUsd: '3.75', tasaImpuesto: '18.00' },
];

const CIUDADES = [
  { id: 1, nombre: 'Cartagena', paisId: 1 },
  { id: 2, nombre: 'Barranquilla', paisId: 1 },
  { id: 3, nombre: 'Ciudad de México', paisId: 2 },
  { id: 4, nombre: 'Lima', paisId: 3 },
];

const SEDES = [
  {
    id: 1,
    codigo: 'CTG-01',
    nombre: 'Fogón Cartagena',
    direccion: 'Centro Histórico, Calle 34 #3-15',
    zonaHoraria: 'America/Bogota',
    prefijoPedido: 'CTG',
    horaApertura: '11:00',
    horaCierre: '23:00',
    duracionReservaMin: 90,
    horasMinimasCancelacion: 2,
    activa: true,
    ciudadId: 1,
  },
  {
    id: 2,
    codigo: 'BAQ-01',
    nombre: 'Fogón Barranquilla',
    direccion: 'Carrera 53 #79-12, Alto Prado',
    zonaHoraria: 'America/Bogota',
    prefijoPedido: 'BAQ',
    horaApertura: '11:00',
    horaCierre: '23:00',
    duracionReservaMin: 90,
    horasMinimasCancelacion: 2,
    activa: true,
    ciudadId: 2,
  },
  {
    id: 3,
    codigo: 'CDMX-01',
    nombre: 'Fogón Roma Norte',
    direccion: 'Av. Álvaro Obregón 120, Roma Norte',
    zonaHoraria: 'America/Mexico_City',
    prefijoPedido: 'CDMX',
    horaApertura: '12:00',
    horaCierre: '23:00',
    duracionReservaMin: 90,
    horasMinimasCancelacion: 3,
    activa: true,
    ciudadId: 3,
  },
  {
    id: 4,
    codigo: 'LIM-01',
    nombre: 'Fogón Miraflores',
    direccion: 'Av. Larco 345, Miraflores',
    zonaHoraria: 'America/Lima',
    prefijoPedido: 'LIM',
    horaApertura: '12:00',
    horaCierre: '23:00',
    duracionReservaMin: 90,
    horasMinimasCancelacion: 3,
    activa: true,
    ciudadId: 4,
  },
];

const CATEGORIAS = [
  { id: 1, nombre: 'Entradas', icono: 'entrada', orden: 1 },
  { id: 2, nombre: 'Platos fuertes', icono: 'plato', orden: 2 },
  { id: 3, nombre: 'Bebidas', icono: 'bebida', orden: 3 },
  { id: 4, nombre: 'Postres', icono: 'postre', orden: 4 },
  { id: 5, nombre: 'Combos', icono: 'combo', orden: 5 },
];

/** precioBase siempre en COP; se convierte a la moneda de cada sede. */
const PRODUCTOS = [
  { id: 1, sku: 'ENT-01', nombre: 'Patacones con hogao', descripcion: 'Patacones crujientes con hogao de la casa', categoriaId: 1, precioBase: 12000 },
  { id: 2, sku: 'ENT-02', nombre: 'Arepa de huevo', descripcion: 'Arepa costeña rellena de huevo', categoriaId: 1, precioBase: 8000 },
  { id: 3, sku: 'PLT-01', nombre: 'Bandeja paisa', descripcion: 'Fríjoles, chicharrón, arepa, huevo y plátano', categoriaId: 2, precioBase: 32000 },
  { id: 4, sku: 'PLT-02', nombre: 'Ceviche costeño', descripcion: 'Pescado fresco en leche de coco y limón', categoriaId: 2, precioBase: 28000 },
  { id: 5, sku: 'PLT-03', nombre: 'Hamburguesa Fogón', descripcion: 'Carne 180 g, queso, lechuga y salsa de la casa', categoriaId: 2, precioBase: 26000 },
  { id: 6, sku: 'BEB-01', nombre: 'Limonada de coco', descripcion: 'Limonada cremosa con coco rallado', categoriaId: 3, precioBase: 9000 },
  { id: 7, sku: 'BEB-02', nombre: 'Gaseosa', descripcion: 'Botella personal 400 ml', categoriaId: 3, precioBase: 6000 },
  { id: 8, sku: 'POS-01', nombre: 'Tres leches', descripcion: 'Postre de tres leches con canela', categoriaId: 4, precioBase: 11000 },
  { id: 9, sku: 'PLT-04', nombre: 'Tacos al pastor', descripcion: 'Tres tacos con piña y cilantro', categoriaId: 2, precioBase: 22000 },
  { id: 10, sku: 'PLT-05', nombre: 'Salchipapa', descripcion: 'Papas fritas con salchicha y salsas', categoriaId: 2, precioBase: 18000 },
];

const COMBOS = [
  {
    id: 100,
    sku: 'COM-01',
    nombre: 'Combo Costeño',
    descripcion: 'Patacones, ceviche y limonada de coco',
    categoriaId: 5,
    activo: true,
    componentes: [
      { productoId: 1, cantidad: 1 },
      { productoId: 4, cantidad: 1 },
      { productoId: 6, cantidad: 1 },
    ],
    precioBase: 42000,
    sedes: [1, 2],
  },
  {
    id: 101,
    sku: 'COM-02',
    nombre: 'Combo Carnaval',
    descripcion: 'Arepa de huevo, hamburguesa y gaseosa',
    categoriaId: 5,
    activo: true,
    componentes: [
      { productoId: 2, cantidad: 1 },
      { productoId: 5, cantidad: 1 },
      { productoId: 7, cantidad: 1 },
    ],
    precioBase: 36000,
    sedes: [1, 2],
  },
  {
    id: 102,
    sku: 'COM-03',
    nombre: 'Combo Clásico',
    descripcion: 'Hamburguesa Fogón con gaseosa',
    categoriaId: 5,
    activo: true,
    componentes: [
      { productoId: 5, cantidad: 1 },
      { productoId: 7, cantidad: 1 },
    ],
    precioBase: 30000,
    sedes: [1, 2, 3, 4],
  },
];

const HOY = fechaDe();
const PROMOCIONES = [
  {
    id: 1,
    nombre: 'Bebidas -20 %',
    descripcion: 'Todos los días, 20 % en bebidas',
    tipo: 'PORCENTAJE',
    productoId: null,
    categoriaId: 3,
    porcentaje: 20,
    precioEspecial: null,
    llevaN: null,
    pagaM: null,
    fechaInicio: fechaDe(sumarDias(-30)),
    fechaFin: null,
    diasSemana: [],
    horaInicio: null,
    horaFin: null,
    activa: true,
    sedes: [1, 2, 3, 4],
    usos: 128,
  },
  {
    id: 2,
    nombre: 'Combo Clásico a precio especial',
    descripcion: 'El Combo Clásico a $26.700',
    tipo: 'PRECIO_FIJO',
    productoId: 102,
    categoriaId: null,
    porcentaje: null,
    precioEspecial: 26700,
    llevaN: null,
    pagaM: null,
    fechaInicio: fechaDe(sumarDias(-10)),
    fechaFin: fechaDe(sumarDias(20)),
    diasSemana: [],
    horaInicio: null,
    horaFin: null,
    activa: true,
    sedes: [1, 2],
    usos: 34,
  },
  {
    id: 3,
    nombre: '2x1 Hamburguesa Fogón',
    descripcion: 'Lleva 2 y paga 1, de lunes a jueves',
    tipo: 'LLEVA_PAGA',
    productoId: 5,
    categoriaId: null,
    porcentaje: null,
    precioEspecial: null,
    llevaN: 2,
    pagaM: 1,
    fechaInicio: fechaDe(sumarDias(-5)),
    fechaFin: null,
    diasSemana: [1, 2, 3, 4],
    horaInicio: '12:00',
    horaFin: '18:00',
    activa: true,
    sedes: [1, 2, 3, 4],
    usos: 57,
  },
];

const CONFIG = { reservasHabilitadas: true, salirFilaHabilitado: true };
const MARCA = {
  nombre: 'Fogón',
  logo: null,
  colorPrimario: '#D62828',
  colorAcento: '#FFB703',
  actualizadoEn: iso(),
};

const multiplicador = { COP: 1, MXN: 0.0044, PEN: 0.00094 };
const sedeDe = (id) => SEDES.find((s) => s.id === Number(id));
const ciudadDe = (id) => CIUDADES.find((c) => c.id === id);
const paisDe = (id) => PAISES.find((p) => p.id === id);
const paisDeSede = (sede) => paisDe(ciudadDe(sede.ciudadId).paisId);

function precioEnSede(precioCop, sedeId) {
  const moneda = paisDeSede(sedeDe(sedeId)).moneda;
  const valor = precioCop * multiplicador[moneda];
  return moneda === 'COP' ? redondear(valor, 100) : redondear(valor, 10);
}

function sedeCompleta(sede) {
  const ciudad = ciudadDe(sede.ciudadId);
  return { ...sede, ciudad: { ...ciudad, pais: paisDe(ciudad.paisId) } };
}

function sedePublica(sede) {
  const s = sedeCompleta(sede);
  return {
    id: s.id,
    codigo: s.codigo,
    nombre: s.nombre,
    direccion: s.direccion,
    zonaHoraria: s.zonaHoraria,
    horaApertura: s.horaApertura,
    horaCierre: s.horaCierre,
    duracionReservaMin: s.duracionReservaMin,
    horasMinimasCancelacion: s.horasMinimasCancelacion,
    ciudad: {
      nombre: s.ciudad.nombre,
      pais: { nombre: s.ciudad.pais.nombre, codigoIso: s.ciudad.pais.codigoIso, moneda: s.ciudad.pais.moneda },
    },
  };
}

// ───────────────────────────── Usuarios y sesiones ─────────────────────────────

const USUARIOS = [
  { id: 'u-admin', nombre: 'Ana Admin', email: 'admin@restaurantes.demo', rol: 'ADMIN_GLOBAL', paisId: null, sedeId: null },
  { id: 'u-pais-co', nombre: 'Gabriel País', email: 'gerente.co@restaurantes.demo', rol: 'GERENTE_PAIS', paisId: 1, sedeId: null },
  { id: 'u-ger-ctg', nombre: 'Gabriela Gerente', email: 'gerente.ctg01@restaurantes.demo', rol: 'GERENTE_SEDE', paisId: 1, sedeId: 1 },
  { id: 'u-caj-ctg', nombre: 'Camila Cajera', email: 'cajero1.ctg01@restaurantes.demo', rol: 'CAJERO', paisId: 1, sedeId: 1 },
  { id: 'u-coc-ctg', nombre: 'Carlos Cocinero', email: 'cocina1.ctg01@restaurantes.demo', rol: 'COCINA', paisId: 1, sedeId: 1 },
];

const usuarioCompleto = (u) => ({
  ...u,
  sede: u.sedeId ? (({ id, codigo, nombre }) => ({ id, codigo, nombre }))(sedeDe(u.sedeId)) : null,
});

const CLIENTES = [
  { id: 'cli-1', nombre: 'Carla Cliente', email: 'cliente@restaurantes.demo', telefono: '300 555 0101' },
];

const sesiones = new Map(); // token -> usuarioId
const sesionesCliente = new Map(); // token -> clienteId

const nuevoToken = (prefijo, id) => `${prefijo}.${id}.${randomUUID()}`;

function usuarioDe(req) {
  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const id = sesiones.get(auth.slice(7));
  return id ? USUARIOS.find((u) => u.id === id) ?? null : null;
}

function clienteDe(req) {
  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const id = sesionesCliente.get(auth.slice(7));
  return id ? CLIENTES.find((c) => c.id === id) ?? null : null;
}

function sedesDelUsuario(usuario) {
  if (!usuario) return [];
  if (usuario.rol === 'ADMIN_GLOBAL') return SEDES;
  if (usuario.rol === 'GERENTE_PAIS') return SEDES.filter((s) => paisDeSede(s).id === usuario.paisId);
  return SEDES.filter((s) => s.id === usuario.sedeId);
}

function exigirPersonal(req, res) {
  const usuario = usuarioDe(req);
  if (!usuario) {
    error(req, res, 401, 'SIN_SESION', 'Inicia sesión para continuar');
    return null;
  }
  return usuario;
}

// ───────────────────────────── Menú ─────────────────────────────

function reglaPromocion(p) {
  return {
    id: p.id,
    nombre: p.nombre,
    tipo: p.tipo,
    productoId: p.productoId,
    categoriaId: p.categoriaId,
    porcentaje: p.porcentaje,
    precioEspecial: p.precioEspecial,
    llevaN: p.llevaN,
    pagaM: p.pagaM,
  };
}

function etiquetaPromocion(p) {
  if (p.tipo === 'LLEVA_PAGA') return `${p.llevaN}x${p.pagaM}`;
  if (p.tipo === 'PORCENTAJE') return `-${p.porcentaje} %`;
  return 'Precio especial';
}

function promocionPara(promos, productoId, categoriaId) {
  return (
    promos.find(
      (p) =>
        p.activa &&
        (p.productoId !== null
          ? p.productoId === productoId
          : p.tipo === 'PORCENTAJE' && p.categoriaId === categoriaId),
    ) ?? null
  );
}

function productoMenu(p, sede, promos) {
  const precio = precioEnSede(p.precioBase, sede.id);
  const promo = promocionPara(promos, p.id, p.categoriaId);
  return {
    id: p.id,
    sku: p.sku,
    nombre: p.nombre,
    descripcion: p.descripcion,
    imagenUrl: null,
    categoriaId: p.categoriaId,
    precio: dinero(precio),
    esCombo: false,
    componentes: [],
    precioSuelto: null,
    promocion: promo
      ? {
          id: promo.id,
          nombre: promo.nombre,
          tipo: promo.tipo,
          etiqueta: etiquetaPromocion(promo),
          precioConPromocion:
            promo.tipo === 'PORCENTAJE'
              ? redondear(precio * (1 - promo.porcentaje / 100), 100)
              : promo.tipo === 'PRECIO_FIJO'
                ? precioEnSede(promo.precioEspecial, sede.id)
                : null,
        }
      : null,
  };
}

function comboMenu(c, sede, promos) {
  const precio = precioEnSede(c.precioBase, sede.id);
  const componentes = c.componentes.map((comp) => {
    const p = PRODUCTOS.find((x) => x.id === comp.productoId);
    return { productoId: p.id, nombre: p.nombre, cantidad: comp.cantidad };
  });
  const precioSuelto = c.componentes.reduce(
    (total, comp) =>
      total + precioEnSede(PRODUCTOS.find((x) => x.id === comp.productoId).precioBase, sede.id) * comp.cantidad,
    0,
  );
  const promo = promocionPara(promos, c.id, c.categoriaId);
  return {
    id: c.id,
    sku: c.sku,
    nombre: c.nombre,
    descripcion: c.descripcion,
    imagenUrl: null,
    categoriaId: c.categoriaId,
    precio: dinero(precio),
    esCombo: true,
    componentes,
    precioSuelto,
    promocion: promo
      ? {
          id: promo.id,
          nombre: promo.nombre,
          tipo: promo.tipo,
          etiqueta: etiquetaPromocion(promo),
          precioConPromocion:
            promo.tipo === 'PRECIO_FIJO' ? precioEnSede(promo.precioEspecial, sede.id) : null,
        }
      : null,
  };
}

function menuDe(sedeId) {
  const sede = sedeDe(sedeId);
  const promos = PROMOCIONES.filter((p) => p.activa && p.sedes.includes(sedeId));
  const productos = PRODUCTOS.map((p) => productoMenu(p, sede, promos));
  const combos = COMBOS.filter((c) => c.activo && c.sedes.includes(sedeId)).map((c) =>
    comboMenu(c, sede, promos),
  );
  const todos = [...productos, ...combos];
  return {
    sede: {
      id: sede.id,
      nombre: sede.nombre,
      moneda: paisDeSede(sede).moneda,
      tasaImpuesto: paisDeSede(sede).tasaImpuesto,
    },
    categorias: CATEGORIAS.map((c) => ({
      ...c,
      productos: todos.filter((p) => p.categoriaId === c.id),
    })).filter((c) => c.productos.length > 0),
    promociones: promos.map((p) => ({ ...reglaPromocion(p), descripcion: p.descripcion })),
  };
}

// ───────────────────────────── Mesas, reservas y fila ─────────────────────────────

const MESAS = [];
const ESTADOS_MESA = ['LIBRE', 'OCUPADA', 'RESERVADA', 'LIMPIEZA', 'LIBRE', 'OCUPADA', 'LIBRE', 'FUERA_SERVICIO'];
for (const sede of SEDES) {
  for (let i = 0; i < 8; i += 1) {
    const estado = ESTADOS_MESA[i];
    MESAS.push({
      id: sede.id * 100 + i + 1,
      sedeId: sede.id,
      codigo: `M${i + 1}`,
      capacidad: 2 + (i % 4),
      zona: i < 4 ? 'Salón' : 'Terraza',
      forma: i % 3 === 0 ? 'REDONDA' : i % 3 === 1 ? 'CUADRADA' : 'RECTANGULAR',
      posX: 120 + (i % 4) * 220,
      posY: 120 + Math.floor(i / 4) * 280,
      ancho: 130,
      alto: 90,
      rotacion: 0,
      estado,
      activa: true,
      sesionActual:
        estado === 'OCUPADA'
          ? {
              id: `ses-${sede.id}-${i}`,
              origen: 'DIRECTO',
              personas: 2 + (i % 3),
              inicio: iso(sumarMinutos(-(18 + i * 7))),
              minutos: 18 + i * 7,
            }
          : null,
      proximaReserva:
        estado === 'RESERVADA'
          ? {
              id: `res-mesa-${sede.id}-${i}`,
              hora: '20:00',
              inicio: `${HOY}T20:00:00.000Z`,
              personas: 4,
              estado: 'CONFIRMADA',
              cliente: { nombre: 'Familia Pérez', telefono: '300 555 0202' },
              codigoConfirmacion: `${sede.prefijoPedido}-7712`,
            }
          : null,
    });
  }
}

const reservaCompleta = (r) => {
  const mesa = MESAS.find((m) => m.id === r.mesaId) ?? null;
  const sede = sedeDe(r.sedeId);
  const cliente = CLIENTES.find((c) => c.id === r.clienteId) ?? {
    id: r.clienteId,
    nombre: 'Cliente',
    email: 'cliente@demo',
    telefono: '300 000 0000',
  };
  return {
    ...r,
    mesa: mesa ? { id: mesa.id, codigo: mesa.codigo, zona: mesa.zona, capacidad: mesa.capacidad } : null,
    sede: { id: sede.id, codigo: sede.codigo, nombre: sede.nombre, direccion: sede.direccion, zonaHoraria: sede.zonaHoraria },
    cliente,
    puedeModificar: ['PENDIENTE', 'CONFIRMADA'].includes(r.estado),
    puedeCalificar: r.estado === 'COMPLETADA',
  };
};

const RESERVAS = [
  { id: 'res-1', sedeId: 1, clienteId: 'cli-1', mesaId: 103, fecha: HOY, hora: '13:00', duracionMin: 90, personas: 2, estado: 'CONFIRMADA', codigoConfirmacion: 'CTG-4821', notas: 'Mesa junto a la ventana' },
  { id: 'res-2', sedeId: 1, clienteId: 'cli-1', mesaId: 106, fecha: HOY, hora: '20:00', duracionMin: 90, personas: 4, estado: 'PENDIENTE', codigoConfirmacion: 'CTG-9134', notas: null },
  { id: 'res-3', sedeId: 1, clienteId: 'cli-1', mesaId: 102, fecha: HOY, hora: '21:00', duracionMin: 90, personas: 2, estado: 'CONFIRMADA', codigoConfirmacion: 'CTG-2277', notas: null },
  { id: 'res-4', sedeId: 1, clienteId: 'cli-1', mesaId: null, fecha: fechaDe(sumarDias(1)), hora: '19:30', duracionMin: 90, personas: 6, estado: 'CONFIRMADA', codigoConfirmacion: 'CTG-5510', notas: 'Cumpleaños' },
  { id: 'res-5', sedeId: 2, clienteId: 'cli-1', mesaId: 203, fecha: HOY, hora: '20:00', duracionMin: 90, personas: 2, estado: 'CONFIRMADA', codigoConfirmacion: 'BAQ-1201', notas: null },
].map((r) => ({
  ...r,
  inicio: `${r.fecha}T${r.hora}:00.000Z`,
  fin: `${r.fecha}T${String(Number(r.hora.slice(0, 2)) + 1).padStart(2, '0')}:${r.hora.slice(3)}:00.000Z`,
}));

const ESPERA = [
  { id: 'esp-1', sedeId: 1, numeroTurno: 12, nombre: 'Familia Pérez', personas: 4, estado: 'ESPERANDO', mesa: null, creadoEn: iso(sumarMinutos(-22)), notificadoEn: null, telefono: '300 555 0202' },
  { id: 'esp-2', sedeId: 1, numeroTurno: 13, nombre: 'Andrés', personas: 2, estado: 'ESPERANDO', mesa: null, creadoEn: iso(sumarMinutos(-9)), notificadoEn: null, telefono: '310 555 0303' },
  { id: 'esp-3', sedeId: 1, numeroTurno: 11, nombre: 'Lucía', personas: 3, estado: 'NOTIFICADO', mesa: 'M5', creadoEn: iso(sumarMinutos(-31)), notificadoEn: iso(sumarMinutos(-2)), telefono: '320 555 0404' },
];

function esperaCompleta(e) {
  const esperando = ESPERA.filter((x) => x.sedeId === e.sedeId && x.estado === 'ESPERANDO').sort(
    (a, b) => new Date(a.creadoEn) - new Date(b.creadoEn),
  );
  return {
    ...e,
    posicion: e.estado === 'ESPERANDO' ? esperando.findIndex((x) => x.id === e.id) + 1 : null,
    esperaEstimadaMin: e.estado === 'ESPERANDO' ? 10 + esperando.findIndex((x) => x.id === e.id) * 8 : null,
  };
}

// ───────────────────────────── Pedidos ─────────────────────────────

const itemPedido = (productoId, cantidad, notas = null, sedeId = 1) => {
  const producto = PRODUCTOS.find((x) => x.id === productoId);
  const combo = COMBOS.find((x) => x.id === productoId);
  const item = producto ?? combo;
  const precio = precioEnSede(item.precioBase, sedeId);
  return {
    id: randomUUID(),
    productoId,
    nombreProducto: item.nombre,
    cantidad,
    precioUnitario: dinero(precio),
    descuento: '0.00',
    subtotal: dinero(precio * cantidad),
    notas,
    promocionNombre: null,
    componentes: combo
      ? combo.componentes.map((comp) => ({
          nombre: PRODUCTOS.find((x) => x.id === comp.productoId).nombre,
          cantidad: comp.cantidad,
        }))
      : null,
  };
};

const pedidoBase = (id, sedeId, codigo, canal, estado, clienteNombre, items, minutos, metodoPago) => {
  const subtotal = items.reduce((s, i) => s + Number(i.subtotal), 0);
  const pais = paisDeSede(sedeDe(sedeId));
  const impuestos = subtotal * (Number(pais.tasaImpuesto) / 100);
  const total = subtotal + impuestos;
  return {
    id,
    sedeId,
    codigo,
    canal,
    estado,
    clienteNombre,
    cajero: { id: 'u-caj-ctg', nombre: 'Camila Cajera' },
    subtotal: dinero(subtotal),
    descuento: '0.00',
    impuestos: dinero(impuestos),
    total: dinero(total),
    moneda: pais.moneda,
    totalUsd: dinero(total / Number(pais.tasaUsd)),
    metodoPago,
    creadoEn: iso(sumarMinutos(-minutos)),
    listoEn: estado === 'LISTO' ? iso(sumarMinutos(-2)) : null,
    entregadoEn: null,
    items,
  };
};

const PEDIDOS = [
  pedidoBase('ped-1', 1, 'CTG-0101', 'CAJA', 'EN_PREPARACION', 'Mesa 3', [itemPedido(5, 2, null, 1), itemPedido(6, 2, null, 1)], 8, 'TARJETA'),
  pedidoBase('ped-2', 1, 'CTG-0102', 'KIOSCO', 'RECIBIDO', 'Andrés', [itemPedido(100, 1, null, 1), itemPedido(8, 1, null, 1)], 3, 'EFECTIVO'),
  pedidoBase('ped-3', 1, 'CTG-0103', 'CAJA', 'LISTO', 'Mesa 1', [itemPedido(3, 1, null, 1), itemPedido(7, 1, null, 1)], 14, 'TRANSFERENCIA'),
  pedidoBase('ped-4', 2, 'BAQ-0101', 'CAJA', 'EN_PREPARACION', 'Mesa 4', [itemPedido(4, 2, null, 2)], 6, 'TARJETA'),
];

let consecutivoPedido = 104;

// ───────────────────────────── Turnos ─────────────────────────────

function personalDe(sedeId) {
  const sede = sedeDe(sedeId);
  const sufijo = sede.codigo.toLowerCase();
  return [
    { id: `u-${sedeId}-ger`, nombre: 'Gabriela Gerente', rol: 'GERENTE_SEDE', email: `gerente.${sufijo}@restaurantes.demo` },
    { id: `u-${sedeId}-caj`, nombre: 'Camila Cajera', rol: 'CAJERO', email: `cajero1.${sufijo}@restaurantes.demo` },
    { id: `u-${sedeId}-coc`, nombre: 'Carlos Cocinero', rol: 'COCINA', email: `cocina1.${sufijo}@restaurantes.demo` },
    { id: `u-${sedeId}-mes`, nombre: 'Sofía Mesera', rol: 'CAJERO', email: `cajero2.${sufijo}@restaurantes.demo` },
  ];
}

const TURNOS = [];
const LUNES = lunesDe(HOY);
const PUESTOS = ['CAJA', 'COCINA', 'SERVICIO', 'GERENCIA'];
for (const sede of SEDES) {
  const personas = personalDe(sede.id);
  for (let dia = 0; dia < 7; dia += 1) {
    const fecha = fechaDe(sumarDias(dia, new Date(`${LUNES}T12:00:00Z`)));
    personas.forEach((persona, i) => {
      if ((dia + i) % 5 === 4) return; // día libre
      const horaInicio = i % 2 === 0 ? '11:00' : '15:00';
      const horaFin = i % 2 === 0 ? '19:00' : '23:00';
      const pasado = fecha < HOY;
      const esHoy = fecha === HOY;
      TURNOS.push({
        id: `tur-${sede.id}-${dia}-${i}`,
        sedeId: sede.id,
        usuarioId: persona.id,
        puesto: PUESTOS[i % PUESTOS.length],
        fecha,
        horaInicio,
        horaFin,
        horas: 8,
        inicio: `${fecha}T${horaInicio}:00.000Z`,
        fin: `${fecha}T${horaFin}:00.000Z`,
        estado: pasado ? 'COMPLETADO' : esHoy ? 'EN_CURSO' : 'PROGRAMADO',
        entradaReal: pasado || esHoy ? `${fecha}T${horaInicio}:00.000Z` : null,
        salidaReal: pasado ? `${fecha}T${horaFin}:00.000Z` : null,
        notas: null,
        usuario: { id: persona.id, nombre: persona.nombre, rol: persona.rol },
      });
    });
  }
}

// ───────────────────────────── Dispositivos ─────────────────────────────

const CUPOS = new Map(SEDES.map((s) => [s.id, { KIOSCO: 3, PANTALLA: 2 }]));
const EQUIPOS = [];
const TOKENS = new Map();

for (const sede of SEDES) {
  const sufijo = sede.codigo.toLowerCase().replace('-', '-');
  const equipos = [
    { tipo: 'PANTALLA', nombre: `Pantalla ${sede.codigo}`, token: `pantalla-${sufijo}-demo` },
    { tipo: 'KIOSCO', nombre: `Kiosco ${sede.codigo}`, token: `kiosco-${sufijo}-demo` },
    { tipo: 'KIOSCO', nombre: `Kiosco 2 ${sede.codigo}`, token: `kiosco2-${sufijo}-demo` },
  ];
  for (const e of equipos) {
    const id = randomUUID();
    EQUIPOS.push({
      id,
      sedeId: sede.id,
      nombre: e.nombre,
      tipo: e.tipo,
      activo: true,
      creadoEn: iso(sumarDias(-20)),
      ultimaConexionEn: iso(sumarMinutos(-2)),
      enLinea: true,
    });
    TOKENS.set(e.token, id);
  }
}

const dispositivoPorToken = (token) => {
  const id = TOKENS.get(token);
  if (!id) return null;
  const equipo = EQUIPOS.find((e) => e.id === id && e.activo);
  if (!equipo) return null;
  const sede = sedeDe(equipo.sedeId);
  return {
    id: equipo.id,
    nombre: equipo.nombre,
    tipo: equipo.tipo,
    sede: { id: sede.id, codigo: sede.codigo, nombre: sede.nombre, zonaHoraria: sede.zonaHoraria },
  };
};

function cuposDe(sedeId) {
  const cupo = CUPOS.get(sedeId);
  const activos = (tipo) => EQUIPOS.filter((e) => e.sedeId === sedeId && e.tipo === tipo && e.activo).length;
  return {
    KIOSCO: { activos: activos('KIOSCO'), cupo: cupo.KIOSCO },
    PANTALLA: { activos: activos('PANTALLA'), cupo: cupo.PANTALLA },
  };
}

// ───────────────────────────── Reportes ─────────────────────────────

const REPORTES = {
  kpis: {
    sedes: 4,
    ventasUsd: 128450.75,
    pedidos: 3120,
    ticketPromedioUsd: 41.17,
    tiempoPreparacionMin: 14.2,
    tasaCancelacionPct: 2.1,
    calificacionPromedio: 4.6,
    calificaciones: 412,
    variacionPct: { ventasUsd: 8.4, pedidos: 5.1, ticketPromedioUsd: 3.2, tiempoPreparacionMin: -2.3 },
  },
  canales: [
    { clave: 'CAJA', pedidos: 1710, ventasUsd: 72100.4 },
    { clave: 'KIOSCO', pedidos: 980, ventasUsd: 41200.2 },
    { clave: 'WEB', pedidos: 430, ventasUsd: 15150.15 },
  ],
  productos: [
    { clave: 'PLT-03', etiqueta: 'Hamburguesa Fogón', unidades: 412, ventasUsd: 10712.0 },
    { clave: 'PLT-01', etiqueta: 'Bandeja paisa', unidades: 301, ventasUsd: 9632.0 },
    { clave: 'ENT-01', etiqueta: 'Patacones con hogao', unidades: 388, ventasUsd: 4656.0 },
    { clave: 'BEB-01', etiqueta: 'Limonada de coco', unidades: 520, ventasUsd: 4680.0 },
    { clave: 'COM-01', etiqueta: 'Combo Costeño', unidades: 96, ventasUsd: 4032.0 },
    { clave: 'PLT-04', etiqueta: 'Tacos al pastor', unidades: 210, ventasUsd: 4620.0 },
    { clave: 'POS-01', etiqueta: 'Tres leches', unidades: 180, ventasUsd: 1980.0 },
    { clave: 'PLT-02', etiqueta: 'Ceviche costeño', unidades: 140, ventasUsd: 3920.0 },
  ],
  calificaciones: {
    promedio: 4.6,
    total: 412,
    distribucion: [
      { puntaje: 5, total: 248 },
      { puntaje: 4, total: 112 },
      { puntaje: 3, total: 32 },
      { puntaje: 2, total: 14 },
      { puntaje: 1, total: 6 },
    ],
    porSede: [
      { clave: 'CTG-01', etiqueta: 'Fogón Cartagena', promedio: 4.7, total: 148 },
      { clave: 'BAQ-01', etiqueta: 'Fogón Barranquilla', promedio: 4.5, total: 112 },
      { clave: 'CDMX-01', etiqueta: 'Fogón Roma Norte', promedio: 4.6, total: 92 },
      { clave: 'LIM-01', etiqueta: 'Fogón Miraflores', promedio: 4.4, total: 60 },
    ],
    ultimosComentarios: [
      { id: 'c-1', sede: 'Fogón Cartagena', puntaje: 5, comentario: 'El ceviche estaba espectacular y la atención muy rápida.', creadoEn: iso(sumarDias(-1)) },
      { id: 'c-2', sede: 'Fogón Barranquilla', puntaje: 4, comentario: 'Todo rico, aunque la espera fue un poco larga.', creadoEn: iso(sumarDias(-2)) },
      { id: 'c-3', sede: 'Fogón Roma Norte', puntaje: 5, comentario: 'Los tacos al pastor son los mejores de la zona.', creadoEn: iso(sumarDias(-3)) },
    ],
  },
};

function reporteVentas(agrupar) {
  if (agrupar === 'sede') {
    return SEDES.map((s, i) => ({
      clave: s.codigo,
      etiqueta: s.nombre,
      pedidos: 900 - i * 120,
      ventasUsd: 42000 - i * 8000,
      ventasLocal: (42000 - i * 8000) * paisDeSede(s).tasaUsd,
      moneda: paisDeSede(s).moneda,
      ticketPromedioUsd: 46.6 - i * 2,
    }));
  }
  if (agrupar === 'hora') {
    return Array.from({ length: 12 }, (_, i) => ({
      clave: `${String(11 + i).padStart(2, '0')}:00`,
      pedidos: 120 + Math.round(Math.sin(i / 2) * 40) + i * 6,
      ventasUsd: 3800 + Math.round(Math.sin(i / 2) * 1200) + i * 320,
    }));
  }
  if (agrupar === 'producto') {
    return REPORTES.productos;
  }
  if (agrupar === 'canal') {
    return REPORTES.canales;
  }
  return Array.from({ length: 14 }, (_, i) => {
    const fecha = fechaDe(sumarDias(i - 13));
    const base = 7200 + i * 180 + Math.round(Math.sin(i) * 900);
    return {
      clave: fecha,
      etiqueta: null,
      pedidos: Math.round(base / 42),
      ventasUsd: base,
      ventasLocal: base * 4000,
      moneda: 'COP',
      ticketPromedioUsd: 42 + (i % 5) * 0.6,
    };
  });
}

function reporteOcupacion(agrupar) {
  const datos =
    agrupar === 'sede'
      ? SEDES.map((s, i) => ({
          clave: s.codigo,
          etiqueta: s.nombre,
          minutos: 720,
          ocupacionPct: 72 - i * 4,
          sesiones: 140 - i * 15,
          rotacion: 3.4 - i * 0.2,
          mesas: 8,
        }))
      : Array.from({ length: 12 }, (_, i) => ({
          clave: `${String(11 + i).padStart(2, '0')}:00`,
          minutos: 60,
          ocupacionPct: Math.max(15, Math.round(45 + Math.sin(i / 2) * 30)),
          sesiones: 20 + i * 2,
        }));
  return {
    periodo: { desde: fechaDe(sumarDias(-29)), hasta: HOY, dias: 30 },
    resumen: {
      mesas: 32,
      ocupacionPct: 68.4,
      sesiones: 410,
      comensales: 1240,
      rotacion: 3.1,
      esperaPromedioMin: 12.5,
      abandonoColaPct: 4.2,
      reservas: 86,
      cancelacionPct: 6.1,
      noShowPct: 2.3,
    },
    datos,
  };
}

function promocionCompleta(p) {
  const producto =
    p.productoId === null
      ? null
      : (() => {
          const prod = PRODUCTOS.find((x) => x.id === p.productoId);
          const combo = COMBOS.find((x) => x.id === p.productoId);
          const item = prod ?? combo;
          return item ? { id: item.id, nombre: item.nombre, sku: item.sku, esCombo: Boolean(combo) } : null;
        })();
  const categoria = p.categoriaId === null ? null : CATEGORIAS.find((c) => c.id === p.categoriaId) ?? null;
  const estado = !p.activa ? 'PAUSADA' : p.fechaFin && p.fechaFin < HOY ? 'VENCIDA' : 'VIGENTE';
  return {
    ...p,
    precioEspecial: p.precioEspecial === null ? null : dinero(p.precioEspecial),
    etiqueta: etiquetaPromocion(p),
    estado,
    producto,
    categoria,
    sedes: p.sedes.map((id) => {
      const s = sedeDe(id);
      return { id: s.id, codigo: s.codigo, nombre: s.nombre };
    }),
    otrasSedes: 0,
  };
}

// ───────────────────────────── Servidor ─────────────────────────────

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const ruta = url.pathname.replace(/\/+$/, '') || '/';
  const q = url.searchParams;
  const metodo = req.method;

  if (metodo === 'OPTIONS') return json(req, res, 204, undefined);

  // Salud
  if (ruta === '/api/health' || ruta === '/api/salud') {
    return json(req, res, 200, { ok: true, modo: 'mock', sedes: SEDES.length, hora: iso() });
  }

  // ── Público ──
  if (metodo === 'GET' && ruta === '/api/marca') return json(req, res, 200, MARCA);
  if (metodo === 'GET' && ruta === '/api/configuracion') return json(req, res, 200, CONFIG);
  if (metodo === 'GET' && ruta === '/api/sedes/publicas') {
    return json(req, res, 200, SEDES.filter((s) => s.activa).map(sedePublica));
  }
  if (metodo === 'GET' && ruta === '/api/menu') {
    const sede = sedeDe(q.get('sedeId'));
    if (!sede) return error(req, res, 404, 'SEDE_NO_ENCONTRADA', 'La sede no existe');
    return json(req, res, 200, menuDe(sede.id));
  }
  const menuPromos = /^\/api\/sedes\/(\d+)\/promociones\/vigentes$/.exec(ruta);
  if (metodo === 'GET' && menuPromos) {
    const sedeId = Number(menuPromos[1]);
    return json(
      req,
      res,
      200,
      PROMOCIONES.filter((p) => p.activa && p.sedes.includes(sedeId)).map((p) => ({
        ...reglaPromocion(p),
        descripcion: p.descripcion,
      })),
    );
  }
  const disponibilidad = /^\/api\/sedes\/(\d+)\/disponibilidad$/.exec(ruta);
  if (metodo === 'GET' && disponibilidad) {
    const fecha = q.get('fecha') ?? HOY;
    const franjas = Array.from({ length: 7 }, (_, i) => {
      const hora = `${String(12 + i).padStart(2, '0')}:00`;
      return {
        hora,
        inicio: `${fecha}T${hora}:00.000Z`,
        mesasLibres: Math.max(0, 5 - (i % 4)),
        disponible: i % 4 !== 3,
      };
    });
    return json(req, res, 200, { franjas });
  }

  // ── Autenticación de personal ──
  if (metodo === 'POST' && ruta === '/api/auth/login') {
    const cuerpo = await leerCuerpo(req);
    const usuario = USUARIOS.find((u) => u.email === cuerpo.email);
    if (!usuario || cuerpo.password !== CLAVE) {
      return error(req, res, 401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos');
    }
    const token = nuevoToken('mock', usuario.id);
    sesiones.set(token, usuario.id);
    return json(
      req,
      res,
      200,
      { accessToken: token, usuario: usuarioCompleto(usuario) },
      { 'Set-Cookie': `mock_sesion=${usuario.id}; Path=/; HttpOnly; SameSite=Lax` },
    );
  }
  if (metodo === 'POST' && ruta === '/api/auth/refresh') {
    const id = cookies(req).mock_sesion;
    const usuario = id ? USUARIOS.find((u) => u.id === id) : null;
    if (!usuario) return error(req, res, 401, 'SIN_SESION', 'No hay una sesión activa');
    const token = nuevoToken('mock', usuario.id);
    sesiones.set(token, usuario.id);
    return json(req, res, 200, { accessToken: token, usuario: usuarioCompleto(usuario) });
  }
  if (metodo === 'POST' && ruta === '/api/auth/logout') {
    return json(req, res, 204, undefined, { 'Set-Cookie': 'mock_sesion=; Path=/; Max-Age=0' });
  }

  // ── Autenticación de clientes ──
  if (metodo === 'POST' && (ruta === '/api/clientes/auth/login' || ruta === '/api/clientes/auth/registro')) {
    const cuerpo = await leerCuerpo(req);
    let cliente = CLIENTES.find((c) => c.email === cuerpo.email);
    if (ruta.endsWith('registro') && !cliente) {
      cliente = { id: `cli-${randomUUID()}`, nombre: cuerpo.nombre ?? 'Cliente', email: cuerpo.email, telefono: cuerpo.telefono ?? '' };
      CLIENTES.push(cliente);
    }
    if (!cliente || cuerpo.password !== CLAVE) {
      return error(req, res, 401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos');
    }
    const token = nuevoToken('mockc', cliente.id);
    sesionesCliente.set(token, cliente.id);
    return json(
      req,
      res,
      200,
      { accessToken: token, cliente },
      { 'Set-Cookie': `mock_cliente=${cliente.id}; Path=/; HttpOnly; SameSite=Lax` },
    );
  }
  if (metodo === 'POST' && ruta === '/api/clientes/auth/refresh') {
    const id = cookies(req).mock_cliente;
    const cliente = id ? CLIENTES.find((c) => c.id === id) : null;
    if (!cliente) return error(req, res, 401, 'SIN_SESION', 'No hay una sesión activa');
    const token = nuevoToken('mockc', cliente.id);
    sesionesCliente.set(token, cliente.id);
    return json(req, res, 200, { accessToken: token, cliente });
  }
  if (metodo === 'POST' && ruta === '/api/clientes/auth/logout') {
    return json(req, res, 204, undefined, { 'Set-Cookie': 'mock_cliente=; Path=/; Max-Age=0' });
  }

  // ── Público: fila de espera ──
  const esperaPublica = /^\/api\/sedes\/(\d+)\/espera$/.exec(ruta);
  if (metodo === 'POST' && esperaPublica) {
    const sedeId = Number(esperaPublica[1]);
    const cuerpo = await leerCuerpo(req);
    const turno = {
      id: randomUUID(),
      sedeId,
      numeroTurno: Math.max(...ESPERA.filter((e) => e.sedeId === sedeId).map((e) => e.numeroTurno), 0) + 1,
      nombre: cuerpo.nombre ?? 'Cliente',
      personas: Number(cuerpo.personas ?? 2),
      estado: 'ESPERANDO',
      mesa: null,
      creadoEn: iso(),
      notificadoEn: null,
      telefono: cuerpo.telefono ?? null,
    };
    ESPERA.push(turno);
    return json(req, res, 201, esperaCompleta(turno));
  }
  const esperaPublicaId = /^\/api\/espera\/([^/]+)$/.exec(ruta);
  if (metodo === 'GET' && esperaPublicaId) {
    const e = ESPERA.find((x) => x.id === esperaPublicaId[1]);
    if (!e) return error(req, res, 404, 'NO_ENCONTRADA', 'El turno no existe');
    return json(req, res, 200, esperaCompleta(e));
  }
  const salirEspera = /^\/api\/espera\/([^/]+)\/salir$/.exec(ruta);
  if (metodo === 'POST' && salirEspera) {
    const e = ESPERA.find((x) => x.id === salirEspera[1]);
    if (!e) return error(req, res, 404, 'NO_ENCONTRADA', 'El turno no existe');
    e.estado = 'ABANDONO';
    return json(req, res, 200, esperaCompleta(e));
  }

  // ── Clientes del portal ──
  if (metodo === 'GET' && ruta === '/api/clientes/me/reservas') {
    const cliente = clienteDe(req);
    if (!cliente) return error(req, res, 401, 'SIN_SESION', 'Inicia sesión como cliente');
    return json(req, res, 200, RESERVAS.filter((r) => r.clienteId === cliente.id).map(reservaCompleta));
  }
  const reservaCliente = /^\/api\/clientes\/me\/reservas\/([^/]+)$/.exec(ruta);
  if (metodo === 'GET' && reservaCliente) {
    const cliente = clienteDe(req);
    if (!cliente) return error(req, res, 401, 'SIN_SESION', 'Inicia sesión como cliente');
    const r = RESERVAS.find((x) => x.id === reservaCliente[1] && x.clienteId === cliente.id);
    if (!r) return error(req, res, 404, 'NO_ENCONTRADA', 'La reserva no existe');
    return json(req, res, 200, reservaCompleta(r));
  }
  if (metodo === 'POST' && /^\/api\/clientes\/me\/reservas\/[^/]+\/cancelar$/.test(ruta)) {
    const id = ruta.split('/')[6];
    const r = RESERVAS.find((x) => x.id === id);
    if (r) r.estado = 'CANCELADA';
    return json(req, res, 200, r ? reservaCompleta(r) : {});
  }
  if (metodo === 'POST' && ruta === '/api/reservas') {
    const cliente = clienteDe(req);
    if (!cliente) return error(req, res, 401, 'SIN_SESION', 'Inicia sesión como cliente');
    const cuerpo = await leerCuerpo(req);
    const r = {
      id: randomUUID(),
      sedeId: Number(cuerpo.sedeId ?? 1),
      clienteId: cliente.id,
      mesaId: null,
      fecha: cuerpo.fecha ?? HOY,
      hora: cuerpo.hora ?? '20:00',
      duracionMin: 90,
      personas: Number(cuerpo.personas ?? 2),
      estado: 'CONFIRMADA',
      codigoConfirmacion: `${sedeDe(Number(cuerpo.sedeId ?? 1)).prefijoPedido}-${Math.floor(1000 + Math.random() * 9000)}`,
      notas: cuerpo.notas ?? null,
    };
    r.inicio = `${r.fecha}T${r.hora}:00.000Z`;
    r.fin = `${r.fecha}T${String(Number(r.hora.slice(0, 2)) + 1).padStart(2, '0')}:${r.hora.slice(3)}:00.000Z`;
    RESERVAS.push(r);
    return json(req, res, 201, reservaCompleta(r));
  }
  const reservaClientePatch = /^\/api\/reservas\/([^/]+)$/.exec(ruta);
  if (metodo === 'PATCH' && reservaClientePatch) {
    const cliente = clienteDe(req);
    if (!cliente) return error(req, res, 401, 'SIN_SESION', 'Inicia sesión como cliente');
    const cuerpo = await leerCuerpo(req);
    const r = RESERVAS.find((x) => x.id === reservaClientePatch[1] && x.clienteId === cliente.id);
    if (!r) return error(req, res, 404, 'NO_ENCONTRADA', 'La reserva no existe');
    Object.assign(r, cuerpo);
    return json(req, res, 200, reservaCompleta(r));
  }
  if (metodo === 'POST' && ruta === '/api/calificaciones') return json(req, res, 201, { ok: true });

  // ── Dispositivos ──
  if (metodo === 'GET' && ruta === '/api/dispositivos/yo') {
    const dispositivo = dispositivoPorToken(req.headers['x-device-token']);
    if (!dispositivo) return error(req, res, 401, 'DISPOSITIVO_INVALIDO', 'Token de dispositivo inválido');
    return json(req, res, 200, dispositivo);
  }
  if (metodo === 'POST' && ruta === '/api/pedidos') {
    const cuerpo = await leerCuerpo(req);
    const dispositivo = dispositivoPorToken(req.headers['x-device-token']);
    const sedeId = Number(cuerpo.sedeId ?? dispositivo?.sede.id ?? 1);
    const items = Array.isArray(cuerpo.items) && cuerpo.items.length
      ? cuerpo.items.map((i) => itemPedido(i.productoId, i.cantidad ?? 1, i.notas ?? null, sedeId))
      : [itemPedido(5, 1, null, sedeId)];
    const pedido = pedidoBase(
      randomUUID(),
      sedeId,
      `${sedeDe(sedeId).prefijoPedido}-${String(consecutivoPedido++).padStart(4, '0')}`,
      cuerpo.canal ?? 'CAJA',
      'RECIBIDO',
      cuerpo.clienteNombre ?? null,
      items,
      0,
      cuerpo.metodoPago ?? 'TARJETA',
    );
    PEDIDOS.unshift(pedido);
    return json(req, res, 201, pedido);
  }
  const pantalla = /^\/api\/pantalla\/(\d+)\/pedidos$/.exec(ruta);
  if (metodo === 'GET' && pantalla) {
    const sedeId = Number(pantalla[1]);
    const activos = PEDIDOS.filter((p) => p.sedeId === sedeId && ['RECIBIDO', 'EN_PREPARACION', 'LISTO'].includes(p.estado));
    const aPantalla = (p) => ({
      id: p.id,
      codigo: p.codigo,
      estado: p.estado,
      clienteNombre: p.clienteNombre,
      creadoEn: p.creadoEn,
      listoEn: p.listoEn,
    });
    return json(req, res, 200, {
      preparando: activos.filter((p) => p.estado !== 'LISTO').map(aPantalla),
      listos: activos.filter((p) => p.estado === 'LISTO').map(aPantalla),
    });
  }

  // ── Personal (requiere sesión) ──
  const usuario = exigirPersonal(req, res);
  if (!usuario) return;

  if (metodo === 'PUT' && ruta === '/api/marca') {
    const cuerpo = await leerCuerpo(req);
    Object.assign(MARCA, {
      nombre: cuerpo.nombre ?? MARCA.nombre,
      logo: cuerpo.logo ?? MARCA.logo,
      colorPrimario: cuerpo.colorPrimario ?? MARCA.colorPrimario,
      colorAcento: cuerpo.colorAcento ?? MARCA.colorAcento,
      actualizadoEn: iso(),
    });
    return json(req, res, 200, MARCA);
  }
  if (metodo === 'DELETE' && ruta === '/api/marca') {
    Object.assign(MARCA, { nombre: 'Fogón', logo: null, colorPrimario: '#D62828', colorAcento: '#FFB703', actualizadoEn: iso() });
    return json(req, res, 200, MARCA);
  }
  if (metodo === 'PUT' && ruta === '/api/configuracion') {
    const cuerpo = await leerCuerpo(req);
    if (typeof cuerpo.reservasHabilitadas === 'boolean') CONFIG.reservasHabilitadas = cuerpo.reservasHabilitadas;
    if (typeof cuerpo.salirFilaHabilitado === 'boolean') CONFIG.salirFilaHabilitado = cuerpo.salirFilaHabilitado;
    return json(req, res, 200, CONFIG);
  }
  if (metodo === 'GET' && ruta === '/api/sedes') {
    return json(req, res, 200, sedesDelUsuario(usuario).map(sedeCompleta));
  }

  const personalSede = /^\/api\/sedes\/(\d+)\/personal$/.exec(ruta);
  if (metodo === 'GET' && personalSede) {
    return json(req, res, 200, personalDe(Number(personalSede[1])));
  }

  // ── Menú de gestión ──
  if (metodo === 'GET' && ruta === '/api/categorias') return json(req, res, 200, CATEGORIAS);
  if (metodo === 'GET' && ruta === '/api/productos') {
    const items = [
      ...PRODUCTOS.map((p) => ({
        id: p.id,
        sku: p.sku,
        nombre: p.nombre,
        esCombo: false,
        activo: true,
        categoria: CATEGORIAS.find((c) => c.id === p.categoriaId),
      })),
      ...COMBOS.map((c) => ({
        id: c.id,
        sku: c.sku,
        nombre: c.nombre,
        esCombo: true,
        activo: c.activo,
        categoria: CATEGORIAS.find((x) => x.id === c.categoriaId),
      })),
    ];
    return json(req, res, 200, items);
  }

  const productosSede = /^\/api\/sedes\/(\d+)\/productos$/.exec(ruta);
  if (metodo === 'GET' && productosSede) {
    const sedeId = Number(productosSede[1]);
    const lista = [
      ...PRODUCTOS.map((p) => {
        const precio = precioEnSede(p.precioBase, sedeId);
        return {
          id: p.id,
          sku: p.sku,
          nombre: p.nombre,
          descripcion: p.descripcion,
          activo: true,
          esCombo: false,
          imagenUrl: null,
          categoria: { ...CATEGORIAS.find((c) => c.id === p.categoriaId) },
          enMenu: true,
          precio: dinero(precio),
          disponible: p.id !== 4,
        };
      }),
      ...COMBOS.filter((c) => c.sedes.includes(sedeId)).map((c) => ({
        id: c.id,
        sku: c.sku,
        nombre: c.nombre,
        descripcion: c.descripcion,
        activo: c.activo,
        esCombo: true,
        imagenUrl: null,
        categoria: { ...CATEGORIAS.find((x) => x.id === c.categoriaId) },
        enMenu: true,
        precio: dinero(precioEnSede(c.precioBase, sedeId)),
        disponible: true,
      })),
    ];
    return json(req, res, 200, lista);
  }

  const productoSede = /^\/api\/sedes\/(\d+)\/productos\/(\d+)$/.exec(ruta);
  if (metodo === 'PUT' && productoSede) {
    return json(req, res, 200, { ok: true });
  }
  const imagenProducto = /^\/api\/productos\/(\d+)\/imagen$/.exec(ruta);
  if (metodo === 'PUT' && imagenProducto) {
    for await (const _ of req) {
      /* descarta la imagen */
    }
    return json(req, res, 200, { imagenUrl: null });
  }
  if (metodo === 'DELETE' && imagenProducto) return json(req, res, 204, undefined);

  if (metodo === 'GET' && ruta === '/api/combos') {
    return json(
      req,
      res,
      200,
      COMBOS.map((c) => ({
        id: c.id,
        sku: c.sku,
        nombre: c.nombre,
        imagenUrl: null,
        descripcion: c.descripcion,
        activo: c.activo,
        categoriaId: c.categoriaId,
        componentes: c.componentes.map((comp) => {
          const p = PRODUCTOS.find((x) => x.id === comp.productoId);
          return {
            productoId: comp.productoId,
            cantidad: comp.cantidad,
            producto: { id: p.id, nombre: p.nombre, sku: p.sku },
          };
        }),
        sedes: c.sedes.map((sedeId) => {
          const precioSuelto = c.componentes.reduce(
            (total, comp) =>
              total +
              precioEnSede(PRODUCTOS.find((x) => x.id === comp.productoId).precioBase, sedeId) * comp.cantidad,
            0,
          );
          const sede = sedeDe(sedeId);
          return {
            sede: { id: sede.id, codigo: sede.codigo, nombre: sede.nombre },
            precio: dinero(precioEnSede(c.precioBase, sedeId)),
            disponible: true,
            precioSuelto,
          };
        }),
      })),
    );
  }
  if (metodo === 'POST' && ruta === '/api/combos') return json(req, res, 201, { id: Date.now() });
  const combo = /^\/api\/combos\/(\d+)$/.exec(ruta);
  if (metodo === 'PATCH' && combo) return json(req, res, 200, { id: Number(combo[1]) });

  if (metodo === 'GET' && ruta === '/api/promociones') {
    return json(req, res, 200, PROMOCIONES.map(promocionCompleta));
  }
  if (metodo === 'POST' && ruta === '/api/promociones') return json(req, res, 201, { id: Date.now() });
  const promocion = /^\/api\/promociones\/(\d+)$/.exec(ruta);
  if (metodo === 'PATCH' && promocion) {
    const cuerpo = await leerCuerpo(req);
    const p = PROMOCIONES.find((x) => x.id === Number(promocion[1]));
    if (p && typeof cuerpo.activa === 'boolean') p.activa = cuerpo.activa;
    return json(req, res, 200, p ? promocionCompleta(p) : {});
  }
  if (metodo === 'DELETE' && promocion) return json(req, res, 204, undefined);

  // ── Equipos y cupos ──
  if (metodo === 'GET' && ruta === '/api/dispositivos/cupos') {
    return json(
      req,
      res,
      200,
      sedesDelUsuario(usuario).map((s) => ({
        id: s.id,
        codigo: s.codigo,
        nombre: s.nombre,
        activa: s.activa,
        ciudad: { id: ciudadDe(s.ciudadId).id, nombre: ciudadDe(s.ciudadId).nombre, pais: { id: paisDeSede(s).id, nombre: paisDeSede(s).nombre } },
        cupos: cuposDe(s.id),
        enLinea: EQUIPOS.filter((e) => e.sedeId === s.id && e.activo && e.enLinea).length,
      })),
    );
  }
  const cuposSede = /^\/api\/sedes\/(\d+)\/cupos$/.exec(ruta);
  if (metodo === 'PUT' && cuposSede) {
    const cuerpo = await leerCuerpo(req);
    CUPOS.set(Number(cuposSede[1]), {
      KIOSCO: Number(cuerpo.cupoKioscos ?? 0),
      PANTALLA: Number(cuerpo.cupoPantallas ?? 0),
    });
    return json(req, res, 200, { ok: true });
  }

  const equiposSede = /^\/api\/sedes\/(\d+)\/dispositivos$/.exec(ruta);
  if (metodo === 'GET' && equiposSede) {
    const sedeId = Number(equiposSede[1]);
    return json(req, res, 200, {
      cupos: cuposDe(sedeId),
      dispositivos: EQUIPOS.filter((e) => e.sedeId === sedeId),
    });
  }
  if (metodo === 'POST' && equiposSede) {
    const sedeId = Number(equiposSede[1]);
    const cuerpo = await leerCuerpo(req);
    const cupos = cuposDe(sedeId);
    const tipo = cuerpo.tipo === 'PANTALLA' ? 'PANTALLA' : 'KIOSCO';
    if (cupos[tipo].activos >= cupos[tipo].cupo) {
      return error(req, res, 422, 'CUPO_AGOTADO', 'La sede ya tiene todos sus equipos activos');
    }
    const equipo = {
      id: randomUUID(),
      sedeId,
      nombre: cuerpo.nombre || `${tipo === 'KIOSCO' ? 'Kiosco' : 'Pantalla'} ${cupos[tipo].activos + 1}`,
      tipo,
      activo: true,
      creadoEn: iso(),
      ultimaConexionEn: null,
      enLinea: false,
    };
    const token = `mock-${tipo.toLowerCase()}-${equipo.id.slice(0, 8)}`;
    EQUIPOS.push(equipo);
    TOKENS.set(token, equipo.id);
    return json(req, res, 201, { ...equipo, token });
  }

  const equipo = /^\/api\/dispositivos\/([^/]+)$/.exec(ruta);
  if (metodo === 'PATCH' && equipo) {
    const cuerpo = await leerCuerpo(req);
    const e = EQUIPOS.find((x) => x.id === equipo[1]);
    if (!e) return error(req, res, 404, 'NO_ENCONTRADO', 'El equipo no existe');
    if (typeof cuerpo.activo === 'boolean') e.activo = cuerpo.activo;
    if (typeof cuerpo.nombre === 'string' && cuerpo.nombre) e.nombre = cuerpo.nombre;
    return json(req, res, 200, e);
  }
  if (metodo === 'DELETE' && equipo) {
    const i = EQUIPOS.findIndex((x) => x.id === equipo[1]);
    if (i >= 0) EQUIPOS.splice(i, 1);
    return json(req, res, 204, undefined);
  }
  const tokenEquipo = /^\/api\/dispositivos\/([^/]+)\/token$/.exec(ruta);
  if (metodo === 'POST' && tokenEquipo) {
    const e = EQUIPOS.find((x) => x.id === tokenEquipo[1]);
    if (!e) return error(req, res, 404, 'NO_ENCONTRADO', 'El equipo no existe');
    const token = `mock-${e.tipo.toLowerCase()}-${e.id.slice(0, 8)}-${Date.now()}`;
    TOKENS.set(token, e.id);
    return json(req, res, 200, { ...e, token });
  }

  // ── Mesas ──
  const mesasSede = /^\/api\/sedes\/(\d+)\/mesas$/.exec(ruta);
  if (metodo === 'GET' && mesasSede) {
    const sedeId = Number(mesasSede[1]);
    const mesas = MESAS.filter((m) => m.sedeId === sedeId);
    const resumen = { LIBRE: 0, RESERVADA: 0, OCUPADA: 0, LIMPIEZA: 0, FUERA_SERVICIO: 0, total: mesas.length, ocupacionPct: 0 };
    for (const m of mesas) resumen[m.estado] += 1;
    resumen.ocupacionPct = Math.round(((resumen.OCUPADA + resumen.RESERVADA) / resumen.total) * 100);
    return json(req, res, 200, { lienzo: { ancho: 1000, alto: 700 }, resumen, mesas });
  }
  const mesaEstado = /^\/api\/mesas\/(\d+)\/estado$/.exec(ruta);
  if (metodo === 'PATCH' && mesaEstado) {
    const cuerpo = await leerCuerpo(req);
    const mesa = MESAS.find((m) => m.id === Number(mesaEstado[1]));
    if (!mesa) return error(req, res, 404, 'NO_ENCONTRADA', 'La mesa no existe');
    if (cuerpo.estado) mesa.estado = cuerpo.estado;
    if (cuerpo.personas) mesa.sesionActual = { id: randomUUID(), origen: 'DIRECTO', personas: Number(cuerpo.personas), inicio: iso(), minutos: 0 };
    return json(req, res, 200, mesa);
  }
  const plano = /^\/api\/sedes\/(\d+)\/plano$/.exec(ruta);
  if (metodo === 'PUT' && plano) {
    const cuerpo = await leerCuerpo(req);
    for (const p of cuerpo.mesas ?? []) {
      const mesa = MESAS.find((m) => m.id === p.id);
      if (mesa) {
        mesa.posX = p.posX ?? mesa.posX;
        mesa.posY = p.posY ?? mesa.posY;
      }
    }
    return json(req, res, 200, { ok: true });
  }

  // ── Pedidos activos ──
  const pedidosSede = /^\/api\/sedes\/(\d+)\/pedidos\/activos$/.exec(ruta);
  if (metodo === 'GET' && pedidosSede) {
    const sedeId = Number(pedidosSede[1]);
    return json(
      req,
      res,
      200,
      PEDIDOS.filter((p) => p.sedeId === sedeId && ['RECIBIDO', 'EN_PREPARACION', 'LISTO'].includes(p.estado)),
    );
  }
  const pedidoEstado = /^\/api\/pedidos\/([^/]+)\/estado$/.exec(ruta);
  if (metodo === 'PATCH' && pedidoEstado) {
    const cuerpo = await leerCuerpo(req);
    const pedido = PEDIDOS.find((p) => p.id === pedidoEstado[1]);
    if (!pedido) return error(req, res, 404, 'NO_ENCONTRADO', 'El pedido no existe');
    pedido.estado = cuerpo.estado ?? pedido.estado;
    if (pedido.estado === 'LISTO') pedido.listoEn = iso();
    if (pedido.estado === 'ENTREGADO') pedido.entregadoEn = iso();
    return json(req, res, 200, pedido);
  }

  // ── Turnos ──
  if (metodo === 'GET' && ruta === '/api/turnos') {
    const sedeId = Number(q.get('sedeId') ?? 1);
    const desde = q.get('desde') ?? LUNES;
    const hasta = q.get('hasta') ?? fechaDe(sumarDias(6, new Date(`${LUNES}T12:00:00Z`)));
    const datos = TURNOS.filter((t) => t.sedeId === sedeId && t.fecha >= desde && t.fecha <= hasta);
    const resumenMap = new Map();
    for (const t of datos) {
      const actual = resumenMap.get(t.usuarioId) ?? { usuarioId: t.usuarioId, nombre: t.usuario.nombre, horas: 0, turnos: 0 };
      actual.horas += t.horas;
      actual.turnos += 1;
      resumenMap.set(t.usuarioId, actual);
    }
    return json(req, res, 200, {
      desde,
      hasta,
      zonaHoraria: sedeDe(sedeId).zonaHoraria,
      datos,
      resumen: [...resumenMap.values()],
    });
  }
  if (metodo === 'POST' && ruta === '/api/turnos') {
    const cuerpo = await leerCuerpo(req);
    const persona = personalDe(Number(cuerpo.sedeId)).find((p) => p.id === cuerpo.usuarioId);
    const turno = {
      id: randomUUID(),
      sedeId: Number(cuerpo.sedeId),
      usuarioId: cuerpo.usuarioId,
      puesto: cuerpo.puesto ?? 'CAJA',
      fecha: cuerpo.fecha,
      horaInicio: cuerpo.horaInicio,
      horaFin: cuerpo.horaFin,
      horas: Number(cuerpo.horas ?? 8),
      inicio: `${cuerpo.fecha}T${cuerpo.horaInicio}:00.000Z`,
      fin: `${cuerpo.fecha}T${cuerpo.horaFin}:00.000Z`,
      estado: 'PROGRAMADO',
      entradaReal: null,
      salidaReal: null,
      notas: cuerpo.notas ?? null,
      usuario: persona ? { id: persona.id, nombre: persona.nombre, rol: persona.rol } : { id: cuerpo.usuarioId, nombre: 'Persona', rol: 'CAJERO' },
    };
    TURNOS.push(turno);
    return json(req, res, 201, turno);
  }
  const turno = /^\/api\/turnos\/([^/]+)$/.exec(ruta);
  if (metodo === 'PATCH' && turno) {
    const cuerpo = await leerCuerpo(req);
    const t = TURNOS.find((x) => x.id === turno[1]);
    if (!t) return error(req, res, 404, 'NO_ENCONTRADO', 'El turno no existe');
    Object.assign(t, cuerpo);
    return json(req, res, 200, t);
  }
  if (metodo === 'DELETE' && turno) {
    const i = TURNOS.findIndex((x) => x.id === turno[1]);
    if (i >= 0) TURNOS.splice(i, 1);
    return json(req, res, 204, undefined);
  }
  const accionTurno = /^\/api\/turnos\/([^/]+)\/(entrada|salida)$/.exec(ruta);
  if (metodo === 'POST' && accionTurno) {
    const t = TURNOS.find((x) => x.id === accionTurno[1]);
    if (!t) return error(req, res, 404, 'NO_ENCONTRADO', 'El turno no existe');
    if (accionTurno[2] === 'entrada') {
      t.entradaReal = iso();
      t.estado = 'EN_CURSO';
    } else {
      t.salidaReal = iso();
      t.estado = 'COMPLETADO';
    }
    return json(req, res, 200, t);
  }

  // ── Reservas ──
  if (metodo === 'GET' && ruta === '/api/reservas') {
    const sedeId = Number(q.get('sedeId') ?? 0);
    const codigo = q.get('codigo');
    const fecha = q.get('fecha');
    const estados = q.get('estado')?.split(',');
    let lista = RESERVAS.filter((r) => !sedeId || r.sedeId === sedeId);
    if (fecha) lista = lista.filter((r) => r.fecha === fecha);
    if (codigo) lista = lista.filter((r) => r.codigoConfirmacion.toLowerCase().includes(codigo.toLowerCase()));
    if (estados?.length) lista = lista.filter((r) => estados.includes(r.estado));
    const porPagina = numero(q.get('porPagina'), 20);
    const pagina = numero(q.get('pagina'), 1);
    const total = lista.length;
    const datos = lista.slice((pagina - 1) * porPagina, pagina * porPagina).map(reservaCompleta);
    return json(req, res, 200, { datos, meta: { pagina, porPagina, total, paginas: Math.max(1, Math.ceil(total / porPagina)) } });
  }
  const reserva = /^\/api\/reservas\/([^/]+)$/.exec(ruta);
  if (metodo === 'PATCH' && reserva) {
    const cuerpo = await leerCuerpo(req);
    const r = RESERVAS.find((x) => x.id === reserva[1]);
    if (!r) return error(req, res, 404, 'NO_ENCONTRADA', 'La reserva no existe');
    Object.assign(r, cuerpo);
    return json(req, res, 200, reservaCompleta(r));
  }
  const accionReserva = /^\/api\/reservas\/([^/]+)\/([a-z-]+)$/.exec(ruta);
  if (metodo === 'POST' && accionReserva) {
    const r = RESERVAS.find((x) => x.id === accionReserva[1]);
    if (!r) return error(req, res, 404, 'NO_ENCONTRADA', 'La reserva no existe');
    if (accionReserva[2] === 'sentar') r.estado = 'SENTADA';
    if (accionReserva[2] === 'no-show') r.estado = 'NO_SHOW';
    if (accionReserva[2] === 'cancelar') r.estado = 'CANCELADA';
    return json(req, res, 200, reservaCompleta(r));
  }

  // ── Fila de espera (personal) ──
  const esperaSede = /^\/api\/sedes\/(\d+)\/espera$/.exec(ruta);
  if (metodo === 'GET' && esperaSede) {
    const sedeId = Number(esperaSede[1]);
    const datos = ESPERA.filter((e) => e.sedeId === sedeId && ['ESPERANDO', 'NOTIFICADO'].includes(e.estado)).map(esperaCompleta);
    return json(req, res, 200, {
      esperando: datos.filter((e) => e.estado === 'ESPERANDO').length,
      notificados: datos.filter((e) => e.estado === 'NOTIFICADO').length,
      datos,
    });
  }
  const accionEspera = /^\/api\/espera\/([^/]+)\/(notificar|sentar)$/.exec(ruta);
  if (metodo === 'POST' && accionEspera) {
    const e = ESPERA.find((x) => x.id === accionEspera[1]);
    if (!e) return error(req, res, 404, 'NO_ENCONTRADA', 'El turno no existe');
    if (accionEspera[2] === 'notificar') {
      e.estado = 'NOTIFICADO';
      e.notificadoEn = iso();
    } else {
      e.estado = 'SENTADO';
      e.mesa = 'M1';
    }
    return json(req, res, 200, esperaCompleta(e));
  }


  // ── Reportes ──
  if (metodo === 'GET' && ruta === '/api/reportes/kpis') {
    const desde = q.get('desde') ?? fechaDe(sumarDias(-29));
    const hasta = q.get('hasta') ?? HOY;
    const dias = Math.max(1, Math.round((new Date(hasta) - new Date(desde)) / 86_400_000) + 1);
    return json(req, res, 200, { periodo: { desde, hasta, dias }, ...REPORTES.kpis });
  }
  if (metodo === 'GET' && ruta === '/api/reportes/ventas') {
    return json(req, res, 200, { datos: reporteVentas(q.get('agrupar') ?? 'dia') });
  }
  if (metodo === 'GET' && ruta === '/api/reportes/ocupacion') {
    return json(req, res, 200, reporteOcupacion(q.get('agrupar') ?? 'hora'));
  }
  if (metodo === 'GET' && ruta === '/api/reportes/calificaciones') {
    return json(req, res, 200, REPORTES.calificaciones);
  }

  return error(req, res, 404, 'NO_ENCONTRADO', `No existe ${metodo} ${ruta} en el mock`);
});

servidor.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `\n  El puerto ${PUERTO} ya está en uso. Cierra el mock anterior o usa otro puerto ` +
        `con MOCK_PORT y VITE_API_PROXY.\n`,
    );
  } else {
    console.error(error);
  }
  process.exit(1);
});

servidor.listen(PUERTO, () => {
  console.log(`\n  Mock API escuchando en http://localhost:${PUERTO}`);
  console.log(`  Salud: http://localhost:${PUERTO}/api/health`);
  console.log(`  Cuentas: admin@restaurantes.demo / ${CLAVE}`);
  console.log(`  Cliente: cliente@restaurantes.demo / ${CLAVE}`);
  console.log(`  Dispositivo: kiosco-ctg-01-demo | pantalla-ctg-01-demo\n`);
});
