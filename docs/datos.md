# Datos

Qué guarda cada tabla de PostgreSQL y qué componente tiene estado. PostgreSQL es la fuente de
verdad ([arquitectura](arquitectura.md)); el esquema sale de las migraciones en
[`apps/api/migrations`](../apps/api/migrations) (D18).

## Tablas

### `banks`

Los bancos del MVP. Es una lista cerrada: la misma de [`api.md`](api.md), con los mismos `id`.

| Columna | Tipo   | Qué guarda                                       |
| ------- | ------ | ------------------------------------------------ |
| `id`    | `text` | Identificador fijo en minúsculas, como `banesco` |
| `name`  | `text` | Nombre que ve la persona, como `Banesco`         |

La migración que crea la tabla también carga los 10 bancos. Agregar un banco es una migración nueva.

### `reports`

Un reporte por cada persona que avisa que un pago falló. Es lo único que crece con el uso.

| Columna       | Tipo          | Qué guarda                                                                      |
| ------------- | ------------- | ------------------------------------------------------------------------------- |
| `id`          | `bigint`      | Número que asigna PostgreSQL (`generated always as identity`)                   |
| `origin`      | `text`        | Banco de origen. Llave foránea a `banks`                                        |
| `destination` | `text`        | Banco de destino. Llave foránea a `banks`. Puede ser el mismo banco de `origin` |
| `type`        | `text`        | Tipo de falla: `no_sale`, `sale_no_llega`, `error_app` o `punto_de_venta`       |
| `created_at`  | `timestamptz` | Hora en que llegó el reporte, con zona horaria. La pone PostgreSQL con `now()`  |

- Las llaves foráneas y el `check` de `type` hacen que la base rechace un banco o un tipo que no
  existe, aunque la API tenga un error.
- El índice `reports_created_at_idx` sirve para la consulta que más se repite: el worker (#6, #21)
  cuenta los reportes de los últimos 15 minutos en cada pasada.

## Qué tiene estado

| Componente | ¿Tiene estado? | Qué pasa si se reinicia o se pierde                                           |
| ---------- | -------------- | ----------------------------------------------------------------------------- |
| PostgreSQL | Sí             | Es la fuente de verdad. Supabase lo respalda; el plan de recuperación es #40  |
| Redis      | Temporal       | Stream, caché y límites (Corte 2). Todo se puede reconstruir desde PostgreSQL |
| API/worker | No             | Se reinicia sin perder nada: lo que necesita lo lee de PostgreSQL o de Redis  |
| Frontend   | No             | Son archivos estáticos                                                        |

## Cómo aplicar el esquema

Desde la raíz del repositorio, con la base de `compose.yaml` arriba y `DATABASE_URL` en `.env`:

```sh
pnpm --filter api migrate up                              # crea las tablas y carga los bancos
docker compose exec postgres psql -U mcb -d mcb -c '\d reports'
```

`pnpm test` aplica las migraciones antes de las pruebas, y `src/schema.test.ts` comprueba los
bancos, las llaves foráneas, el `check` de `type` y el índice.

Fuera de este esquema, para el Corte 2: totales por hora y borrado de los reportes crudos a los 30
días (#39).
