# Migraciones

Cada cambio del esquema de PostgreSQL es un archivo SQL versionado en esta carpeta (D18). La
herramienta es [node-pg-migrate](https://salsita.github.io/node-pg-migrate/): aplica los archivos en
orden y guarda en la tabla `pgmigrations` cuáles ya corrió.

Desde la raíz del repositorio, con `DATABASE_URL` en `.env`:

```sh
pnpm --filter api migrate create create-banks-and-reports -j sql   # crea un archivo nuevo
pnpm --filter api migrate up                                       # aplica los pendientes
pnpm --filter api migrate down                                     # deshace el último
```

- Un archivo SQL tiene dos secciones: `-- Up Migration` y `-- Down Migration`.
- Una migración fusionada en `main` no se edita: el cambio va en una migración nueva.
- `pnpm test` aplica las migraciones a la base local antes de correr las pruebas
  (`src/testing/global-setup.ts`).
