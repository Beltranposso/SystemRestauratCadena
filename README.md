# Sistema Multi-Sede de Restaurantes

Plataforma para cadenas de restaurantes con presencia en varios países: menús por sede, pedidos en tiempo real, turnos del personal, mesas, reservas y cola de espera, con un dashboard centralizado.

**Estado:** Fases 1 a 4 completas, más menú por sede con combos y promociones, control de pantallas y kioscos por cupos, apariencia configurable (logo y colores) y funciones activables (reservas de mesa, salida de la fila).

## Requisitos

- Node.js 22.12 o superior (lo exigen Vitest 5 y ESLint 10)
- Docker (para PostgreSQL 16) — o un PostgreSQL 16 propio

## Puesta en marcha

```bash
npm install                                  # instala todo y genera el cliente de Prisma
cp apps/api/.env.example apps/api/.env       # en Windows: copy apps\api\.env.example apps\api\.env
npm run db:up                                # PostgreSQL en :5432 y Adminer en :8080
npm run db:migrate                           # aplica las migraciones
npm run db:seed                              # ~80 s: 8 sedes, 90 días de pedidos, reservas…
npm run dev                                  # API en :4000 y web en http://localhost:5173
```

Comprueba que todo responde: <http://localhost:4000/api/health> (fuera de producción muestra el conteo de datos).

**Documentación interactiva:** <http://localhost:4000/api/docs> (Swagger UI, generada desde el código). Para probar rutas protegidas: haz login en `POST /api/auth/login`, copia el `accessToken` y pégalo en **Authorize**.

> Si `db:migrate` pide un nombre para una migración nueva, es que el schema cambió después de la migración inicial: escribe un nombre corto (p. ej. `agrega_campo_x`).

## Cuentas de prueba

Contraseña de todas: `Demo1234!`

| Rol | Email | Alcance |
| --- | --- | --- |
| Admin global | `admin@restaurantes.demo` | Toda la cadena |
| Gerente de país | `gerente.co@restaurantes.demo` (también `.mx`, `.pe`) | Su país |
| Gerente de sede | `gerente.ctg01@restaurantes.demo` | CTG-01 |
| Cajero | `cajero1.ctg01@restaurantes.demo` (1 a 3) | CTG-01 |
| Cocina | `cocina1.ctg01@restaurantes.demo` (1 a 3) | CTG-01 |
| Cliente | `cliente@restaurantes.demo` | Portal (3 visitas pasadas y 2 reservas próximas en CTG-01). Para ver las reservas, actívalas en Configuración |

Cada sede tiene el mismo patrón: `gerente.bog01@…`, `cajero2.cdmx01@…`, etc.

**Tokens de dispositivo (solo demo):** `pantalla-ctg-01-demo`, `kiosco-ctg-01-demo`, `kiosco2-ctg-01-demo` y el mismo patrón para las demás sedes (p. ej. `kiosco-baq-01-demo` para Barranquilla). En la BD solo se guarda su hash SHA-256.

## Aplicación web (Fases 3 y 4)

Abre <http://localhost:5173>: la página de inicio enlaza cada pantalla.

| Pantalla | Ruta | Quién entra |
| --- | --- | --- |
| Dashboard: ventas, ocupación y servicio, mesas y fila, turnos, menú | `/admin` | Admin global y gerentes |
| Caja | `/caja` | Cajero (y gerentes, eligiendo sede) |
| Cocina | `/cocina` | Cocina (y gerentes) |
| Pantalla de pedidos (TV) | `/pantalla` | Token de dispositivo `pantalla-ctg-01-demo` |
| Kiosco de autoservicio | `/kiosco` | Token de dispositivo `kiosco-ctg-01-demo` |
| Portal: reservar, mis reservas | `/portal` | Público; reservar pide cuenta de cliente |
| Fila de espera desde el celular | `/portal/fila/{sedeId}` | Público (pensado para un QR en la entrada) |

Para vincular una pantalla o un kiosco abre `/dispositivo?token=<token>` una vez en ese equipo; el token queda guardado.

**Prueba de punta a punta:** abre la caja y la cocina en dos pestañas y la pantalla en una tercera. Un pedido cobrado en caja aparece en cocina en menos de un segundo; al marcarlo listo, la pantalla lo muestra en dorado con un aviso sonoro y la caja lo ofrece para entregar.

Capturas de cada pantalla en `docs/capturas/`.

