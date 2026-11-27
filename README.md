# Sistema Multi-Sede de Restaurantes (frontend)

Aplicación web para cadenas de restaurantes: menús por sede, pedidos en tiempo real, caja, cocina, turnos, mesas, reservas, cola de espera, pantallas/kioscos y portal de clientes.

Este repositorio contiene **solo el frontend**. La API se consume desde `VITE_API_URL` (por defecto `/api`). Hay **un único `package.json`**, en `apps/web`; la raíz solo conserva documentación y configuración de Vercel.

## Estado y arquitectura

- **React + Vite + TypeScript**, con React Router.
- **Redux Toolkit** para todo el estado global y **RTK Query** para peticiones y caché.
- Un único `src/application/store.ts` reúne las sesiones (`personal`, `cliente`, `dispositivo`), `marca`, `configuracion` y las APIs de RTK Query.
- Cuatro APIs de RTK Query por contexto de autenticación en `src/infrastructure/api.ts`:
  `apiPersonalRTK`, `apiClienteRTK`, `apiDispositivoRTK` y `apiPublicaRTK`.
- `src/application/consultas.ts`, `src/application/mutaciones.ts` y `src/application/hooks.ts` mantienen una API cómoda para los componentes (equivalente a los antiguos hooks de consultas y sesiones), pero todo lo que hacen se resuelve dentro del store de Redux.
- Los eventos de Socket.IO invalidan las consultas de RTK Query o actualizan la marca/configuración en el store.

Estructura (rutas relativas a `apps/web`):

```text
src/
├── application/      # store, hooks, adaptadores de consultas y errores
├── domain/           # tipos del negocio
├── infrastructure/   # APIs RTK Query, localStorage, Socket.IO, marca y configuración
├── presentation/     # app, componentes, páginas, hooks de UI y utilidades
└── shared/           # enums, reglas de promoción, colores y eventos (@shared)
mock-api/             # API falsa para desarrollo
```

## Requisitos

- Node.js 22.12 o superior.

## Puesta en marcha

Todos los comandos se ejecutan desde `apps/web`:

```bash
cd apps/web
npm install
npm run dev:all        # mock API en :4000 + web en http://localhost:5173
```

También puedes arrancarlos por separado:

```bash
npm run mock           # API falsa en memoria, http://localhost:4000
npm run dev            # solo Vite, http://localhost:5173
```

El mock no usa base de datos: los datos vuelven al estado inicial al reiniciarlo.

```bash
npm run typecheck
npm run lint
npm run build
```

## Accesos de demostración

Contraseña: `Demo1234!`

| Rol | Email |
| --- | --- |
| Admin global | `admin@restaurantes.demo` |
| Gerente de país | `gerente.co@restaurantes.demo` |
| Gerente de sede | `gerente.ctg01@restaurantes.demo` |
| Cajero | `cajero1.ctg01@restaurantes.demo` |
| Cocina | `cocina1.ctg01@restaurantes.demo` |
| Cliente del portal | `cliente@restaurantes.demo` |

Tokens de dispositivo: `pantalla-ctg-01-demo`, `kiosco-ctg-01-demo` y `kiosco2-ctg-01-demo` (mismo patrón para otras sedes). Se introducen una vez en `/dispositivo` y quedan guardados en el equipo.

## Pantallas

| Ruta | Descripción |
| --- | --- |
| `/admin` | Dashboard, mesas, turnos, menú, combos, promociones, equipos, apariencia y configuración |
| `/caja` | Toma de pedidos y cobro |
| `/cocina` | Comandas en vivo |
| `/pantalla` | Pantalla de pedidos listos (token de dispositivo) |
| `/kiosco` | Autoservicio (token de dispositivo) |
| `/portal` | Reservas, fila de espera y seguimiento del turno |

El portal muestra u oculta las reservas según la configuración de la cadena. La apariencia (nombre, logo y colores) se cambia en `/admin/apariencia` y se propaga a todas las pantallas por Socket.IO.

## Variables de entorno

| Variable | Valor por defecto | Uso |
| --- | --- | --- |
| `VITE_API_URL` | `/api` | Base de la API (el mock de desarrollo corre en `:4000` y Vite hace proxy de `/api`) |

## Scripts (desde `apps/web`)

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Vite en `:5173` |
| `npm run mock` | API falsa en `:4000` |
| `npm run dev:all` | Mock + Vite juntos |
| `npm run typecheck` | Comprobación de tipos |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run build` | TypeCheck + build de producción |
| `npm run preview` | Sirve el build en `:4173` |
