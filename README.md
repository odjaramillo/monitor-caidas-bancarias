# Monitor de caídas bancarias

Cuando un pago entre bancos falla en Venezuela, nadie sabe si el problema está en el banco de
origen, en el de destino o en la Cámara de Compensación que los conecta. Este monitor lo muestra
con lo que reportan los usuarios.

**[Ver el estado](https://monitor-caidas-bancarias.vercel.app)** ·
[Reportar una falla](https://monitor-caidas-bancarias.vercel.app/reportar) ·
[Salud de la API](https://monitor-caidas-bancarias.onrender.com/health) ·
[Decisiones](docs/decisiones.md)

Proyecto integrador de Computación en la Nube (INFO-02028), UCAB, 2026.

| Para conocer el proyecto                                                                                                                                                                                                                         | Para trabajar en él                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| [Problema y alcance](#problema-usuarios-y-alcance-del-mvp) · [Arquitectura](#arquitectura) · [Despliegue](#despliegue) · [Contenedor](#contenedor) · [Modelos de servicio](#modelos-de-servicio) · [Documentos](#documentos) · [Equipo](#equipo) | [Cómo empezar](#cómo-empezar) · [Scripts](#scripts) · [Cómo trabajamos](#cómo-trabajamos) · [CI y despliegue](#ci-y-despliegue) |

## Problema, usuarios y alcance del MVP

Las fallas bancarias en Venezuela son frecuentes y se concentran en los días de pago. La gente se
entera por X, no por el banco. El 15-05-2026 fallaron a la vez Banesco, Mercantil, BDV, Provincial
y Banco Plaza en plena quincena, y Banco Plaza atribuyó la falla a la Cámara de Compensación
Electrónica del BCV.

Cuando la app del banco no abre, la falla se ve sola. Las otras no: el pago sale y no llega, el
banco propio funciona pero el de destino no, o la falla está en la Cámara de Compensación. Desde la
app del banco eso no se distingue. Los incidentes y sus fuentes están en la
[propuesta](docs/propuesta.md), sección 2.

### Usuarios objetivo

- **Comercio (usuario principal).** Un cliente muestra "operación exitosa" y el dinero no llega.
  Debe decidir si entrega la mercancía, espera o pide otro método de pago.
- **Quien paga.** El pago salió de su cuenta y no llegó. Quiere saber si reintenta, espera o paga
  desde otro banco.

### Qué hace el MVP

Quien paga o cobra reporta en un toque qué falló: banco de origen, banco de destino y qué pasó.
No necesita cuenta. Cada 30 segundos, el worker cuenta los reportes de los últimos 15 minutos y le
da un nivel a cada uno de los 100 pares origen → destino. La pantalla de estado muestra los 100.

| Nivel                | Reportes en 15 minutos (D19) | Con 3 días de historial (D20)  |
| -------------------- | ---------------------------- | ------------------------------ |
| `normal`             | 0                            | Por debajo de 2 veces la base  |
| `posibles_problemas` | De 1 a 4                     | 2 veces la línea base por hora |
| `muchos_reportes`    | 5 o más                      | 4 veces la línea base por hora |

La pantalla nunca dice «el banco está caído». Dice cuántas personas reportan problemas (R4). El
artículo 226 de la Ley de Instituciones del Sector Bancario castiga difundir noticias no
confirmadas sobre un banco ([propuesta](docs/propuesta.md), sección 3).

| Función del MVP                                                  | Corte | Hoy                                                                |
| ---------------------------------------------------------------- | ----- | ------------------------------------------------------------------ |
| Estado por par de bancos (R1)                                    | 1 y 2 | En producción. La caché en Redis llega en el Corte 2 (#37)         |
| Reportar en un toque, sin cuenta (R2)                            | 1 y 2 | En producción. El límite por dispositivo llega en el Corte 2 (#30) |
| Detalle por banco: últimas 24 horas y pares más afectados (R3)   | 2     | Pendiente (#25)                                                    |
| Frenar el abuso: límites, CAPTCHA invisible y respuesta 429 (R5) | 2     | Pendiente (#27, #30)                                               |

Fuera del MVP: cuentas de usuario, comentarios, aplicación móvil nativa, alertas por Telegram (D11)
y sondeo automático de los servidores de los bancos (D22). El estado de cada requisito está en
[requisitos](docs/requisitos.md).

## Arquitectura

Un monolito con un worker: la API y el worker corren en el mismo proceso, dentro de un solo
contenedor (D1). No hay Kubernetes ni microservicios.

```mermaid
flowchart LR
  U[Usuario<br/>navegador]
  subgraph FE["Frontend"]
    F[SvelteKit estático<br/>Vercel · CDN]
  end
  subgraph BE["Backend/API"]
    subgraph R1["Render · un contenedor Docker"]
      A[API<br/>Fastify]
      W[Worker<br/>cada 30 s<br/>estado en memoria]
    end
  end
  subgraph DB["Persistencia"]
    P[(Supabase PostgreSQL<br/>fuente de verdad)]
  end
  subgraph CA["Caché"]
    R[(Upstash Redis<br/>caché · límites)]
  end
  subgraph EX["Servicios Externos"]
    T[Cloudflare Turnstile<br/>CAPTCHA]
    S[Sentry<br/>errores]
    B[Better Stack<br/>monitor]
  end
  G[GitHub Actions<br/>CI/CD]
  U -->|HTTPS| F
  U -->|HTTPS · JSON<br/>POST /reports · GET /status| A
  A -->|guarda los reportes| P
  W -->|lee los reportes| P
  A -.->|Corte 2| R
  W -.->|Corte 2| R
  U -.->|Corte 2 · token del CAPTCHA| T
  A -.->|Corte 2 · verifica el token| T
  A -.->|Corte 2 · errores| S
  B -.->|Corte 2 · GET /health cada 30 s| A
  G -.->|Deploy Hook| R1
```

Figura 1. Las líneas continuas son el tráfico de la aplicación hoy. Las punteadas son el despliegue
desde GitHub Actions y lo que llega en el Corte 2: la caché, el CAPTCHA, los errores y el monitor.
Supabase, Upstash y Render están en la misma región, Oregon (`us-west-2`).

El navegador descarga el frontend desde la CDN de Vercel y después llama a la API directamente.
`GET /status` responde desde la memoria del worker, sin consultar la base. La API todavía no usa
Redis (D21). El detalle de cada componente está en [Arquitectura](docs/arquitectura.md).

| Capa               | Componente                   | Responsabilidad                                                                                   |
| ------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------- |
| Frontend           | SvelteKit estático en Vercel | Muestra el estado de cada par de bancos y el formulario de reporte. No tiene servidor propio (D3) |
| Backend/API        | API en Fastify               | Recibe los reportes, los valida, los guarda en PostgreSQL y sirve el estado                       |
| Backend/API        | Worker                       | Cada 30 s recalcula el nivel de cada par desde PostgreSQL y lo deja en memoria                    |
| Persistencia       | Supabase PostgreSQL          | Fuente de verdad: los bancos y los reportes. Solo la API y el worker se conectan                  |
| Caché              | Upstash Redis                | Corte 2: la caché del estado con 30 s de vida y los contadores de límites (#30, #37)              |
| Servicios Externos | Cloudflare Turnstile         | Corte 2: CAPTCHA invisible contra bots. La API verifica el token antes de guardar (#27)           |
| Servicios Externos | Sentry                       | Corte 2: guarda los errores de la API con su contexto (#42)                                       |
| Servicios Externos | Better Stack                 | Corte 2: llama a `/health` cada 30 s y mantiene despierta la API (D5, #43)                        |
| CI/CD              | GitHub Actions               | Revisa cada PR y despliega la API en Render al fusionar en `main` (D23)                           |

### Si algo falla

| Qué falla                                    | Qué pasa                                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| PostgreSQL no responde                       | `POST /reports` responde 503 y el formulario pide intentar de nuevo. `GET /status` sirve el último estado |
| El contenedor se reinicia o Render lo duerme | `GET /status` responde 503 hasta la primera pasada del worker. Los reportes siguen en PostgreSQL          |
| Redis no responde                            | Nada todavía: la API no usa Redis                                                                         |

Ante una falla de la base, la escritura prioriza la consistencia y la lectura, la disponibilidad.
La tabla completa está en [Arquitectura](docs/arquitectura.md#si-algo-falla).

## Despliegue

El sistema está desplegado y responde desde Internet. El 22-10-2026, un reporte enviado desde un
teléfono apareció en la pantalla de estado.

| Pieza    | URL                                           | Dónde corre                |
| -------- | --------------------------------------------- | -------------------------- |
| Frontend | https://monitor-caidas-bancarias.vercel.app   | Vercel (#22)               |
| API      | https://monitor-caidas-bancarias.onrender.com | Render, región Oregon (#8) |

La API corre en el plan gratuito de Render: se duerme tras un rato sin tráfico, y la primera petición
después puede tardar 50 segundos o más. `/health` dice si la API llega a la base de datos.

Vercel despliega el frontend en cada push a `main`. El job `deploy` del CI despliega la API en
Render y comprueba `/health` después (D23). Cada etapa está en [CI y despliegue](#ci-y-despliegue).

## Contenedor

La API es el único componente que corre en Docker (D2), y el worker corre dentro de ella. El
archivo es [`apps/api/Dockerfile`](apps/api/Dockerfile).

- **Imagen.** Un sistema de archivos con Node.js, el código compilado y sus dependencias. Se
  construye una vez y no cambia.
- **Contenedor.** Una imagen en ejecución. Render arranca un contenedor desde la imagen en cada
  despliegue; en local lo arranca `docker run`.

| Etapa     | Parte de         | Qué hace                                                                                                     |
| --------- | ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `base`    | `node:24-alpine` | Activa `corepack`, que instala la versión de pnpm fijada en `package.json`                                   |
| `build`   | `base`           | Instala las dependencias, compila TypeScript a `dist/` y arma en `/out` una copia con solo las de producción |
| `runtime` | `node:24-alpine` | Copia `/out`, fija `NODE_ENV=production`, cambia al usuario `node` y arranca `node dist/server.js`           |

Solo `runtime` llega a producción. Parte de cero, así que no trae el compilador ni las herramientas
de prueba. El proceso no corre como `root`.

**Puerto.** La API escucha en el puerto de la variable `PORT`, y en `3000` si no está definida.
Render define `PORT` para cada servicio. La API escucha en `0.0.0.0`: con `127.0.0.1`, ni
`docker run` ni Render podrían llegar a ella. `HEALTHCHECK` llama a `/health` cada 30 s.

| Variable             | Valor por defecto            | Para qué sirve                                                         |
| -------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`       | sin valor: la API no arranca | URL de PostgreSQL. En producción, la del pooler de Supabase            |
| `PORT`               | `3000`                       | Puerto en el que escucha la API. Render lo define                      |
| `HOST`               | `0.0.0.0`                    | Interfaz en la que escucha la API                                      |
| `LOG_LEVEL`          | `info`                       | Nivel de detalle de los logs: `debug`, `info`, `warn` o `error`        |
| `CORS_ORIGIN`        | sin valor: CORS apagado      | Dominio del frontend que puede llamar a la API desde el navegador      |
| `NODE_ENV`           | `production` en la imagen    | El Dockerfile la fija; no hace falta pasarla                           |
| `DB_POOL_MAX`        | `10`                         | Conexiones a PostgreSQL como máximo, de 1 a 15 (el límite de Supabase) |
| `STATUS_INTERVAL_MS` | `30000`                      | Cada cuántos milisegundos el worker recalcula el estado                |

Los valores reales viven en las variables del servicio de Render, nunca en la imagen ni en el
repositorio. Para construir y correr la imagen desde la raíz del repositorio:

```sh
docker build -f apps/api/Dockerfile -t mcb-api .
docker compose up -d --wait postgres
docker run --rm --network host -e DATABASE_URL=postgresql://mcb:mcb@localhost:5432/mcb mcb-api
curl localhost:3000/health   # {"status":"ok","database":"ok"}
```

El contexto de construcción es la raíz, porque el lockfile y el workspace viven ahí. En macOS o
Windows, usa `-p 3000:3000` y, en la URL, `host.docker.internal` en vez de `localhost`. La
explicación completa está en [Contenedor](docs/contenedor.md).

## Modelos de servicio

Ninguna pieza usa IaaS: nadie del equipo administra un servidor, un sistema operativo ni una red.
El equipo solo entrega código, una imagen o datos.

| Pieza               | Plataforma            | Modelo | Por qué este modelo                                                                              |
| ------------------- | --------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| Frontend            | Vercel Hobby          | PaaS   | Los archivos estáticos se sirven desde la CDN y aguantan un pico de lecturas sin ejecutar código |
| API y worker        | Render (Docker)       | PaaS   | Corre nuestra imagen sin administrar una máquina. El plan gratuito cubre un servicio             |
| Base de datos       | Supabase PostgreSQL   | DBaaS  | Una base relacional administrada y gratuita para la fuente de verdad                             |
| Caché y límites     | Upstash Redis         | DBaaS  | Cobra por comando, así que sin tráfico no consume. No hay un servidor de Redis que mantener      |
| CAPTCHA             | Cloudflare Turnstile  | SaaS   | Construir un CAPTCHA propio no tiene sentido para el problema                                    |
| Errores y monitoreo | Sentry y Better Stack | SaaS   | El producto listo cuesta $0 en sus planes gratuitos                                              |
| CI/CD               | GitHub Actions        | SaaS   | Gratis en un repositorio público, junto al código (D6)                                           |

PaaS: plataforma como servicio. DBaaS: base de datos como servicio. SaaS: software como servicio.
Qué administra cada plataforma y qué administra el equipo está en
[Arquitectura](docs/arquitectura.md#modelos-de-servicio).

## Documentos

| Documento                                                    | Qué tiene                                                         |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| [Enunciado](docs/enunciado/enunciado-proyecto-nube-ucab.pdf) | El enunciado oficial del profesor                                 |
| [Propuesta](docs/propuesta.md)                               | La propuesta del equipo: problema, MVP, arquitectura y roles      |
| [Arquitectura](docs/arquitectura.md)                         | Cada componente, cómo se comunica y su modelo de servicio         |
| [Requisitos](docs/requisitos.md)                             | Cada requisito con su fuente, su corte, su issue y su estado      |
| [Contrato de la API](docs/api.md)                            | Qué entra y qué sale de cada endpoint, con ejemplos JSON          |
| [Contenedor](docs/contenedor.md)                             | La imagen de la API: etapas, puerto, variables y cómo ejecutarla  |
| [Calidad](docs/calidad.md)                                   | Qué control hace cumplir cada regla y la prueba de que falla      |
| [Datos](docs/datos.md)                                       | Qué guarda cada tabla de PostgreSQL y qué componente tiene estado |
| [Decisiones](docs/decisiones.md)                             | Qué se eligió, por qué y qué se descartó                          |

## Equipo

Integrantes:

- Oscar Jaramillo
- Fernando Liendo
- Luis Torres
- Juan Brillembourg
- Ivifer Pita

Cada integrante es dueño de una pieza y la defiende de punta a punta. Todos explican también el
flujo completo. Los roles salen de la sección 9 de la [propuesta](docs/propuesta.md), y cada uno
coincide con un label `area:`.

| Rol                    | Qué defiende                                                                       | Label             | Integrante        |
| ---------------------- | ---------------------------------------------------------------------------------- | ----------------- | ----------------- |
| Frontend               | Pantallas de estado, reporte y detalle; carga rápida en un teléfono con mala señal | `area:web`        | Ivifer Pita       |
| API e ingesta          | Recibir reportes, validarlos, frenar el abuso y el contrato de la API              | `area:api`        | Luis Torres       |
| Worker y detección     | Ventanas de tiempo, línea base por hora y el umbral que decide "problema"          | `area:worker`     | Fernando Liendo   |
| Datos y caché          | Esquema en PostgreSQL, Redis, qué tiene estado y qué pasa si cae cada uno          | `area:datos`      | Juan Brillembourg |
| Plataforma y operación | Docker, CI/CD, secretos, monitoreo, prueba de carga e IaC                          | `area:plataforma` | Oscar Jaramillo   |

Cada integrante elige su rol, pone su usuario de GitHub en esta tabla en un PR y se asigna los
issues de su label.

---

Lo que sigue es para quien trabaja en el repositorio: cómo levantarlo, cómo probarlo y las reglas
que hace cumplir el CI.

## Estructura

```
apps/
  api/      API en Fastify con TypeScript, empaquetada con Docker
  web/      Frontend en SvelteKit, compilado a archivos estáticos
tooling/    Pruebas del contrato del repositorio y scripts de métricas
docs/       Enunciado, propuesta, requisitos y decisiones
```

## Requisitos para desarrollar

- Node.js 24 (ver `.node-version`)
- pnpm 11 (`corepack enable` instala la versión de `package.json`)
- Docker, para construir la imagen de la API

## Cómo empezar

```sh
pnpm install
cp .env.example .env   # trae los valores locales; nunca subas .env
docker compose up -d   # PostgreSQL en :5432 y Redis en :6379
pnpm --filter api migrate up   # crea las tablas (apps/api/migrations)
pnpm dev               # API en :3000, frontend en :5173
```

### Servicios locales

`compose.yaml` levanta PostgreSQL 17 (la misma versión mayor que Supabase) y Redis 7 (en lugar de
Upstash). Así nadie pisa los datos de otro ni gasta la cuota de Upstash mientras desarrolla. Los
puertos solo escuchan en `localhost`.

| Comando                  | Qué hace                                                   |
| ------------------------ | ---------------------------------------------------------- |
| `docker compose up -d`   | Levanta los dos servicios en segundo plano                 |
| `docker compose ps`      | Muestra si cada servicio está `healthy`                    |
| `docker compose stop`    | Los detiene y conserva los datos                           |
| `docker compose down -v` | Los borra junto con sus datos (`-v` elimina los volúmenes) |

Para entrar a cada uno:

```sh
docker compose exec postgres psql -U mcb -d mcb
docker compose exec redis redis-cli
```

## Scripts

| Comando                  | Qué hace                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `pnpm dev`               | Corre la API y el frontend y recarga al guardar                                                    |
| `pnpm lint`              | ESLint y la revisión de formato de Prettier                                                        |
| `pnpm format`            | Formatea todos los archivos con Prettier                                                           |
| `pnpm typecheck`         | `tsc` para la API, `svelte-check` para el frontend                                                 |
| `pnpm test`              | Vitest, con cobertura y su piso. La API necesita el PostgreSQL de `docker compose up -d`           |
| `pnpm build`             | Compila la API y genera el frontend estático                                                       |
| `pnpm verify`            | Corre los comandos del job `checks` del CI en el mismo orden                                       |
| `pnpm coverage:check`    | Falla si la cobertura subió más de 0,1 puntos sobre su piso. Lee el resumen del último `pnpm test` |
| `pnpm coverage:ratchet`  | Corre `pnpm test` y sube el piso de cobertura a lo medido, con la fecha de hoy                     |
| `pnpm measure:functions` | Mide parámetros, niveles de bloques y líneas de cada función de producción (JSON)                  |

Para construir y correr la imagen de la API, ver [Contenedor](#contenedor).

### Pruebas en navegador

Playwright abre las dos pantallas en Chromium, contra el build estático y la API compilada (#111).
Las pruebas escriben reportes, así que solo aceptan un PostgreSQL en `localhost`. Usa una base
aparte: con esos reportes, las pruebas de la API fallan durante 15 minutos.

```sh
pnpm --filter web exec playwright install chromium   # una vez; en Linux agrega --with-deps
docker compose exec postgres createdb -U mcb mcb_e2e  # una vez
pnpm build
DATABASE_URL=postgresql://mcb:mcb@localhost:5432/mcb_e2e pnpm --filter web test:e2e
```

Las pruebas arrancan la API en `:3000` y el frontend en `:4173`. Si un puerto está ocupado, fallan
antes de empezar. Para usar otro puerto de la API, pon la misma `PUBLIC_API_URL` en los dos
últimos comandos, por ejemplo `PUBLIC_API_URL=http://localhost:3100`.

### Pruebas de mutación

La cobertura dice qué líneas corren las pruebas, no si detectan un cambio en ellas. Stryker cambia
`apps/api/src/levels.ts` un mutante a la vez, por ejemplo `>=` por `>`, y corre sus pruebas. Si
ninguna falla, el mutante sobrevive: esa línea corre, pero nadie comprueba su resultado (#119).

```sh
pnpm --filter api test:mutation
```

No necesita PostgreSQL: usa `apps/api/vitest.stryker.config.ts`, que corre solo
`levels.test.ts` y no migra la base. Tarda menos de un minuto. La tabla final da el puntaje, y
`apps/api/reports/mutation/mutation.html` muestra cada mutante. Ábrelo en el navegador y filtra por
`Survived`: cada mutante vivo pide una prueba nueva.

El comando falla si el puntaje baja del umbral `threshold` de `apps/api/mutation-baseline.json`.
Ese archivo guarda cada medición con su fecha y su commit. El umbral es el puntaje medido menos
su variación entre corridas. Si tu PR sube el puntaje, mide tres veces y sube el umbral. Nunca lo
bajes para que pase: escribe la prueba que mata al mutante.

En GitHub, `.github/workflows/mutation.yml` corre cada lunes, en un PR con la etiqueta `mutation`
y a mano desde Actions. No es un check requerido. Deja el puntaje en el resumen del job y el
reporte HTML como artefacto `mutation-report`. Para correrlo en tu PR, ponle la etiqueta
`mutation`.

## Cómo trabajamos

1. **Todo empieza en un issue.** Usa la plantilla Tarea o Bug. Cada issue cita su requisito (`E#` o
   `R#`) y tiene criterios de aceptación. Asígnatelo antes de empezar.
   <!-- regla: Todo empieza en un issue con la plantilla, su requisito y criterios de aceptación -->
2. **Una rama por issue**: `<usuario>/<numero>-<tema>`, por ejemplo `oscar/5-post-reports`.
   <!-- regla: Una rama por issue con el formato `<usuario>/<numero>-<tema>` -->
3. **Commits en inglés con [Conventional Commits](https://www.conventionalcommits.org)**:
   `feat(api): accept bank reports`. Un hook de Git rechaza otros formatos y el CI los revisa de
   nuevo. Antes de cada commit, otro hook corre ESLint y Prettier sobre los archivos preparados.
   <!-- regla: Commits con Conventional Commits -->
   <!-- regla: Estilo y formato del código -->
4. **Un PR por issue, con `Closes #N` en inglés.** "Cierra #N" no cierra el issue. Un PR sin issue
   lleva `[sin-issue]`. El CI rechaza el PR si no tiene ninguno de los dos. Solo el PR mensual de
   Dependabot pasa sin enlace.
   <!-- regla: Un PR por issue con `Closes #N` o `[sin-issue]` -->
5. **`main` está protegida.** Solo entra por PR, con el CI en verde.
   <!-- regla: `main` solo recibe PR con el CI en verde -->
6. **Si el PR cumple un requisito, actualiza su estado** en `docs/requisitos.md` en el mismo PR.
   <!-- regla: Si el PR cumple un requisito, actualiza `docs/requisitos.md` -->
7. **Cada integrante usa su propia identidad de Git** (`git config user.name` y `user.email`).
   El historial es la evidencia del aporte de cada uno.
   <!-- regla: Cada integrante usa su propia identidad de Git -->
8. **Antes de abrir el PR, corre `pnpm verify`.** Corre los comandos del job `checks` en el mismo
   orden, salvo commitlint (ver [calidad](docs/calidad.md)). Necesita el PostgreSQL de
   `docker compose up -d`.
   <!-- regla: `pnpm verify` repite el job `checks` -->
9. **Antes de cada push, un hook corre el typecheck y las pruebas de lo cambiado.** Solo revisa
   los paquetes que cambió el push y los que dependen de ellos, nunca el paquete raíz, y se
   detiene en el primer fallo. Un push que solo cambia archivos de la raíz no corre ningún
   paquete, y un paquete sin script `typecheck`, como `tooling/repo-contract`, solo corre sus
   pruebas. Si cambiaste la API, necesita el PostgreSQL de `docker compose up -d`. La suite
   completa corre en el CI y en `pnpm verify`.
   <!-- regla: Lo cambiado compila y pasa sus pruebas -->
10. **Cada prueba corre y no espera un tiempo fijo.** El lint rechaza `.only`, `.todo` y las
    esperas fijas, como `setTimeout` o `waitForTimeout`. Un `.skip` lleva en la línea anterior
    su issue y su vencimiento: `// skip: #123 until 2026-11-30`. Después de esa fecha,
    `pnpm test` falla. Cada paquete del workspace tiene un script `test`.
    <!-- regla: Ninguna prueba enfocada, pendiente o con espera -->
    <!-- regla: Un `.skip` lleva su issue y su vencimiento -->
    <!-- regla: Cada paquete del workspace tiene script `test` -->

Idioma: docs, issues y PR en español; código, identificadores y commits en inglés (D9 en
[decisiones](docs/decisiones.md)).
<!-- regla: Docs, issues y PR en español; código y commits en inglés -->

Los secretos viven solo en las plataformas y en tu `.env` local. El CI corre gitleaks sobre todo
el historial en cada PR y en cada push a `main`.
<!-- regla: Ningún secreto en el repositorio -->

### Labels y milestones

- `type:` dice qué es el trabajo: `feat`, `bug`, `chore` o `docs`.
- `area:` dice qué pieza toca: `web`, `api`, `worker`, `datos` o `plataforma`. Coincide con los roles
  de la sección [Equipo](#equipo).
- Un milestone por entrega: **Corte 1** (30 oct), **Corte 2** (11 dic) y **Entrega final** (16 dic).
- No hay labels de estado. Un issue está abierto o cerrado; el avance de cada requisito vive en
  `docs/requisitos.md`.
- Los issues del corte siguiente existen desde el inicio como borrador. Sus criterios se refinan
  cuando cierra el corte anterior.

## CI y despliegue

El pipeline empieza con un PR hacia `main` y termina con la prueba de la API desplegada.

1. **Checks del PR.** `.github/workflows/ci.yml` corre en cada PR y en cada push a `main`:
   - `checks`: instala con el lockfile, revisa los mensajes de commit, lint, typecheck, pruebas,
     el piso de cobertura, build y las pruebas en navegador con Playwright contra el build y la
     API con su PostgreSQL.
   - `docker`: valida `compose.yaml`, construye la imagen de la API, comprueba que no arranca sin
     `DATABASE_URL`, la arranca con PostgreSQL y exige que `/health` responda
     `{"status":"ok","database":"ok"}` en 30 s.
   - `secrets`: gitleaks 8.30.1 revisa el diff de cada commit de todas las ramas y tags
     (`git log -p --all`), no solo los commits del PR. El job verifica el checksum del binario y
     falla si el checkout no trae el historial completo. No revisa archivos sin commit ni el diff
     propio de un commit de merge, porque `git log -p` no lo muestra.

   `.github/workflows/pr.yml` corre en cada PR, también cuando editas su descripción:
   - `issue`: exige `Closes #N` o `[sin-issue]`. Si el autor del PR es `dependabot[bot]`, pasa
     sin enlace y lo dice en un aviso. Corre igual en cada PR, porque un check requerido que se
     salta cuenta como aprobado.

   Vercel publica además una vista previa del frontend para cada PR.

2. **Merge.** `main` exige `checks`, `docker`, `secrets` e `issue` en verde y la rama al día. El
   merge es un push a `main`, así que `ci.yml` corre otra vez sobre el commit fusionado.
3. **Frontend en Vercel.** Vercel despliega `main` en cada push.
4. **API en Render.** Render tiene Auto-Deploy apagado y despliega solo desde el job `deploy` de
   `ci.yml` (D23). El job corre en un push a `main`, después de `checks`, `docker` y `secrets` en
   verde. Llama al Deploy Hook de Render con el commit fusionado (`curl --fail --max-time 30`). Un
   merge nuevo cancela el `deploy` anterior.
5. **Prueba después del despliegue.** El mismo job llama al `/health` público de la API cada 20 s,
   con `curl --max-time 60`, durante 15 minutos como máximo. Pasa cuando la API responde 200 con
   `commit` igual al commit fusionado. Si no, falla. `deploy` no es un check requerido, porque
   corre después del merge.

Si falta el secreto `RENDER_DEPLOY_HOOK_URL`, el job `deploy` falla antes de llamar a Render, y
la API no se despliega.

El despliegue del frontend no tiene prueba posterior. Vercel no crea despliegues de GitHub en
este repositorio, solo un estado del commit, y el sitio estático no dice qué commit sirve.

Una prueba en `tooling/repo-contract` lee los workflows como texto. Falla si un job requerido
desaparece o cambia de nombre, si un comando de gate deja de correr, si un job queda solo con
pasos de preparación o si `pnpm verify` se separa de `checks`. También falla si `deploy` deja de
llamar al Deploy Hook, de comparar el `commit` de `/health` o de esperar a los jobs requeridos, y
si cambia el `concurrency` del CI (un push nuevo cancela la corrida vieja de la misma rama) o el de
`deploy` (un despliegue a la vez, y el nuevo cancela al viejo).
Otra prueba del mismo paquete lee `docs/calidad.md`. Falla si una fila nombra un archivo, un script
o un job que no existe, o si una regla de "Cómo trabajamos" no tiene su fila.
Una tercera lee las pruebas y el workspace. Falla con un `.skip` sin su issue y su fecha, o
vencido, y con un paquete sin script `test`. Para que estas pruebas no dejen de correr en silencio,
`pnpm test` corre `tooling/repo-contract` con `pnpm --dir`, que falla si el paquete pierde su
script `test`, y después corre los demás paquetes.
Una cuarta fija el gate de mutación: falla si el umbral no sale de la medición fechada, si Stryker
muta otro archivo o si `mutation` pasa a ser un job requerido.

### Cobertura y dependencias

- `pnpm test` mide la cobertura de cada proyecto y falla si baja del piso. El piso está en
  `thresholds`, en `apps/api/vitest.config.ts` y en `apps/web/vite.config.ts`, con la fecha de la
  medición.
- El piso sube cuando sube la cobertura (#120). Después de `pnpm test`, `checks` corre
  `pnpm coverage:check`: falla si una métrica quedó más de 0,1 puntos sobre su piso. Entonces
  corre `pnpm coverage:ratchet` y haz commit de los configs. El script escribe los números nuevos y
  la fecha de hoy junto al piso, y nunca lo baja. Si un proyecto falla, no escribe ningún config.
  Ningún workflow hace commits a `main`: el piso nuevo llega en tu PR. Nunca bajes el piso para que
  el CI pase: escribe la prueba que falta.
- ESLint limita cada función de producción a 4 parámetros, 3 niveles de bloques y 31 líneas, justo
  sobre el p95 medido. La medición y las funciones viejas sobre el tope están en
  [calidad](docs/calidad.md).
- `checks` también corre `pnpm audit:prod`. El script `tooling/repo-contract/audit-gate.js` corre
  `pnpm audit --prod --json` y falla si una dependencia de producción tiene un aviso alto o
  crítico que no está en `audit-allowlist.json`. También falla si el registro no responde o si la
  salida no es un reporte, y si una entrada de la lista venció.
- Cada `uses:` de los workflows está fijado al SHA completo de un commit, con el tag en un
  comentario. Un tag se puede mover a otro código; un SHA no. Para subir una Action, busca el SHA
  del tag nuevo con `gh api repos/<dueño>/<action>/commits/<tag> --jq .sha` y cambia los dos.
- Dependabot abre un PR agrupado por ecosistema el primer día de cada mes: uno para npm (todo el
  workspace de pnpm) y otro para las Actions de `.github/workflows`. Sus commits empiezan con
  `chore(deps):` o `ci(deps):` y pasan commitlint. `.github/dependabot.yml` tiene la
  configuración, y una prueba de `tooling/repo-contract` la fija.
- Para revisar el PR de Dependabot, lee las notas de versión de cada cambio mayor y espera a que
  pasen `checks`, `docker`, `secrets` e `issue`. Si un cambio rompe algo, cierra el PR, abre un
  issue y actualiza esa dependencia a mano en su propio PR. Los jobs de un PR solo usan el
  `GITHUB_TOKEN`, que GitHub también da a Dependabot, de solo lectura. Así, el PR de Dependabot
  corre los mismos checks que los demás.

#### Un aviso de `pnpm audit` sin arreglo

Si `pnpm audit:prod` falla por un aviso alto o crítico, primero actualiza la dependencia. Si
todavía no hay una versión con el arreglo:

1. Quien abre el PR que encuentra el aviso agrega la entrada en `audit-allowlist.json`, en ese PR:
   `{ "id": "GHSA-...", "reason": "...", "expires": "AAAA-MM-DD" }`. El `id` es el
   `github_advisory_id` del reporte.
2. `reason` dice por qué el riesgo es aceptable hoy: por ejemplo, que la API no llega al código
   vulnerable, o que no hay arreglo publicado. "No hay tiempo" no es un motivo.
3. `expires` es el día en que alguien vuelve a mirar el aviso. Elige una fecha cercana, por
   ejemplo un mes después: el script no limita el plazo. La entrada vale hasta el final de ese
   día, en UTC.
4. Quien revisa el PR acepta o rechaza el motivo.
5. Cuando vence, el CI queda en rojo, también si ningún aviso la usa. Ese día alguien revisa el
   aviso: actualiza la dependencia y borra la entrada, o la renueva con un motivo nuevo.

El script avisa, sin fallar, cuando una entrada ya no coincide con ningún aviso. Bórrala.

### Métricas del proceso

El workflow `Metrics` (`.github/workflows/metrics.yml`) corre cada lunes a las 06:00 UTC. También
se puede correr a mano desde Actions con "Run workflow". Para verlas, abre la última corrida de
`Metrics` en la pestaña Actions: la tabla está en el resumen del job y el JSON en el artefacto
`process-metrics`. El workflow solo lee el tracker, no es un check requerido y nunca hace commits.

La tabla tiene una fila por semana ISO, de las últimas 12, y una fila de total:

| Columna                 | Qué significa                                                                |
| ----------------------- | ---------------------------------------------------------------------------- |
| Merged PRs              | PR integrados en `main` esa semana                                           |
| PRs without issue       | De esos, los que no cierran ningún issue, como `[sin-issue]` o Dependabot    |
| Issues closed           | Issues cerrados por primera vez por un PR integrado esa semana               |
| Lead time median (days) | La mediana de los días desde que se abrió cada issue hasta el merge de su PR |
| Lead time p85 (days)    | El 85 % de esos issues tardó esos días o menos                               |

Un PR se enlaza con su issue por su `Closes #N` o por el enlace hecho a mano en GitHub. Para
calcularlas en local: `node tooling/repo-contract/process-metrics.js --repo <dueño>/<repo>`. Usa
tu sesión de `gh`.