**Diseño:** marca de demostración "Fogón"; el admin global la cambia en Apariencia. Paleta roja, dorada y neutros cálidos según la hoja de ruta; Archivo condensada para números de pedido y cifras, Figtree para el texto. Las fuentes se sirven con la app para que el kiosco y la pantalla funcionen sin salida a internet. Las comandas de cocina, la caja y las reservas usan el borde dentado del ticket de impresora como sello visual.

## Menú por sede, combos, promociones y cupos de equipos

**Menú por sede.** Cada sede tiene su propio menú: qué productos ofrece, a qué precio y si están disponibles. En el seed, Cartagena vende el *Combo Costeño* y Barranquilla (BAQ-01) el *Combo Carnaval*; cada una tiene promociones distintas.

**Combos (contenido fijo).** Un combo es un producto que lleva otros productos (p. ej. hamburguesa + papas + gaseosa).

- Solo el **admin global** los crea y decide en qué sedes se venden y a qué precio.
- El gerente de sede puede marcarlos agotados.
- Si se agota un componente en una sede, el combo se oculta ahí hasta que vuelva.
- Cocina ve el contenido del combo en la comanda.
- El kiosco muestra cuánto ahorra el cliente frente a comprar los productos por separado.

**Promociones.** Solo el admin global las crea y elige las sedes. Hay tres tipos:

| Tipo | Ejemplo | Aplica a |
| --- | --- | --- |
| `PORCENTAJE` | 20 % en bebidas | Un producto o una categoría |
| `PRECIO_FIJO` | Combo Clásico a $26.700 | Un producto o combo, en sedes de una misma moneda |
| `LLEVA_PAGA` | 2x1, 3x2 | Un producto o combo |

- Tienen vigencia (desde/hasta), días de la semana y franja horaria, en hora local de cada sede.
- No se acumulan: por producto gana la que más descuenta.
- La regla de precio vive en `packages/shared/src/promociones.ts`: el kiosco muestra exactamente lo que el servidor cobra.
- Cada ítem del pedido guarda el descuento y el nombre de la promoción aplicada.

**Pantallas y kioscos por cupos.**

- El **gerente de país** (o el admin) fija por sede cuántos kioscos y pantallas puede tener activos. En el seed, CTG-01 tiene 3 kioscos y 2 pantallas; las demás, 2 y 1.
- El **gerente de sede** vincula equipos dentro de ese cupo: al crearlo ve un enlace y un QR que se abren una vez en el equipo.
- Si el cupo está lleno, la API responde `422 CUPO_AGOTADO`.
- Desactivar un equipo libera su cupo y lo desconecta al instante: el equipo vuelve a la pantalla de vincular.
- El dashboard muestra qué equipos están en línea ahora y cuándo se usaron por última vez.
- Un bloqueo por sede en la BD garantiza que altas simultáneas nunca superen el cupo.

| Pantalla nueva | Ruta |
| --- | --- |
| Combos | `/admin/combos` |
| Promociones | `/admin/promociones` |
| Pantallas y kioscos | `/admin/equipos` |

| Rutas nuevas de la API | |
| --- | --- |
| Combos | `GET/POST /combos`, `PATCH /combos/{id}` |
| Promociones | `GET/POST /promociones`, `PATCH/DELETE /promociones/{id}`, `GET /sedes/{id}/promociones/vigentes` (público) |
| Cupos y equipos | `GET /dispositivos/cupos`, `PUT /sedes/{id}/cupos`, `GET/POST /sedes/{id}/dispositivos`, `PATCH/DELETE /dispositivos/{id}`, `POST /dispositivos/{id}/token` |

`GET /menu?sedeId=` ahora incluye combos (con su contenido y precio por separado), la promoción destacada de cada producto y las reglas vigentes. Los kioscos y la caja recargan el menú en vivo (evento `menu:actualizado`) cuando el admin cambia precios o promociones.

## Fotos de productos y combos

El **admin global** sube la foto desde **Menú** o **Combos**: hace clic en la miniatura del producto o arrastra la imagen encima. El navegador la recorta cuadrada y la reduce a 600 px en WebP (unos 5 a 40 KB) antes de subirla.

- **Sin foto:** se muestra el ícono de la categoría.
- **Dónde aparece:** en el kiosco y la caja, con la insignia de la promoción encima.
- **Dónde se guarda:** en `apps/api/uploads/` (variable `UPLOADS_DIR`), servida en `/uploads/...`. El nombre de cada archivo lleva una huella de su contenido, así que el navegador la guarda en caché un año y al reemplazarla se descarga la nueva.
- **Validación:** la API revisa la firma del archivo, no solo el tipo declarado (WebP, PNG o JPG; máximo 2 MB) y borra la foto anterior al reemplazarla.
- **Rutas:** `PUT /productos/{id}/imagen` (cuerpo binario) y `DELETE /productos/{id}/imagen`, solo para el admin global.

