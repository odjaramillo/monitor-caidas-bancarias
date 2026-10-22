# Monitor de caídas bancarias

Aplicación web que muestra dónde se rompe un pago entre bancos en Venezuela: el banco de origen,
el de destino o el sistema que los conecta. La información sale de reportes de los usuarios.

Proyecto integrador de Computación en la Nube (INFO-02028), UCAB, 2026.

## En producción

| Pieza    | URL                                           | Dónde corre                |
| -------- | --------------------------------------------- | -------------------------- |
| Frontend | https://monitor-caidas-bancarias.vercel.app   | Vercel (#22)               |
| API      | https://monitor-caidas-bancarias.onrender.com | Render, región Oregon (#8) |

La API corre en el plan gratuito de Render: se duerme tras un rato sin tráfico, y la primera petición
después puede tardar 50 segundos o más. `/health` dice si la API llega a la base de datos.

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

## Arquitectura

El detalle de cada componente y su modelo de servicio está en [Arquitectura](docs/arquitectura.md).

```
Navegador ──> Frontend (SvelteKit estático, CDN de Vercel)
                 │
                 ▼
              API (Fastify, Docker, Render) ── worker (intervalo en el mismo proceso)
                 │                │
                 ▼                ▼
          Upstash Redis     Supabase PostgreSQL
        (caché, límites)    (fuente de verdad)
```

| Pieza         | Plataforma          | Modelo de servicio |
| ------------- | ------------------- | ------------------ |
| Frontend      | Vercel Hobby        | PaaS               |
| API, worker   | Render (Docker)     | PaaS               |
| Base de datos | Supabase PostgreSQL | DBaaS              |
| Caché         | Upstash Redis       | DBaaS              |
| CI            | GitHub Actions      | SaaS               |

## Estructura

```
apps/
  api/   API en Fastify con TypeScript, empaquetada con Docker
  web/   Frontend en SvelteKit, compilado a archivos estáticos
docs/    Enunciado, propuesta, requisitos y decisiones
```

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

| Comando          | Qué hace                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `pnpm dev`       | Corre la API y el frontend y recarga al guardar                                          |
| `pnpm lint`      | ESLint y la revisión de formato de Prettier                                              |
| `pnpm format`    | Formatea todos los archivos con Prettier                                                 |
| `pnpm typecheck` | `tsc` para la API, `svelte-check` para el frontend                                       |
| `pnpm test`      | Vitest, con cobertura y su piso. La API necesita el PostgreSQL de `docker compose up -d` |
| `pnpm build`     | Compila la API y genera el frontend estático                                             |
| `pnpm verify`    | Corre los comandos del job `checks` del CI en el mismo orden                             |

Para construir y correr la imagen de la API desde la raíz del repositorio:

```sh
docker build -f apps/api/Dockerfile -t mcb-api .
docker run --rm --network host -e DATABASE_URL=postgresql://mcb:mcb@localhost:5432/mcb mcb-api
curl localhost:3000/health   # {"status":"ok","database":"ok"}
```

## Cómo trabajamos

1. **Todo empieza en un issue.** Usa la plantilla Tarea o Bug. Cada issue cita su requisito (`E#` o
   `R#`) y tiene criterios de aceptación. Asígnatelo antes de empezar.
2. **Una rama por issue**: `<usuario>/<numero>-<tema>`, por ejemplo `oscar/5-post-reports`.
3. **Commits en inglés con [Conventional Commits](https://www.conventionalcommits.org)**:
   `feat(api): accept bank reports`. Un hook de Git rechaza otros formatos y el CI los revisa de
   nuevo. Antes de cada commit, otro hook corre ESLint y Prettier sobre los archivos preparados.
4. **Un PR por issue, con `Closes #N` en inglés.** "Cierra #N" no cierra el issue. Un PR sin issue
   lleva `[sin-issue]`. El CI rechaza el PR si no tiene ninguno de los dos.
5. **`main` está protegida.** Solo entra por PR, con el CI en verde.
6. **Si el PR cumple un requisito, actualiza su estado** en `docs/requisitos.md` en el mismo PR.
7. **Cada integrante usa su propia identidad de Git** (`git config user.name` y `user.email`).
   El historial es la evidencia del aporte de cada uno.
8. **Antes de abrir el PR, corre `pnpm verify`.** Corre los comandos del job `checks` en el mismo
   orden, salvo commitlint (ver [calidad](docs/calidad.md)). Necesita el PostgreSQL de
   `docker compose up -d`.

Idioma: docs, issues y PR en español; código, identificadores y commits en inglés (D9 en
[decisiones](docs/decisiones.md)).

Los secretos viven solo en las plataformas y en tu `.env` local. El CI corre gitleaks en cada PR.

### Labels y milestones

- `type:` dice qué es el trabajo: `feat`, `bug`, `chore` o `docs`.
- `area:` dice qué pieza toca: `web`, `api`, `worker`, `datos` o `plataforma`. Coincide con los roles
  de la sección [Equipo](#equipo).
- Un milestone por entrega: **Corte 1** (30 oct), **Corte 2** (11 dic) y **Entrega final** (16 dic).
- No hay labels de estado. Un issue está abierto o cerrado; el avance de cada requisito vive en
  `docs/requisitos.md`.
- Los issues del corte siguiente existen desde el inicio como borrador. Sus criterios se refinan
  cuando cierra el corte anterior.

## CI

`.github/workflows/ci.yml` corre en cada PR y en cada push a `main`:

1. `checks`: instala con el lockfile, revisa los mensajes de commit, lint, typecheck, pruebas y build.
2. `docker`: valida `compose.yaml`, construye la imagen de la API, comprueba que no arranca sin
   `DATABASE_URL`, la arranca con PostgreSQL y exige que `/health` responda
   `{"status":"ok","database":"ok"}` en 30 s.
3. `secrets`: gitleaks revisa todo el historial.

`.github/workflows/pr.yml` corre en cada PR, también cuando editas su descripción:

4. `issue`: exige `Closes #N` o `[sin-issue]`.

Una prueba en `tooling/repo-contract` lee los workflows como texto. Falla si un job requerido
desaparece o cambia de nombre, si un comando de gate deja de correr, si un job queda solo con
pasos de preparación o si `pnpm verify` se separa de `checks`.

### Cobertura y dependencias

- `pnpm test` mide la cobertura de cada proyecto y falla si baja del piso. El piso está en
  `thresholds`, en `apps/api/vitest.config.ts` y en `apps/web/vite.config.ts`, con la fecha y el
  commit de la medición.
- Cuando tu PR sube la cobertura, sube también el piso a los números nuevos que imprime
  `pnpm test`. Nunca lo bajes para que el CI pase: escribe la prueba que falta.
- `checks` también corre `pnpm audit --prod --audit-level high` y falla si una dependencia de
  producción tiene una vulnerabilidad alta o crítica.
