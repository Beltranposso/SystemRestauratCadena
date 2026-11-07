-- Las rutas /img/productos/*.webp del seed nunca tuvieron archivo detrás: se limpian para que
-- el kiosco muestre el ícono de la categoría hasta que el admin suba la foto real.
UPDATE "productos" SET "imagen_url" = NULL WHERE "imagen_url" LIKE '/img/productos/%';