La carpeta `uploads/` no va al repositorio. Para producción con varios servidores, cambia `guardarImagen` y `borrarImagen` (`src/utils/imagenes.ts`) por S3 o Cloudinary: el resto del sistema solo guarda la URL.

## Configuración: reservas de mesa y salida de la fila

En `/admin/configuracion` (solo **admin global**) se activan o desactivan dos funciones para toda la cadena. Los cambios llegan en vivo (`configuracion:actualizada`) al portal, a los celulares en la fila y a las pantallas del personal.

| Ajuste | Por defecto | Apagado |
| --- | --- | --- |
| **Reservas de mesa** | Apagado (comida rápida) | El portal se centra en la fila y no muestra «Reservar» ni «Mis reservas»; las rutas de reserva muestran un aviso. La API responde `403 RESERVAS_DESHABILITADAS` a disponibilidad, reservas nuevas y cambios. Las reservas ya hechas se conservan: el cliente aún puede cancelarlas por la API y el personal las sigue viendo en Mesas mientras queden pendientes de hoy |
| **«Ya no voy a esperar»** | Encendido | El botón no aparece en el turno; `POST /espera/{id}/salir` responde `403 SALIR_FILA_DESHABILITADO` y el personal marca la salida con `/abandono` |

**Comprobante de reserva.** Al reservar (y desde «Mis reservas» → «Ver comprobante») el cliente ve:

- un QR y el número de reserva;
- la sede, el día, la hora, las personas y la mesa.

El QR contiene el número. En la entrada, el personal lo escanea con un lector (o lo digita) en Mesas → Reservas de hoy, y la reserva aparece lista para sentar.

Rutas: `GET /configuracion` (público) y `PUT /configuracion` (admin global).

## Apariencia: logo y colores de la cadena

En `/admin/apariencia` (solo **admin global**) se cambian el nombre, el logo y dos colores. Se aplican en toda la app, también en los kioscos y pantallas, que se repintan al instante por Socket.IO (`marca:actualizada`):

| Color | Dónde se usa | Contraste exigido |
| --- | --- | --- |
| **Principal** | Botones, barra del kiosco, columna "Listo" | Texto blanco encima |
| **Acento** | Promociones, insignias, número listo | Texto oscuro encima |

Al subir el logo:

1. Se reduce en el navegador a 320 px (WebP) y se guarda en la tabla `marca`, de una sola fila.
2. Se leen sus colores dominantes, ignorando fondo blanco, negro, grises, transparencia y bordes suavizados.
3. Se proponen combinaciones: del logo, análoga, complementaria y monocromática.

Todas las sugerencias cumplen WCAG AA (4.5:1). Si el color del logo no alcanza, se oscurece o aclara lo justo. Al elegir un color a mano, la página muestra el contraste y ofrece corregirlo. La API rechaza combinaciones por debajo de 3:1 (`422`).

- Lógica de color (contraste, sugerencias): `packages/shared/src/colores.ts`.
- Rutas: `GET /marca` (público), `PUT /marca`, `DELETE /marca` (restablecer).
- Los colores de Tailwind (`brand.red`, `brand.gold`…) leen variables CSS (`--marca-primario`, `--marca-acento`…).

## API (Fase 2)

Tres formas de autenticarse:

| Quién | Cómo | Notas |
| --- | --- | --- |
| Personal | `POST /api/auth/login` → `Authorization: Bearer <accessToken>` | Access token de 15 min; refresh rotativo en cookie httpOnly (`POST /api/auth/refresh`). Reusar una cookie vieja cierra todas las sesiones |
| Clientes del portal | `POST /api/clientes/auth/registro` o `/login` → Bearer | Cuentas separadas del personal |
| Pantallas y kioscos | Cabecera `X-Device-Token` | Los tokens se generan en `POST /api/sedes/{id}/dispositivos` (dentro del cupo de la sede) y solo se muestran una vez |

**Alcance:** el admin global ve todo; el gerente de país, las sedes de su país; el resto, solo su sede. Pedir datos de otra sede responde 403. Se aplica en el servidor, nunca en el frontend.

