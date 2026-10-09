# Monitor de caídas bancarias

A web app that shows where an interbank payment breaks in Venezuela: the source bank, the
destination bank, or the system that connects them. The data comes from user reports.

Integrative project for Cloud Computing (Computación en la Nube), UCAB, 2026.

## Architecture

```
Browser ──> Frontend (SvelteKit static, Vercel CDN)
               │
               ▼
            API (Fastify, Docker, Render) ── worker (interval in the same process)
               │                │
               ▼                ▼
        Upstash Redis     Supabase PostgreSQL
   (report stream, cache)  (source of truth)
```

| Piece       | Platform            | Service model |
| ----------- | ------------------- | ------------- |
| Frontend    | Vercel Hobby        | PaaS          |
| API, worker | Render (Docker)     | PaaS          |
| Database    | Supabase PostgreSQL | DBaaS         |
| Cache       | Upstash Redis       | DBaaS         |
| CI          | GitHub Actions      | SaaS          |

## Repository layout

```
apps/
  api/   Fastify API in TypeScript, packaged with Docker
  web/   SvelteKit frontend, built to static files
```

## Requirements

- Node.js 24 (see `.node-version`)
- pnpm 11 (`corepack enable` installs the version in `package.json`)
- Docker, to build the API image

## Getting started

```sh
pnpm install
cp .env.example .env   # fill in the values; never commit .env
pnpm dev               # API on :3000, frontend on :5173
```

## Scripts

| Command          | What it does                                       |
| ---------------- | -------------------------------------------------- |
| `pnpm dev`       | Runs the API and the frontend in watch mode        |
| `pnpm lint`      | ESLint and the Prettier check                      |
| `pnpm format`    | Formats every file with Prettier                   |
| `pnpm typecheck` | `tsc` for the API, `svelte-check` for the frontend |
| `pnpm test`      | Vitest                                             |
| `pnpm build`     | Compiles the API and builds the static frontend    |

Build and run the API image from the repository root:

```sh
docker build -f apps/api/Dockerfile -t mcb-api .
docker run --rm -p 3000:3000 mcb-api
curl localhost:3000/health   # {"status":"ok"}
```

## How we work

- Every change goes through a pull request to `main`. CI must pass before the merge.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org):
  `feat(api): accept bank reports`. A Git hook rejects other formats, and CI checks them again.
- Before each commit, a hook runs ESLint and Prettier on the staged files.
- Set your own Git identity (`git config user.name`, `git config user.email`), so the history
  shows each member's work.
- Secrets live only in the platform settings and in your local `.env`. CI runs gitleaks on every
  push.

## CI

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

1. `checks`: install with the lockfile, commit messages, lint, typecheck, tests, build.
2. `docker`: builds the API image.
3. `secrets`: gitleaks scans the full history.
