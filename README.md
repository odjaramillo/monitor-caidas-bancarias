# Monitor de caídas bancarias

Aplicación web que muestra dónde se rompe un pago entre bancos en Venezuela: el banco de origen,
el de destino o el sistema que los conecta. La información sale de reportes de los usuarios.

Proyecto integrador de Computación en la Nube (INFO-02028), UCAB, 2026.

## Documentos

| Documento                                                    | Qué tiene                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| [Enunciado](docs/enunciado/enunciado-proyecto-nube-ucab.pdf) | El enunciado oficial del profesor                            |
| [Requisitos](docs/requisitos.md)                             | Cada requisito con su fuente, su corte, su issue y su estado |
| [Decisiones](docs/decisiones.md)                             | Qué se eligió, por qué y qué se descartó                     |

## Arquitectura

```
Navegador ──> Frontend (SvelteKit estático, CDN de Vercel)
                 │
                 ▼
              API (Fastify, Docker, Render) ── worker (intervalo en el mismo proceso)
                 │                │
                 ▼                ▼
          Upstash Redis     Supabase PostgreSQL
     (stream, caché, límites)  (fuente de verdad)
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
docs/    Enunciado, requisitos y decisiones
```

## Requisitos para desarrollar

- Node.js 24 (ver `.node-version`)
- pnpm 11 (`corepack enable` instala la versión de `package.json`)
- Docker, para construir la imagen de la API

## Cómo empezar

```sh
pnpm install
cp .env.example .env   # llena los valores; nunca subas .env
pnpm dev               # API en :3000, frontend en :5173
```

## Scripts

| Comando          | Qué hace                                           |
| ---------------- | -------------------------------------------------- |
| `pnpm dev`       | Corre la API y el frontend y recarga al guardar    |
| `pnpm lint`      | ESLint y la revisión de formato de Prettier        |
| `pnpm format`    | Formatea todos los archivos con Prettier           |
| `pnpm typecheck` | `tsc` para la API, `svelte-check` para el frontend |
| `pnpm test`      | Vitest                                             |
| `pnpm build`     | Compila la API y genera el frontend estático       |

Para construir y correr la imagen de la API desde la raíz del repositorio:

```sh
docker build -f apps/api/Dockerfile -t mcb-api .
docker run --rm -p 3000:3000 mcb-api
curl localhost:3000/health   # {"status":"ok"}
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

Idioma: docs, issues y PR en español; código, identificadores y commits en inglés (D9 en
[decisiones](docs/decisiones.md)).

Los secretos viven solo en las plataformas y en tu `.env` local. El CI corre gitleaks en cada PR.

### Labels y milestones

- `type:` dice qué es el trabajo: `feat`, `bug`, `chore` o `docs`.
- `area:` dice qué pieza toca: `web`, `api`, `worker`, `datos` o `plataforma`. Coincide con los roles
  del equipo.
- Un milestone por entrega: **Corte 1** (30 oct), **Corte 2** (11 dic) y **Entrega final** (16 dic).
- No hay labels de estado. Un issue está abierto o cerrado; el avance de cada requisito vive en
  `docs/requisitos.md`.
- Los issues de un corte se crean cuando cierra el anterior, no todos por adelantado.

## CI

`.github/workflows/ci.yml` corre en cada PR y en cada push a `main`:

1. `checks`: instala con el lockfile, revisa los mensajes de commit, lint, typecheck, pruebas y build.
2. `docker`: construye la imagen de la API.
3. `secrets`: gitleaks revisa todo el historial.

`.github/workflows/pr.yml` corre en cada PR, también cuando editas su descripción:

4. `issue`: exige `Closes #N` o `[sin-issue]`.