| Módulo | Rutas principales |
| --- | --- |
| Sedes y geografía | `/paises`, `/ciudades`, `/sedes`, `/sedes/publicas`, `/sedes/{id}/dispositivos` |
| Usuarios | `/usuarios`, `/sedes/{id}/personal` |
| Menú | `GET /menu?sedeId=` (público), `/sedes/{id}/productos`, `PUT /paises/{id}/precios`, `/productos`, `/categorias` |
| Pedidos | `POST /pedidos` (caja o kiosco), `PATCH /pedidos/{id}/estado`, `/sedes/{id}/pedidos/activos`, `/pantalla/{id}/pedidos` |
| Turnos | `/turnos` (semana por sede, horas por persona), `/turnos/{id}/entrada`, `/turnos/{id}/salida` |
| Mesas | `/sedes/{id}/mesas` (panel), `PUT /sedes/{id}/plano`, `PATCH /mesas/{id}/estado` |
| Reservas | `/sedes/{id}/disponibilidad`, `POST /reservas`, `/clientes/me/reservas`, `/reservas/{id}/sentar`, `/notificar-mesa-lista`, `/no-show`, `/cancelar` |
| Cola de espera | `POST /sedes/{id}/espera` (público), `GET /espera/{id}`, `/espera/{id}/notificar`, `/sentar`, `/salir` |
| Calificaciones | `POST /calificaciones` (por reserva o por pedido) |
| Reportes | `/reportes/kpis`, `/reportes/ventas?agrupar=…`, `/reportes/ocupacion`, `/reportes/calificaciones` |

Todas las rutas con sus parámetros, roles y ejemplos de cuerpo están en `/api/docs`.

**Tiempo real (Socket.IO, mismo puerto):**

```js
const socket = io('http://localhost:4000', { auth: { token } });          // o { deviceToken }
socket.emit('sede:unirse', { sedeId: 1, canal: 'cocina' }, console.log);  // cocina | caja | salon | pantalla
socket.on('pedido:creado', (pedido) => { /* … */ });
socket.on('pedido:actualizado', (pedido) => { /* … */ });
// Comensal sin cuenta siguiendo su turno:
socket.emit('espera:unirse', { entradaId }, console.log);
socket.on('notificacion', (n) => { /* MESA_LISTA */ });
```

Los nombres de salas y eventos están en `packages/shared/src/eventos.ts`.

**Correos:** en desarrollo se registran en el log de la API (no se envían). Se conectará SMTP en la Fase 5.

## Datos del seed

| Qué | Cantidad aproximada |
| --- | --- |
| Países / ciudades / sedes | 3 / 7 / 9 (CO, MX, PE) |
| Combos / promociones | 6 (dos solo de Cartagena o Barranquilla) / 6 |
| Productos | 29 globales + regionales (arepa en CO, tacos en MX, salchipapa en PE) |
| Personal | 1 admin, 3 gerentes de país y 7 personas por sede |
| Clientes | 81 |
| Pedidos | ~61 000 en 90 días, con picos de almuerzo y cena, y crecimiento leve |
| Turnos | ~840 (2 semanas atrás y 1 adelante) |
| Mesas | 11 a 15 por sede, con posición en el plano |
| Reservas / sesiones de mesa | ~9 600 / ~19 000 (30 días atrás y 14 adelante) |

El seed usa una semilla fija (`SEED_SEMILLA`), así que genera siempre la misma estructura; las fechas se calculan desde el momento en que se ejecuta. Para un seed más rápido: `SEED_DIAS_PEDIDOS=30 npm run db:seed`.

## Despliegue en Vercel

El repo se despliega como **un solo proyecto de Vercel con dos services** (`vercel.json` en la raíz):

| Service | Carpeta | Rutas públicas |
| --- | --- | --- |
| `api` (Express) | `apps/api` | `/api/*` y `/socket.io/*` |
| `web` (Vite) | `apps/web` | Todo lo demás (con fallback a `index.html` para React Router) |

Web y API comparten dominio, así que no hace falta CORS ni `VITE_API_URL`. No hay bindings: ningún servidor llama a otro, el navegador llama a `/api`.

**Antes del primer deploy:**

1. **PostgreSQL en la nube** (Neon, Supabase…). Aplica las migraciones y, si quieres datos de demo, el seed, desde tu equipo:
   ```bash
   cd apps/api
   DATABASE_URL="postgresql://…" npx prisma migrate deploy
   DATABASE_URL="postgresql://…" npm run seed   # opcional
   ```
2. **Redis** (Upstash desde el Marketplace de Vercel). Cada conexión de Socket.IO queda fija a una instancia; con Redis, un pedido cobrado en una instancia llega a la cocina conectada a otra.
3. **Vercel Blob** (Storage → Blob → conectar al proyecto). Vercel no guarda archivos en disco, así que las fotos de productos se suben a Blob.
4. **Variables de entorno** del proyecto: `NODE_ENV=production`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN` (la URL del proyecto, p. ej. `https://tu-proyecto.vercel.app`), `REDIS_URL` (la URL `rediss://…` de tu base de Upstash; si la integración la creó con otro nombre, cópiala a `REDIS_URL`) y `BLOB_READ_WRITE_TOKEN` (la crea Vercel al conectar Blob).

