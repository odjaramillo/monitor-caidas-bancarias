# El contenedor de la API

La API es el único componente que corre en Docker (D2). Este documento explica la imagen, el
contenedor, el puerto, las variables y cómo se ejecuta. El archivo está en
[`apps/api/Dockerfile`](../apps/api/Dockerfile).

- **Imagen.** El molde: un sistema de archivos con Node.js, el código compilado y sus dependencias.
  Se construye una vez y no cambia.
- **Contenedor.** Una imagen en ejecución. Render arranca un contenedor desde la imagen en cada
  despliegue; en local lo arranca `docker run`.

## Las etapas del Dockerfile

El Dockerfile tiene tres etapas. Solo la última llega a producción; las otras dos existen para
construirla.

| Etapa     | Parte de                    | Qué hace                                                                                                           | Por qué existe                                                                                  |
| --------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `base`    | `node:24-alpine`            | Activa `corepack`, que instala la versión de pnpm fijada en `package.json`                                         | Las otras etapas parten de aquí y no repiten la preparación                                     |
| `build`   | `base`                      | Instala todas las dependencias, compila TypeScript a `dist/` y arma en `/out` una copia con solo las de producción | El compilador y las herramientas de prueba se necesitan para compilar, pero no para correr      |
| `runtime` | `node:24-alpine` (de nuevo) | Copia `/out` desde `build`, fija `NODE_ENV=production`, cambia al usuario `node` y arranca `node dist/server.js`   | Es la imagen final: parte de cero y solo recibe lo que copia, así que no hereda nada de `build` |

Detalles de cada etapa:

- **Contexto de construcción.** Es la raíz del repositorio, no `apps/api`, porque
  `pnpm-lock.yaml` y `pnpm-workspace.yaml` viven ahí.
- **Orden de las copias en `build`.** Primero se copian el lockfile y los `package.json`, y se
  instalan las dependencias. Después se copia el código. Si solo cambia el código, Docker reutiliza
  la capa de dependencias desde su caché y la construcción es más rápida.
- **`--frozen-lockfile`.** La instalación falla si `package.json` y `pnpm-lock.yaml` no coinciden.
  Así la imagen usa exactamente las versiones del lockfile.
- **`pnpm deploy --prod /out`.** Copia el paquete `api` a `/out` con sus dependencias de
  producción (`fastify` y `@fastify/cors`), sin las de desarrollo.
- **`USER node`.** El proceso no corre como `root`. Si alguien explota una falla de la API, no
  tiene permisos de administrador dentro del contenedor.
- **`.dockerignore`.** Deja fuera del contexto `node_modules`, `dist`, `.git`, el frontend y todo
  archivo `.env`. Así ningún secreto local entra en la imagen.

### ¿Por qué la imagen final no tiene el compilador?

Porque la etapa `runtime` empieza otra vez desde `node:24-alpine` y solo copia `/out`. TypeScript
(`tsc`), Vitest y `tsx` son dependencias de desarrollo: se instalan en `build` para compilar, y
`pnpm deploy --prod` las deja fuera de `/out`. La imagen final no las necesita, porque ejecuta el
JavaScript ya compilado en `dist/`.

Una imagen sin el compilador pesa menos, arranca más rápido y tiene menos paquetes con posibles
vulnerabilidades. Comprobación del 2026-10-21: en la imagen final, `node_modules` solo tiene
`fastify` y `@fastify`, y no existe `node_modules/typescript`. La imagen pesa 261 MB.

La imagen final sí incluye una copia de `src/` y de los archivos de configuración de la API
(`tsconfig*.json`, `vitest.config.ts`), porque `pnpm deploy` copia todo el paquete. No se ejecutan
ni tienen secretos, pero sobran.

## El puerto y `HOST=0.0.0.0`

- La API escucha en el puerto que dice la variable `PORT`, y en `3000` si no está definida.
  `EXPOSE 3000` documenta ese puerto; no lo abre por sí solo.
- Render define `PORT` para cada servicio y dirige el tráfico a ese puerto. Por eso la API lee
  `PORT` en vez de fijar el número.
- La API escucha en `0.0.0.0`, todas las interfaces de red del contenedor. Si escuchara en
  `127.0.0.1`, solo aceptaría conexiones desde dentro del mismo contenedor, y ni `docker run -p`
  ni Render podrían llegar a ella. Prueba del 2026-10-21: con `-e HOST=127.0.0.1`, `curl` desde
  la máquina no recibe respuesta; con el valor por defecto responde `{"status":"ok"}`.
- `HEALTHCHECK` le pide a Docker que llame a `/health` cada 30 s y marque el contenedor como
  `unhealthy` si no responde. Render no usa esta instrucción: su chequeo se configura en el
  servicio (#8).

## Variables de entorno

| Variable      | Valor por defecto         | Para qué sirve                                                                                   |
| ------------- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| `PORT`        | `3000`                    | Puerto en el que escucha la API. Render lo define.                                               |
| `HOST`        | `0.0.0.0`                 | Interfaz en la que escucha la API (ver arriba).                                                  |
| `LOG_LEVEL`   | `info`                    | Nivel de detalle de los logs de Fastify: `debug`, `info`, `warn` o `error`.                      |
| `CORS_ORIGIN` | sin valor: CORS apagado   | Dominio del frontend que puede llamar a la API desde el navegador, por ejemplo la URL de Vercel. |
| `NODE_ENV`    | `production` en la imagen | Le dice a las librerías que corren en producción. El Dockerfile la fija; no hace falta pasarla.  |

La URL de PostgreSQL y la de Redis llegan con #20 y #31. Quien las agregue las documenta en esta
tabla y en `.env.example`. Los valores reales nunca van en la imagen ni en el repositorio: en
producción viven en las variables del servicio de Render.

## Construir y ejecutar la imagen en local

Desde la raíz del repositorio:

```sh
docker build -f apps/api/Dockerfile -t mcb-api .
docker run --rm -p 3000:3000 mcb-api
curl localhost:3000/health   # {"status":"ok"}
```

- `-f apps/api/Dockerfile` indica el Dockerfile; el `.` final es el contexto: la raíz.
- `-p 3000:3000` publica el puerto 3000 del contenedor en el 3000 de tu máquina.
- `--rm` borra el contenedor al detenerlo.
- Para pasar una variable: `docker run --rm -p 8080:8080 -e PORT=8080 -e LOG_LEVEL=debug mcb-api`.
- `docker ps` muestra el estado del `HEALTHCHECK`: `healthy` o `unhealthy`.

El CI hace lo mismo en cada PR (job `docker`): construye la imagen, la arranca y exige
`{"status":"ok"}` en `/health` (ver [Calidad](calidad.md)).
