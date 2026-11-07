import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Prisma, PrismaClient, PuestoTurno, RolUsuario } from '@prisma/client';
import { fechaOperacion, localAUtc, sumarDias } from '../../src/utils/fechas';
import { insertarEnLotes, sumarMin, type Rng } from './aleatorio';
import {
  APELLIDOS,
  CATEGORIAS,
  DOMINIO,
  NOMBRES,
  PAISES,
  PASSWORD_DEMO,
  PLANO_MESAS,
  PRODUCTOS,
  PROMOCIONES,
} from './datos';

export interface ProductoCtx {
  id: number;
  sku: string;
  nombre: string;
  precio: number;
  popularidad: number;
  /** Contenido del combo (copia para cocina) */
  componentes?: { nombre: string; cantidad: number }[];
}

export interface SedeCtx {
  id: number;
  codigo: string;
  prefijo: string;
  zona: string;
  demanda: number;
  kioscos: number;
  redondeo: number;
  duracionReservaMin: number;
  pais: { id: number; codigoIso: string; moneda: string; tasaUsd: number; tasaImpuesto: number };
  productos: ProductoCtx[];
  gerente: string;
  cajeros: string[];
  cocina: string[];
  mesas: { id: number; codigo: string; capacidad: number }[];
}

export interface ClienteCtx {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
}

export interface Credencial {
  rol: string;
  email: string;
  alcance: string;
}

export interface TokenDispositivo {
  sede: string;
  tipo: string;
  token: string;
}

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const redondearA = (v: number, multiplo: number) =>
  Math.round(Math.round(v / multiplo) * multiplo * 100) / 100;
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.');

export function nombreAleatorio(rng: Rng) {
  return `${rng.elegir(NOMBRES)} ${rng.elegir(APELLIDOS)}`;
}

export function telefonoAleatorio(rng: Rng, codigoIso: string) {
  const prefijo = { CO: '+57 3', MX: '+52 55', PE: '+51 9' }[codigoIso] ?? '+57 3';
  return `${prefijo}${String(rng.entero(10_000_000, 99_999_999))}`;
}

const TABLAS = [
  'calificaciones',
  'notificaciones',
  'sesiones_mesa',
  'entradas_espera',
  'reservas',
  'mesas',
  'turnos',
  'secuencias_pedido',
  'pedido_estado_historial',
  'pedido_items',
  'pedidos',
  'promociones_sede',
  'promociones',
  'combo_componentes',
  'productos_sede',
  'productos',
  'categorias',
  'dispositivos',
  'refresh_tokens',
  'clientes',
  'usuarios',
  'sedes',
  'ciudades',
  'paises',
];