Sin `REDIS_URL` ni `BLOB_READ_WRITE_TOKEN` todo funciona como antes en local (eventos en memoria y fotos en `UPLOADS_DIR`). Para probar los dos services juntos en local: `vercel dev`.

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | API y web con recarga automática (`dev:api` y `dev:web` por separado) |
| `npm run db:migrate` | Aplica migraciones (crea una nueva si cambiaste el schema) |
| `npm run db:seed` | Borra todo y vuelve a sembrar |
| `npm run db:reset` | Borra la BD, reaplica migraciones y corre el seed |
| `npm run db:studio` | Abre Prisma Studio |
| `npm test` | 130 pruebas (unitarias + integración contra la BD del `.env`; crean y borran sus propios datos) |
| `npm run typecheck` | Verificación de tipos |
| `npm run lint` | ESLint |
| `npm run build` | Compila la API (`apps/api/dist`) y la web (`apps/web/dist`) |

## Estructura

```
apps/api/
  prisma/
    schema.prisma          26 tablas, 18 enums
    migrations/            migración inicial, horario de sede, combos/promociones/cupos y reglas CHECK
    seed/                  datos.ts (referencia), base.ts, pedidos.ts, salon.ts
  src/
    auth/                  JWT, refresh rotativo, dispositivos, alcance por país/sede
    http/                  definición de rutas (valida + documenta) y generador OpenAPI
    modules/               auth, geografia, usuarios, menu, pedidos, turnos,
                           salon (mesas, reservas, espera), calificaciones, reportes
    realtime/              Socket.IO con autenticación y salas por sede
    config/ db/ utils/     env, logger, Prisma, consecutivos, fechas, dinero, correo
  tests/
apps/web/
  src/
    app/                   rutas y guardias (personal, dispositivo)
    lib/                   sesiones con renovación automática, Socket.IO, formato, tipos
    components/            UI base, filtros, gráficas, mapa del salón, toma de pedidos
    pages/admin/           dashboard, ocupación y servicio, mesas, turnos, menú
    pages/operacion/       caja, kiosco, cocina, pantalla
    pages/portal/          sedes, reservar, confirmación, mis reservas, fila, mi turno
packages/shared/           enums, máquinas de estado y eventos (API + web)
```

## Seguridad de dependencias

`npm audit` debe dar **0 vulnerabilidades**. Dos paquetes indirectos se fuerzan a versiones corregidas con `overrides` en el `package.json` raíz:

- `deepmerge-ts` y `effect` dentro de `@prisma/config`: Prisma 6 aún trae versiones afectadas, y la corrección oficial exige Prisma 7, que rompe la compatibilidad.
- `minimatch`: ESLint aún trae versiones afectadas.

La API usa **Zod 4**. Las rutas PATCH validan con `parcial()` (en `http/esquemas.ts`) en lugar de `.partial()`: Zod 4 aplica los `.default()` aunque el campo sea opcional, y un PATCH reescribiría campos que no se enviaron. Lo cubren las pruebas de `tests/parciales.test.ts`.

## Decisiones técnicas

- **Prisma sin motor de Rust** (`engineType = "client"` + `@prisma/adapter-pg`): no hay binarios que descargar en producción. Cada conexión fija `TimeZone=UTC`, porque el adaptador envía las fechas sin zona horaria.
- **Todo en UTC** en la BD; cada sede tiene su `zona_horaria` y cada pedido una `fecha_operacion` local que reinicia la numeración a medianoche de la sede.
- **Consecutivo sin duplicados**: `INSERT … ON CONFLICT DO UPDATE … RETURNING` dentro de la transacción del pedido (probado con 40 pedidos simultáneos).
- **Multi-moneda**: precios en moneda local sin impuesto; el pedido guarda `total_usd` con la tasa del momento. `paises.tasa_impuesto` define el impuesto al consumo (CO 8 %, MX 16 %, PE 18 % en el seed).
- **Reglas en la BD**: CHECK de alcance por rol, puntaje 1–5, rangos de fechas válidos, montos no negativos.
- **Errores uniformes**: `{ "error": { "code", "message", "details?" } }`.

## Siguiente: Fase 5

Pruebas end-to-end automatizadas (Playwright), envío real de correos por SMTP, ajustes de accesibilidad y despliegue de demostración.
