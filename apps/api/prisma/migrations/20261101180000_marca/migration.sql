-- CreateTable
CREATE TABLE "marca" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "nombre" VARCHAR(40) NOT NULL DEFAULT 'Fogón',
    "logo" TEXT,
    "color_primario" CHAR(7) NOT NULL DEFAULT '#D62828',
    "color_acento" CHAR(7) NOT NULL DEFAULT '#FFB703',
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_por" UUID,

    CONSTRAINT "marca_pkey" PRIMARY KEY ("id")
);

-- Una sola fila, colores en formato #RRGGBB y logo como imagen en data URL
ALTER TABLE "marca" ADD CONSTRAINT "marca_check" CHECK (
  "id" = 1
  AND "color_primario" ~ '^#[0-9A-Fa-f]{6}$'
  AND "color_acento" ~ '^#[0-9A-Fa-f]{6}$'
  AND ("logo" IS NULL OR ("logo" ~ '^data:image/(png|jpeg|webp);base64,' AND length("logo") <= 120000))
);

INSERT INTO "marca" ("id") VALUES (1);
