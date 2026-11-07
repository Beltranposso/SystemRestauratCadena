import { z } from 'zod';
import type { Prisma, RolUsuario } from '@prisma/client';
import { RolUsuario as Roles } from '@restaurantes/shared';
import { prisma } from '../../db/prisma';
import { crearModulo } from '../../http/ruta';
import { booleanoQuery, idEntero, paginacion, paginado, saltar } from '../../http/esquemas';
import { HttpError } from '../../utils/http-error';
import { asegurarPais, asegurarSede, obtenerSede } from '../../auth/alcance';
import type { AuthPersonal } from '../../auth/tipos';
import { hashPassword, revocarTodas } from '../../auth/tokens';

export const moduloUsuarios = crearModulo('Usuarios del personal');
const { ruta } = moduloUsuarios;

const GESTORES = ['ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE'] as const;

/** Roles que cada gestor puede crear o editar. */
const ROLES_GESTIONABLES: Record<string, readonly RolUsuario[]> = {
  ADMIN_GLOBAL: ['ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE', 'CAJERO', 'COCINA'],
  GERENTE_PAIS: ['GERENTE_SEDE', 'CAJERO', 'COCINA'],
  GERENTE_SEDE: ['CAJERO', 'COCINA'],
};

const camposPublicos = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  paisId: true,
  sedeId: true,
  activo: true,
  creadoEn: true,
  sede: { select: { codigo: true, nombre: true } },
  pais: { select: { codigoIso: true, nombre: true } },
} as const;

const rolEnum = z.enum(Object.keys(Roles) as [RolUsuario, ...RolUsuario[]]);

/** Comprueba que el gestor pueda asignar ese rol con ese alcance y normaliza paisId/sedeId. */
async function validarAsignacion(
  auth: AuthPersonal,
  rol: RolUsuario,
  paisId: number | null | undefined,
  sedeId: number | null | undefined,
) {
  if (!ROLES_GESTIONABLES[auth.rol]?.includes(rol)) {
    throw HttpError.forbidden(`No puedes asignar el rol ${rol}`);
  }
  if (rol === 'ADMIN_GLOBAL') return { paisId: null, sedeId: null };
  if (rol === 'GERENTE_PAIS') {
    if (!paisId) throw HttpError.badRequest('El gerente de país necesita paisId');
    await asegurarPais(auth, paisId);
    return { paisId, sedeId: null };
  }
  if (!sedeId) throw HttpError.badRequest(`El rol ${rol} necesita sedeId`);
  await asegurarSede(auth, sedeId);
  return { paisId: null, sedeId };
}

/** Filtro de usuarios visibles para el gestor. */
async function whereUsuariosVisibles(auth: AuthPersonal): Promise<Prisma.UsuarioWhereInput> {
  if (auth.rol === 'ADMIN_GLOBAL') return {};
  if (auth.rol === 'GERENTE_PAIS') {
    return {
      OR: [{ sede: { ciudad: { paisId: auth.paisId ?? -1 } } }, { paisId: auth.paisId ?? -1 }],
    };
  }
  return { sedeId: auth.sedeId ?? -1 };
}

async function cargarGestionable(auth: AuthPersonal, id: string) {
  const usuario = await prisma.usuario.findFirst({
    where: { AND: [{ id }, await whereUsuariosVisibles(auth)] },
  });
  if (!usuario) throw HttpError.notFound('Usuario');
  if (usuario.id !== auth.id && !ROLES_GESTIONABLES[auth.rol]?.includes(usuario.rol)) {
    throw HttpError.forbidden('No puedes editar a un usuario de ese rol');
  }
  return usuario;
}

