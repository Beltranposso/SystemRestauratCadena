-- CreateTable
CREATE TABLE "configuracion" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "reservas_habilitadas" BOOLEAN NOT NULL DEFAULT false,
    "salir_fila_habilitado" BOOLEAN NOT NULL DEFAULT true,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_por" UUID,

    CONSTRAINT "configuracion_pkey" PRIMARY KEY ("id")
);

-- Una sola fila
ALTER TABLE "configuracion" ADD CONSTRAINT "configuracion_unica_check" CHECK ("id" = 1);

-- Cadena de comida rápida por defecto: sin reservas de mesa, el cliente puede salir de la fila
INSERT INTO "configuracion" ("id") VALUES (1);