export async function limpiar(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLAS.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

/** Países, ciudades, sedes, catálogo y menú por sede. */
export async function sembrarGeografiaYCatalogo(prisma: PrismaClient, rng: Rng) {
  const categorias = new Map<string, number>();
  for (const c of CATEGORIAS) {
    const creada = await prisma.categoria.create({ data: { ...c } });
    categorias.set(c.nombre, creada.id);
  }

  const productos = new Map<string, number>();
  for (const p of PRODUCTOS) {
    const creado = await prisma.producto.create({
      data: {
        sku: p.sku,
        nombre: p.nombre,
        descripcion: p.descripcion,
        categoriaId: categorias.get(p.categoria)!,
        esCombo: Boolean(p.componentes),
      },
    });
    productos.set(p.sku, creado.id);
  }
  const nombrePorSku = new Map(PRODUCTOS.map((p) => [p.sku, p.nombre]));
  await prisma.comboComponente.createMany({
    data: PRODUCTOS.flatMap((p) =>
      (p.componentes ?? []).map(([sku, cantidad]) => ({
        comboId: productos.get(p.sku)!,
        productoId: productos.get(sku)!,
        cantidad,
      })),
    ),
  });

  const sedes: SedeCtx[] = [];
  for (const pais of PAISES) {
    const paisDb = await prisma.pais.create({
      data: {
        codigoIso: pais.codigoIso,
        nombre: pais.nombre,
        moneda: pais.moneda,
        tasaUsd: pais.tasaUsd,
        tasaImpuesto: pais.tasaImpuesto,
      },
    });

    for (const ciudad of pais.ciudades) {
      const ciudadDb = await prisma.ciudad.create({
        data: { paisId: paisDb.id, nombre: ciudad.nombre },
      });

      for (const s of ciudad.sedes) {
        const sedeDb = await prisma.sede.create({
          data: {
            ciudadId: ciudadDb.id,
            codigo: s.codigo,
            nombre: s.nombre,
            direccion: s.direccion,
            zonaHoraria: pais.zonaHoraria,
            prefijoPedido: s.prefijo,
            cupoKioscos: s.cupoKioscos ?? 2,
            cupoPantallas: s.cupoPantallas ?? 1,
          },
        });

        const menu: Prisma.ProductoSedeCreateManyInput[] = [];
        const productosSede: ProductoCtx[] = [];
        PRODUCTOS.filter(
          (p) =>
            (!p.paises || p.paises.includes(pais.codigoIso)) &&
            (!p.sedes || p.sedes.includes(s.codigo)),
        ).forEach((p, i) => {
          const precio = redondearA(
            p.precioUsd * pais.tasaUsd * pais.ajustePrecio * s.ajustePrecio,
            pais.redondeo,
          );
          // La sede de menor demanda de cada ciudad no ofrece el producto veggie (menú adaptado por sede)
          const ofrecido = !(p.sku === 'HAM-005' && s.demanda < 1);
          if (!ofrecido) return;
          const disponible = !rng.prob(0.04); // alguno agotado temporalmente
          menu.push({
            sedeId: sedeDb.id,
            productoId: productos.get(p.sku)!,
            precio,
            disponible,
            orden: i + 1,
          });
          if (disponible)
            productosSede.push({
              id: productos.get(p.sku)!,
              sku: p.sku,
              nombre: p.nombre,
              precio,
              popularidad: p.popularidad,
              componentes: p.componentes?.map(([sku, cantidad]) => ({
                nombre: nombrePorSku.get(sku)!,
                cantidad,
              })),
            });
        });
        await prisma.productoSede.createMany({ data: menu });

        sedes.push({
          id: sedeDb.id,
          codigo: s.codigo,
          prefijo: s.prefijo,
          zona: pais.zonaHoraria,
          demanda: s.demanda,
          kioscos: s.kioscos ?? 1,
          redondeo: pais.redondeo,
          duracionReservaMin: sedeDb.duracionReservaMin,
          pais: {
            id: paisDb.id,
            codigoIso: pais.codigoIso,
            moneda: pais.moneda,
            tasaUsd: pais.tasaUsd,
            tasaImpuesto: pais.tasaImpuesto,
          },
          productos: productosSede,
          gerente: '',
          cajeros: [],
          cocina: [],
          mesas: [],
        });
      }
    }
  }
  return sedes;
}

/** Personal por rol, clientes y dispositivos. Todas las cuentas usan PASSWORD_DEMO. */
export async function sembrarPersonas(prisma: PrismaClient, rng: Rng, sedes: SedeCtx[]) {
  const passwordHash = await bcrypt.hash(PASSWORD_DEMO, 10);
  const credenciales: Credencial[] = [];
  const usuarios: Prisma.UsuarioCreateManyInput[] = [];

  const agregar = (
    rol: RolUsuario,
    email: string,
    alcance: string,
    extra: { paisId?: number; sedeId?: number },
  ) => {
    const id = randomUUID();
    usuarios.push({
      id,
      nombre: nombreAleatorio(rng),
      email,
      passwordHash,
      rol,
      paisId: extra.paisId ?? null,
      sedeId: extra.sedeId ?? null,
    });
    return id;
  };

  agregar('ADMIN_GLOBAL', `admin@${DOMINIO}`, 'Toda la cadena', {});
  credenciales.push({ rol: 'ADMIN_GLOBAL', email: `admin@${DOMINIO}`, alcance: 'Toda la cadena' });

  const paisesVistos = new Set<number>();
  for (const sede of sedes) {
    if (!paisesVistos.has(sede.pais.id)) {
      paisesVistos.add(sede.pais.id);
      const email = `gerente.${sede.pais.codigoIso.toLowerCase()}@${DOMINIO}`;
      agregar('GERENTE_PAIS', email, sede.pais.codigoIso, { paisId: sede.pais.id });
      credenciales.push({ rol: 'GERENTE_PAIS', email, alcance: sede.pais.codigoIso });
    }

    const cod = slug(sede.codigo).replace(/\./g, '');
    sede.gerente = agregar('GERENTE_SEDE', `gerente.${cod}@${DOMINIO}`, sede.codigo, {
      sedeId: sede.id,
    });
    for (let i = 1; i <= 3; i++) {
      sede.cajeros.push(
        agregar('CAJERO', `cajero${i}.${cod}@${DOMINIO}`, sede.codigo, { sedeId: sede.id }),
      );
      sede.cocina.push(
        agregar('COCINA', `cocina${i}.${cod}@${DOMINIO}`, sede.codigo, { sedeId: sede.id }),
      );
    }
    if (sede.codigo === 'CTG-01') {
      credenciales.push(
        { rol: 'GERENTE_SEDE', email: `gerente.${cod}@${DOMINIO}`, alcance: sede.codigo },
        { rol: 'CAJERO', email: `cajero1.${cod}@${DOMINIO}`, alcance: sede.codigo },
        { rol: 'COCINA', email: `cocina1.${cod}@${DOMINIO}`, alcance: sede.codigo },
      );
    }
  }
  await prisma.usuario.createMany({ data: usuarios });

  // Clientes: uno fijo para la demo + 80 aleatorios
  const clientes: ClienteCtx[] = [
    {
      id: randomUUID(),
      nombre: 'Andrés Pérez',
      email: `cliente@${DOMINIO}`,
      telefono: '+57 3001234567',
    },
  ];
  const emails = new Set(clientes.map((c) => c.email));
  while (clientes.length < 81) {
    const nombre = nombreAleatorio(rng);
    const email = `${slug(nombre)}${rng.entero(1, 99)}@correo.demo`;
    if (emails.has(email)) continue;
    emails.add(email);
    clientes.push({
      id: randomUUID(),
      nombre,
      email,
      telefono: telefonoAleatorio(rng, rng.elegir(['CO', 'MX', 'PE'])),
    });
  }
  await prisma.cliente.createMany({ data: clientes.map((c) => ({ ...c, passwordHash })) });
  credenciales.push({ rol: 'CLIENTE', email: `cliente@${DOMINIO}`, alcance: 'Portal de reservas' });

  // Dispositivos: tokens predecibles SOLO para la demo (en producción se generan aleatorios)
  const tokens: TokenDispositivo[] = [];
  const dispositivos: Prisma.DispositivoCreateManyInput[] = [];
  for (const sede of sedes) {
    const equipos = [
      { tipo: 'PANTALLA' as const, nombre: 'Pantalla de pedidos', n: 1 },
      ...Array.from({ length: sede.kioscos }, (_, i) => ({
        tipo: 'KIOSCO' as const,
        nombre: `Kiosco ${i + 1}`,
        n: i + 1,
      })),
    ];
    for (const e of equipos) {
      const token = `${e.tipo.toLowerCase()}${e.n > 1 ? e.n : ''}-${sede.codigo.toLowerCase()}-demo`;
      dispositivos.push({
        sedeId: sede.id,
        nombre: e.nombre,
        tipo: e.tipo,
        tokenHash: hashToken(token),
      });
      tokens.push({ sede: sede.codigo, tipo: e.tipo, token });
    }
  }
  await prisma.dispositivo.createMany({ data: dispositivos });

  return { clientes, credenciales, tokens };
}

/** Mesas según el plano base: las sedes de menor demanda tienen menos mesas. */
export async function sembrarMesas(prisma: PrismaClient, sedes: SedeCtx[]) {
  for (const sede of sedes) {
    const cantidad = sede.demanda >= 1.2 ? PLANO_MESAS.length : sede.demanda >= 1 ? 13 : 11;
    const plano = PLANO_MESAS.slice(0, cantidad);
    await prisma.mesa.createMany({ data: plano.map((m) => ({ ...m, sedeId: sede.id })) });
    const creadas = await prisma.mesa.findMany({
      where: { sedeId: sede.id },
      select: { id: true, codigo: true, capacidad: true },
      orderBy: { id: 'asc' },
    });
    sede.mesas = creadas;
  }
}

/**
 * Turnos de las últimas 2 semanas y la próxima. Cada empleado trabaja 5 de 7 días.
 * Pasados: completados (5 % ausencias). En curso: con entrada marcada. Futuros: programados.
 */
export async function sembrarTurnos(prisma: PrismaClient, rng: Rng, sedes: SedeCtx[], ahora: Date) {
  const turnos: Prisma.TurnoCreateManyInput[] = [];

  for (const sede of sedes) {
    const hoy = fechaOperacion(ahora, sede.zona);
    const personal: { id: string; puesto: PuestoTurno; franja: [number, number] }[] = [
      { id: sede.gerente, puesto: 'GERENCIA', franja: [10, 18] },
      ...sede.cajeros.map((id, i) => ({
        id,
        puesto: 'CAJA' as const,
        franja: (i % 2 ? [14, 22] : [7, 15]) as [number, number],
      })),
      ...sede.cocina.map((id, i) => ({
        id,
        puesto: 'COCINA' as const,
        franja: (i % 2 ? [14, 22] : [7, 15]) as [number, number],
      })),
    ];

    personal.forEach((p, idx) => {
      for (let d = -14; d <= 6; d++) {
        const fecha = sumarDias(hoy, d);
        // Dos días de descanso fijos por persona, escalonados
        const dia = (new Date(`${fecha}T12:00:00Z`).getUTCDay() + idx) % 7;
        if (dia === 0 || dia === 3) continue;

        const inicio = localAUtc(fecha, p.franja[0], 0, sede.zona);
        const fin = localAUtc(fecha, p.franja[1], 0, sede.zona);
        let estado: Prisma.TurnoCreateManyInput['estado'] = 'PROGRAMADO';
        let entradaReal: Date | null = null;
        let salidaReal: Date | null = null;

        if (fin <= ahora) {
          if (rng.prob(0.05)) {
            estado = 'AUSENTE';
          } else {
            estado = 'COMPLETADO';
            entradaReal = sumarMin(inicio, rng.entero(-8, 12));
            salidaReal = sumarMin(fin, rng.entero(0, 25));
          }
        } else if (inicio <= ahora) {
          estado = 'EN_CURSO';
          entradaReal = sumarMin(inicio, rng.entero(-8, 10));
        }

        turnos.push({
          sedeId: sede.id,
          usuarioId: p.id,
          puesto: p.puesto,
          inicio,
          fin,
          estado,
          entradaReal,
          salidaReal,
          notas: estado === 'AUSENTE' ? 'No se presentó' : null,
        });
      }
    });
  }

  await insertarEnLotes(turnos, (lote) => prisma.turno.createMany({ data: lote }));
  return turnos.length;
}

/** Promociones de la casa matriz, con fechas relativas a hoy. */
export async function sembrarPromociones(prisma: PrismaClient, sedes: SedeCtx[], ahora: Date) {
  const categorias = new Map(
    (await prisma.categoria.findMany()).map((c) => [c.nombre, c.id] as const),
  );
  const productos = new Map(
    (await prisma.producto.findMany({ select: { id: true, sku: true } })).map(
      (p) => [p.sku, p.id] as const,
    ),
  );
  const hoy = fechaOperacion(ahora, 'America/Bogota');
  const fechaDb = (d: number) => new Date(`${sumarDias(hoy, d)}T00:00:00.000Z`);

  for (const p of PROMOCIONES) {
    const elegidas = sedes.filter((s) =>
      p.sedes === 'TODAS'
        ? true
        : p.sedes.includes(s.codigo) || (p.paises ?? []).includes(s.pais.codigoIso),
    );
    // Solo sedes que venden el producto (o algo de la categoría)
    const conProducto = p.sku
      ? elegidas.filter((s) => s.productos.some((x) => x.sku === p.sku))
      : elegidas;
    if (!conProducto.length) continue;

    let precioEspecial: number | null = null;
    if (p.tipo === 'PRECIO_FIJO') {
      const precios = conProducto.map((s) => s.productos.find((x) => x.sku === p.sku)!.precio);
      precioEspecial = redondearA(Math.min(...precios) * p.factorPrecio!, conProducto[0]!.redondeo);
    }

    await prisma.promocion.create({
      data: {
        nombre: p.nombre,
        descripcion: p.descripcion,
        tipo: p.tipo,
        productoId: p.sku ? productos.get(p.sku)! : null,
        categoriaId: p.categoria ? categorias.get(p.categoria)! : null,
        porcentaje: p.porcentaje ?? null,
        precioEspecial,
        llevaN: p.llevaN ?? null,
        pagaM: p.pagaM ?? null,
        fechaInicio: fechaDb(p.desde),
        fechaFin: p.hasta === null ? null : fechaDb(p.hasta),
        diasSemana: p.diasSemana ?? [],
        horaInicio: p.horaInicio ?? null,
        horaFin: p.horaFin ?? null,
        sedes: { create: conProducto.map((s) => ({ sedeId: s.id })) },
      },
    });
  }
  return PROMOCIONES.length;
}