ruta(
  {
    metodo: 'get',
    ruta: '/usuarios',
    resumen: 'Listar personal',
    auth: 'personal',
    roles: GESTORES,
    query: paginacion.extend({
      sedeId: idEntero.optional(),
      rol: rolEnum.optional(),
      activo: booleanoQuery.optional(),
      buscar: z.string().trim().min(2).max(60).optional().describe('Nombre o email'),
    }),
  },
  async ({ auth, query }) => {
    if (query.sedeId) await asegurarSede(auth, query.sedeId);
    const where: Prisma.UsuarioWhereInput = {
      AND: [
        await whereUsuariosVisibles(auth),
        query.sedeId ? { sedeId: query.sedeId } : {},
        query.rol ? { rol: query.rol } : {},
        query.activo !== undefined ? { activo: query.activo } : {},
        query.buscar
          ? {
              OR: [
                { nombre: { contains: query.buscar, mode: 'insensitive' } },
                { email: { contains: query.buscar, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
    const [datos, total] = await Promise.all([
      prisma.usuario.findMany({
        where,
        select: camposPublicos,
        orderBy: [{ sedeId: 'asc' }, { rol: 'asc' }, { nombre: 'asc' }],
        ...saltar(query),
      }),
      prisma.usuario.count({ where }),
    ]);
    return paginado(datos, total, query);
  },
);

ruta(
  {
    metodo: 'post',
    ruta: '/usuarios',
    resumen: 'Crear usuario del personal',
    descripcion:
      'Admin global: cualquier rol. Gerente de país: gerentes de sede, cajeros y cocina de su país. Gerente de sede: cajeros y cocina de su sede.',
    auth: 'personal',
    roles: GESTORES,
    status: 201,
    body: z.object({
      nombre: z.string().trim().min(3).max(120),
      email: z.string().trim().toLowerCase().email().max(160),
      password: z.string().min(8).max(100),
      rol: rolEnum,
      paisId: idEntero.optional(),
      sedeId: idEntero.optional(),
    }),
  },
  async ({ auth, body }) => {
    const alcance = await validarAsignacion(auth, body.rol, body.paisId, body.sedeId);
    if (await prisma.usuario.findUnique({ where: { email: body.email } })) {
      throw HttpError.conflict('Ya existe un usuario con ese email');
    }
    return prisma.usuario.create({
      data: {
        nombre: body.nombre,
        email: body.email,
        rol: body.rol,
        ...alcance,
        passwordHash: await hashPassword(body.password),
      },
      select: camposPublicos,
    });
  },
);

ruta(
  {
    metodo: 'patch',
    ruta: '/usuarios/:id',
    resumen: 'Editar usuario (nombre, rol, sede, activo, contraseña)',
    descripcion: 'Desactivar a un usuario cierra todas sus sesiones.',
    auth: 'personal',
    roles: GESTORES,
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      nombre: z.string().trim().min(3).max(120).optional(),
      activo: z.boolean().optional(),
      password: z.string().min(8).max(100).optional(),
      rol: rolEnum.optional(),
      paisId: idEntero.nullable().optional(),
      sedeId: idEntero.nullable().optional(),
    }),
  },
  async ({ auth, params, body }) => {
    const usuario = await cargarGestionable(auth, params.id);
    const esUnoMismo = usuario.id === auth.id;
    if (
      esUnoMismo &&
      (body.rol || body.activo === false || body.sedeId !== undefined || body.paisId !== undefined)
    ) {
      throw HttpError.unprocessable('No puedes cambiar tu propio rol, alcance o desactivarte');
    }

    const data: Prisma.UsuarioUncheckedUpdateInput = {};
    if (body.nombre) data.nombre = body.nombre;
    if (body.activo !== undefined) data.activo = body.activo;
    if (body.password) data.passwordHash = await hashPassword(body.password);
    if (body.rol || body.sedeId !== undefined || body.paisId !== undefined) {
      const rol = body.rol ?? usuario.rol;
      const alcance = await validarAsignacion(
        auth,
        rol,
        body.paisId === undefined ? usuario.paisId : body.paisId,
        body.sedeId === undefined ? usuario.sedeId : body.sedeId,
      );
      Object.assign(data, { rol, ...alcance });
    }

    const actualizado = await prisma.usuario.update({
      where: { id: usuario.id },
      data,
      select: camposPublicos,
    });
    if (body.activo === false || body.password || body.rol)
      await revocarTodas({ usuarioId: usuario.id });
    return actualizado;
  },
);

ruta(
  {
    metodo: 'get',
    ruta: '/sedes/:sedeId/personal',
    resumen: 'Personal activo de una sede (para asignar turnos)',
    auth: 'personal',
    roles: GESTORES,
    params: z.object({ sedeId: idEntero }),
  },
  async ({ auth, params }) => {
    await asegurarSede(auth, params.sedeId);
    await obtenerSede(params.sedeId);
    return prisma.usuario.findMany({
      where: { sedeId: params.sedeId, activo: true },
      select: { id: true, nombre: true, rol: true, email: true },
      orderBy: [{ rol: 'asc' }, { nombre: 'asc' }],
    });
  },
);
