-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('ADMIN_GLOBAL', 'GERENTE_PAIS', 'GERENTE_SEDE', 'CAJERO', 'COCINA');

-- CreateEnum
CREATE TYPE "TipoDispositivo" AS ENUM ('PANTALLA', 'KIOSCO');

-- CreateEnum
CREATE TYPE "CanalPedido" AS ENUM ('CAJA', 'KIOSCO', 'WEB');

-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('RECIBIDO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "TipoSecuencia" AS ENUM ('PEDIDO', 'ESPERA');

-- CreateEnum
CREATE TYPE "PuestoTurno" AS ENUM ('CAJA', 'COCINA', 'SERVICIO', 'GERENCIA');

-- CreateEnum
CREATE TYPE "EstadoTurno" AS ENUM ('PROGRAMADO', 'EN_CURSO', 'COMPLETADO', 'AUSENTE');

-- CreateEnum
CREATE TYPE "FormaMesa" AS ENUM ('REDONDA', 'CUADRADA', 'RECTANGULAR');

-- CreateEnum
CREATE TYPE "EstadoMesa" AS ENUM ('LIBRE', 'RESERVADA', 'OCUPADA', 'LIMPIEZA', 'FUERA_SERVICIO');

-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'SENTADA', 'COMPLETADA', 'CANCELADA', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "EstadoEspera" AS ENUM ('ESPERANDO', 'NOTIFICADO', 'SENTADO', 'ABANDONO');

-- CreateEnum
CREATE TYPE "OrigenSesion" AS ENUM ('RESERVA', 'ESPERA', 'DIRECTO');

-- CreateEnum
CREATE TYPE "CanalNotificacion" AS ENUM ('EN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('CONFIRMACION_RESERVA', 'CAMBIO_RESERVA', 'MESA_LISTA', 'RECORDATORIO');

-- CreateEnum
CREATE TYPE "EstadoNotificacion" AS ENUM ('PENDIENTE', 'ENVIADA', 'FALLIDA');

-- CreateTable
CREATE TABLE "paises" (
    "id" SERIAL NOT NULL,
    "codigo_iso" CHAR(2) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "moneda" CHAR(3) NOT NULL,
    "tasa_usd" DECIMAL(18,6) NOT NULL,
    "tasa_impuesto" DECIMAL(5,4) NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ciudades" (
    "id" SERIAL NOT NULL,
    "pais_id" INTEGER NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,

    CONSTRAINT "ciudades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sedes" (
    "id" SERIAL NOT NULL,
    "ciudad_id" INTEGER NOT NULL,
    "codigo" VARCHAR(12) NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "direccion" VARCHAR(200) NOT NULL,
    "zona_horaria" VARCHAR(64) NOT NULL,
    "prefijo_pedido" VARCHAR(3) NOT NULL,
    "duracion_reserva_min" INTEGER NOT NULL DEFAULT 90,
    "horas_minimas_cancelacion" INTEGER NOT NULL DEFAULT 2,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sedes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "password_hash" VARCHAR(100) NOT NULL,
    "rol" "RolUsuario" NOT NULL,
    "pais_id" INTEGER,
    "sede_id" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "telefono" VARCHAR(20) NOT NULL,
    "password_hash" VARCHAR(100) NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "usuario_id" UUID,
    "cliente_id" UUID,
    "token_hash" VARCHAR(128) NOT NULL,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "revocado_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispositivos" (
    "id" UUID NOT NULL,
    "sede_id" INTEGER NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "tipo" "TipoDispositivo" NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispositivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "icono" VARCHAR(40) NOT NULL,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos" (
    "id" SERIAL NOT NULL,
    "categoria_id" INTEGER NOT NULL,
    "sku" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "descripcion" VARCHAR(300) NOT NULL,
    "imagen_url" VARCHAR(300),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos_sede" (
    "sede_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "precio" DECIMAL(12,2) NOT NULL,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER,

    CONSTRAINT "productos_sede_pkey" PRIMARY KEY ("sede_id","producto_id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" UUID NOT NULL,
    "sede_id" INTEGER NOT NULL,
    "fecha_operacion" DATE NOT NULL,
    "numero_dia" INTEGER NOT NULL,
    "codigo" VARCHAR(12) NOT NULL,
    "canal" "CanalPedido" NOT NULL,
    "estado" "EstadoPedido" NOT NULL DEFAULT 'RECIBIDO',
    "cliente_nombre" VARCHAR(80),
    "cajero_id" UUID,
    "mesa_id" INTEGER,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "impuestos" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "moneda" CHAR(3) NOT NULL,
    "total_usd" DECIMAL(12,2) NOT NULL,
    "metodo_pago" "MetodoPago" NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listo_en" TIMESTAMPTZ(3),
    "entregado_en" TIMESTAMPTZ(3),

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_items" (
    "id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "nombre_producto" VARCHAR(120) NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "notas" VARCHAR(200),

    CONSTRAINT "pedido_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_estado_historial" (
    "id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "estado" "EstadoPedido" NOT NULL,
    "usuario_id" UUID,
    "registrado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedido_estado_historial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secuencias_pedido" (
    "sede_id" INTEGER NOT NULL,
    "fecha_operacion" DATE NOT NULL,
    "tipo" "TipoSecuencia" NOT NULL DEFAULT 'PEDIDO',
    "ultimo_numero" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "secuencias_pedido_pkey" PRIMARY KEY ("sede_id","fecha_operacion","tipo")
);

-- CreateTable
CREATE TABLE "turnos" (
    "id" UUID NOT NULL,
    "sede_id" INTEGER NOT NULL,
    "usuario_id" UUID NOT NULL,
    "puesto" "PuestoTurno" NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3) NOT NULL,
    "estado" "EstadoTurno" NOT NULL DEFAULT 'PROGRAMADO',
    "entrada_real" TIMESTAMPTZ(3),
    "salida_real" TIMESTAMPTZ(3),
    "notas" VARCHAR(200),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "turnos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mesas" (
    "id" SERIAL NOT NULL,
    "sede_id" INTEGER NOT NULL,
    "codigo" VARCHAR(10) NOT NULL,
    "capacidad" INTEGER NOT NULL,
    "zona" VARCHAR(40) NOT NULL,
    "forma" "FormaMesa" NOT NULL,
    "pos_x" INTEGER NOT NULL,
    "pos_y" INTEGER NOT NULL,
    "ancho" INTEGER NOT NULL,
    "alto" INTEGER NOT NULL,
    "rotacion" INTEGER NOT NULL DEFAULT 0,
    "estado" "EstadoMesa" NOT NULL DEFAULT 'LIBRE',
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "mesas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservas" (
    "id" UUID NOT NULL,
    "sede_id" INTEGER NOT NULL,
    "cliente_id" UUID NOT NULL,
    "mesa_id" INTEGER,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "duracion_min" INTEGER NOT NULL,
    "personas" INTEGER NOT NULL,
    "estado" "EstadoReserva" NOT NULL DEFAULT 'PENDIENTE',
    "codigo_confirmacion" VARCHAR(10) NOT NULL,
    "notas" VARCHAR(300),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelada_en" TIMESTAMPTZ(3),

    CONSTRAINT "reservas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entradas_espera" (
    "id" UUID NOT NULL,
    "sede_id" INTEGER NOT NULL,
    "cliente_id" UUID,
    "nombre" VARCHAR(80) NOT NULL,
    "telefono" VARCHAR(20) NOT NULL,
    "personas" INTEGER NOT NULL,
    "fecha_operacion" DATE NOT NULL,
    "numero_turno" INTEGER NOT NULL,
    "estado" "EstadoEspera" NOT NULL DEFAULT 'ESPERANDO',
    "mesa_id" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notificado_en" TIMESTAMPTZ(3),
    "sentado_en" TIMESTAMPTZ(3),

    CONSTRAINT "entradas_espera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesiones_mesa" (
    "id" UUID NOT NULL,
    "mesa_id" INTEGER NOT NULL,
    "origen" "OrigenSesion" NOT NULL,
    "reserva_id" UUID,
    "entrada_espera_id" UUID,
    "personas" INTEGER NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3),

    CONSTRAINT "sesiones_mesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" UUID NOT NULL,
    "cliente_id" UUID,
    "destino" VARCHAR(160) NOT NULL,
    "canal" "CanalNotificacion" NOT NULL,
    "tipo" "TipoNotificacion" NOT NULL,
    "reserva_id" UUID,
    "entrada_espera_id" UUID,
    "estado" "EstadoNotificacion" NOT NULL DEFAULT 'PENDIENTE',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviada_en" TIMESTAMPTZ(3),

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calificaciones" (
    "id" UUID NOT NULL,
    "sede_id" INTEGER NOT NULL,
    "cliente_id" UUID,
    "pedido_id" UUID,
    "reserva_id" UUID,
    "puntaje" SMALLINT NOT NULL,
    "comentario" VARCHAR(500),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "paises_codigo_iso_key" ON "paises"("codigo_iso");

-- CreateIndex
CREATE UNIQUE INDEX "ciudades_pais_id_nombre_key" ON "ciudades"("pais_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "sedes_codigo_key" ON "sedes"("codigo");

-- CreateIndex
CREATE INDEX "sedes_ciudad_id_idx" ON "sedes"("ciudad_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_sede_id_rol_idx" ON "usuarios"("sede_id", "rol");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_email_key" ON "clientes"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_usuario_id_idx" ON "refresh_tokens"("usuario_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_cliente_id_idx" ON "refresh_tokens"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "dispositivos_token_hash_key" ON "dispositivos"("token_hash");

-- CreateIndex
CREATE INDEX "dispositivos_sede_id_idx" ON "dispositivos"("sede_id");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nombre_key" ON "categorias"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "productos_sku_key" ON "productos"("sku");

-- CreateIndex
CREATE INDEX "productos_categoria_id_idx" ON "productos"("categoria_id");

-- CreateIndex
CREATE INDEX "productos_sede_producto_id_idx" ON "productos_sede"("producto_id");

-- CreateIndex
CREATE INDEX "pedidos_sede_id_creado_en_idx" ON "pedidos"("sede_id", "creado_en");

-- CreateIndex
CREATE INDEX "pedidos_estado_sede_id_idx" ON "pedidos"("estado", "sede_id");

-- CreateIndex
CREATE INDEX "pedidos_creado_en_idx" ON "pedidos"("creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_sede_id_fecha_operacion_numero_dia_key" ON "pedidos"("sede_id", "fecha_operacion", "numero_dia");

-- CreateIndex
CREATE INDEX "pedido_items_pedido_id_idx" ON "pedido_items"("pedido_id");

-- CreateIndex
CREATE INDEX "pedido_items_producto_id_idx" ON "pedido_items"("producto_id");

-- CreateIndex
CREATE INDEX "pedido_estado_historial_pedido_id_registrado_en_idx" ON "pedido_estado_historial"("pedido_id", "registrado_en");

-- CreateIndex
CREATE INDEX "turnos_sede_id_inicio_idx" ON "turnos"("sede_id", "inicio");

-- CreateIndex
CREATE INDEX "turnos_usuario_id_inicio_idx" ON "turnos"("usuario_id", "inicio");

-- CreateIndex
CREATE INDEX "mesas_sede_id_estado_idx" ON "mesas"("sede_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "mesas_sede_id_codigo_key" ON "mesas"("sede_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "reservas_codigo_confirmacion_key" ON "reservas"("codigo_confirmacion");

-- CreateIndex
CREATE INDEX "reservas_sede_id_inicio_idx" ON "reservas"("sede_id", "inicio");

-- CreateIndex
CREATE INDEX "reservas_mesa_id_inicio_idx" ON "reservas"("mesa_id", "inicio");

-- CreateIndex
CREATE INDEX "reservas_cliente_id_inicio_idx" ON "reservas"("cliente_id", "inicio");

-- CreateIndex
CREATE INDEX "entradas_espera_sede_id_estado_idx" ON "entradas_espera"("sede_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "entradas_espera_sede_id_fecha_operacion_numero_turno_key" ON "entradas_espera"("sede_id", "fecha_operacion", "numero_turno");

-- CreateIndex
CREATE INDEX "sesiones_mesa_mesa_id_inicio_idx" ON "sesiones_mesa"("mesa_id", "inicio");

-- CreateIndex
CREATE INDEX "sesiones_mesa_inicio_idx" ON "sesiones_mesa"("inicio");

-- CreateIndex
CREATE INDEX "notificaciones_cliente_id_creado_en_idx" ON "notificaciones"("cliente_id", "creado_en");

-- CreateIndex
CREATE INDEX "notificaciones_estado_idx" ON "notificaciones"("estado");

-- CreateIndex
CREATE INDEX "calificaciones_sede_id_creado_en_idx" ON "calificaciones"("sede_id", "creado_en");

-- AddForeignKey
ALTER TABLE "ciudades" ADD CONSTRAINT "ciudades_pais_id_fkey" FOREIGN KEY ("pais_id") REFERENCES "paises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sedes" ADD CONSTRAINT "sedes_ciudad_id_fkey" FOREIGN KEY ("ciudad_id") REFERENCES "ciudades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_pais_id_fkey" FOREIGN KEY ("pais_id") REFERENCES "paises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos_sede" ADD CONSTRAINT "productos_sede_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos_sede" ADD CONSTRAINT "productos_sede_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cajero_id_fkey" FOREIGN KEY ("cajero_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_items" ADD CONSTRAINT "pedido_items_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_items" ADD CONSTRAINT "pedido_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_estado_historial" ADD CONSTRAINT "pedido_estado_historial_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_estado_historial" ADD CONSTRAINT "pedido_estado_historial_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secuencias_pedido" ADD CONSTRAINT "secuencias_pedido_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mesas" ADD CONSTRAINT "mesas_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas_espera" ADD CONSTRAINT "entradas_espera_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas_espera" ADD CONSTRAINT "entradas_espera_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entradas_espera" ADD CONSTRAINT "entradas_espera_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones_mesa" ADD CONSTRAINT "sesiones_mesa_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones_mesa" ADD CONSTRAINT "sesiones_mesa_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reservas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones_mesa" ADD CONSTRAINT "sesiones_mesa_entrada_espera_id_fkey" FOREIGN KEY ("entrada_espera_id") REFERENCES "entradas_espera"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reservas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_entrada_espera_id_fkey" FOREIGN KEY ("entrada_espera_id") REFERENCES "entradas_espera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calificaciones" ADD CONSTRAINT "calificaciones_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calificaciones" ADD CONSTRAINT "calificaciones_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calificaciones" ADD CONSTRAINT "calificaciones_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calificaciones" ADD CONSTRAINT "calificaciones_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reservas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────
-- Reglas de negocio a nivel de BD (Prisma no las representa en el schema,
-- pero las respeta: no generan drift en migraciones futuras).
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE "paises" ADD CONSTRAINT "paises_tasas_check"
  CHECK ("tasa_usd" > 0 AND "tasa_impuesto" >= 0 AND "tasa_impuesto" < 1);

-- El alcance del usuario depende de su rol
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_alcance_rol_check" CHECK (
  ("rol" = 'ADMIN_GLOBAL' AND "pais_id" IS NULL AND "sede_id" IS NULL) OR
  ("rol" = 'GERENTE_PAIS' AND "pais_id" IS NOT NULL AND "sede_id" IS NULL) OR
  ("rol" IN ('GERENTE_SEDE', 'CAJERO', 'COCINA') AND "sede_id" IS NOT NULL)
);

-- Un refresh token pertenece a un usuario o a un cliente, nunca a ambos
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_dueno_check"
  CHECK (num_nonnulls("usuario_id", "cliente_id") = 1);

ALTER TABLE "productos_sede" ADD CONSTRAINT "productos_sede_precio_check" CHECK ("precio" >= 0);

ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_montos_check"
  CHECK ("numero_dia" > 0 AND "subtotal" >= 0 AND "impuestos" >= 0 AND "total" >= 0 AND "total_usd" >= 0);

ALTER TABLE "pedido_items" ADD CONSTRAINT "pedido_items_cantidad_check"
  CHECK ("cantidad" > 0 AND "precio_unitario" >= 0 AND "subtotal" >= 0);

ALTER TABLE "secuencias_pedido" ADD CONSTRAINT "secuencias_pedido_ultimo_numero_check" CHECK ("ultimo_numero" >= 0);

ALTER TABLE "turnos" ADD CONSTRAINT "turnos_rango_check" CHECK ("fin" > "inicio");

ALTER TABLE "mesas" ADD CONSTRAINT "mesas_dimensiones_check"
  CHECK ("capacidad" > 0 AND "ancho" > 0 AND "alto" > 0);

ALTER TABLE "reservas" ADD CONSTRAINT "reservas_valores_check" CHECK ("personas" > 0 AND "duracion_min" > 0);

ALTER TABLE "entradas_espera" ADD CONSTRAINT "entradas_espera_personas_check"
  CHECK ("personas" > 0 AND "numero_turno" > 0);

ALTER TABLE "sesiones_mesa" ADD CONSTRAINT "sesiones_mesa_rango_check"
  CHECK ("personas" > 0 AND ("fin" IS NULL OR "fin" > "inicio"));

ALTER TABLE "calificaciones" ADD CONSTRAINT "calificaciones_puntaje_check" CHECK ("puntaje" BETWEEN 1 AND 5);
