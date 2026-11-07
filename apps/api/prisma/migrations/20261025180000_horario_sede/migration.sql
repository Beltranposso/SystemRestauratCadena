-- AlterTable
ALTER TABLE "sedes" ADD COLUMN     "hora_apertura" VARCHAR(5) NOT NULL DEFAULT '12:00',
ADD COLUMN     "hora_cierre" VARCHAR(5) NOT NULL DEFAULT '22:30';

-- Formato HH:mm y apertura antes del cierre
ALTER TABLE "sedes" ADD CONSTRAINT "sedes_horario_check" CHECK (
  "hora_apertura" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND
  "hora_cierre" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND
  "hora_apertura" < "hora_cierre"
);
