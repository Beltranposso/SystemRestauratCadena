-- CreateEnum
CREATE TYPE "TipoPromocion" AS ENUM ('PORCENTAJE', 'PRECIO_FIJO', 'LLEVA_PAGA');

-- AlterTable: cupos de dispositivos por sede
ALTER TABLE "sedes" ADD COLUMN     "cupo_kioscos" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "cupo_pantallas" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "dispositivos" ADD COLUMN     "ultima_conexion_en" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "es_combo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "pedido_items" ADD COLUMN     "componentes" JSONB,
ADD COLUMN     "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "promocion_id" INTEGER,
ADD COLUMN     "promocion_nombre" VARCHAR(80);

-- CreateTable
CREATE TABLE "combo_componentes" (
    "combo_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "combo_componentes_pkey" PRIMARY KEY ("combo_id","producto_id")
);

-- CreateTable
CREATE TABLE "promociones" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "descripcion" VARCHAR(200) NOT NULL DEFAULT '',
    "tipo" "TipoPromocion" NOT NULL,
    "producto_id" INTEGER,
    "categoria_id" INTEGER,
    "porcentaje" DECIMAL(5,2),
    "precio_especial" DECIMAL(12,2),
    "lleva_n" INTEGER,
    "paga_m" INTEGER,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE,
    "dias_semana" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "hora_inicio" VARCHAR(5),
    "hora_fin" VARCHAR(5),
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promociones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promociones_sede" (
    "promocion_id" INTEGER NOT NULL,
    "sede_id" INTEGER NOT NULL,

    CONSTRAINT "promociones_sede_pkey" PRIMARY KEY ("promocion_id","sede_id")
);

-- CreateIndex
CREATE INDEX "combo_componentes_producto_id_idx" ON "combo_componentes"("producto_id");

-- CreateIndex
CREATE INDEX "promociones_sede_sede_id_idx" ON "promociones_sede"("sede_id");

-- AddForeignKey
ALTER TABLE "combo_componentes" ADD CONSTRAINT "combo_componentes_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_componentes" ADD CONSTRAINT "combo_componentes_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promociones" ADD CONSTRAINT "promociones_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promociones" ADD CONSTRAINT "promociones_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promociones_sede" ADD CONSTRAINT "promociones_sede_promocion_id_fkey" FOREIGN KEY ("promocion_id") REFERENCES "promociones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promociones_sede" ADD CONSTRAINT "promociones_sede_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_items" ADD CONSTRAINT "pedido_items_promocion_id_fkey" FOREIGN KEY ("promocion_id") REFERENCES "promociones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───────────── Reglas de negocio (CHECK) ─────────────

ALTER TABLE "sedes" ADD CONSTRAINT "sedes_cupos_check"
  CHECK ("cupo_kioscos" BETWEEN 0 AND 50 AND "cupo_pantallas" BETWEEN 0 AND 50);

ALTER TABLE "combo_componentes" ADD CONSTRAINT "combo_componentes_check"
  CHECK ("cantidad" BETWEEN 1 AND 20 AND "combo_id" <> "producto_id");

ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_descuento_check" CHECK ("descuento" >= 0);
ALTER TABLE "pedido_items" ADD CONSTRAINT "pedido_items_descuento_check" CHECK ("descuento" >= 0);

-- Cada tipo de promoción exige sus campos y nada más
ALTER TABLE "promociones" ADD CONSTRAINT "promociones_tipo_check" CHECK (
  ("tipo" = 'PORCENTAJE' AND "porcentaje" > 0 AND "porcentaje" <= 100
     AND ("producto_id" IS NULL) <> ("categoria_id" IS NULL)
     AND "precio_especial" IS NULL AND "lleva_n" IS NULL AND "paga_m" IS NULL)
  OR ("tipo" = 'PRECIO_FIJO' AND "precio_especial" >= 0 AND "producto_id" IS NOT NULL
     AND "categoria_id" IS NULL AND "porcentaje" IS NULL AND "lleva_n" IS NULL AND "paga_m" IS NULL)
  OR ("tipo" = 'LLEVA_PAGA' AND "producto_id" IS NOT NULL AND "categoria_id" IS NULL
     AND "lleva_n" BETWEEN 2 AND 10 AND "paga_m" >= 1 AND "paga_m" < "lleva_n"
     AND "porcentaje" IS NULL AND "precio_especial" IS NULL)
);

ALTER TABLE "promociones" ADD CONSTRAINT "promociones_vigencia_check" CHECK (
  ("fecha_fin" IS NULL OR "fecha_fin" >= "fecha_inicio")
  AND "dias_semana" <@ ARRAY[0,1,2,3,4,5,6]
  AND (("hora_inicio" IS NULL) = ("hora_fin" IS NULL))
  AND ("hora_inicio" IS NULL OR ("hora_inicio" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       AND "hora_fin" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "hora_inicio" < "hora_fin"))
);
