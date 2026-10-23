# Contrato de la API

Qué entra y qué sale de cada endpoint de la API. El frontend (#7, #16), la API (#5, #20) y el
worker (#6, #21) programan contra este documento, así nadie espera a que otro termine.

- **Si el código y este documento no coinciden, el código está mal.** Un cambio del contrato entra
  en un PR que edita este archivo antes que el código.
- Todas las rutas reciben y devuelven JSON (`Content-Type: application/json`).
- Las fechas van en ISO 8601 y en UTC, por ejemplo `2026-10-28T14:05:30.000Z`. El frontend las
  muestra en la hora de Venezuela.
- Los identificadores (bancos, tipos de falla, niveles) son texto fijo en minúsculas. Los textos
  para personas van en español.
- El frontend copia las listas cerradas en `apps/web/src/lib/`. Un PR que cambie una lista aquí
  cambia también esa copia.

| Método | Ruta       | Para qué                                       | Issue   |
| ------ | ---------- | ---------------------------------------------- | ------- |
| `POST` | `/reports` | Guardar un reporte de una persona              | #5      |
| `GET`  | `/status`  | Leer el nivel de cada par de bancos            | #6, #21 |
| `GET`  | `/health`  | Saber si la API y la base de datos están vivas | #20     |

## Listas cerradas

Todo lo demás usa estas listas. El esquema de datos (#4) y la semilla de bancos usan los mismos
identificadores.

### Bancos del MVP

| `id`         | Nombre                            |
| ------------ | --------------------------------- |
| `venezuela`  | Banco de Venezuela                |
| `banesco`    | Banesco                           |
| `mercantil`  | Mercantil                         |
| `provincial` | BBVA Provincial                   |
| `bnc`        | Banco Nacional de Crédito         |
| `bancamiga`  | Bancamiga                         |
| `bdt`        | Banco Digital de los Trabajadores |
| `bancaribe`  | Bancaribe                         |
| `exterior`   | Banco Exterior                    |
| `plaza`      | Banco Plaza                       |

Son 10 bancos, así que hay 100 pares origen → destino. El par de un banco consigo mismo cuenta: una
transferencia de Banesco a Banesco también puede fallar.

### Tipos de falla

| `type`           | Qué ve la persona                                  |
| ---------------- | -------------------------------------------------- |
| `no_sale`        | El pago no sale: el banco de origen lo rechaza     |
| `sale_no_llega`  | El pago sale de mi cuenta pero no llega al destino |
| `error_app`      | La app o la web del banco da error o no abre       |
| `punto_de_venta` | El punto de venta rechaza la tarjeta o no responde |

### Niveles de un par

| `level`              | Qué muestra la pantalla |
| -------------------- | ----------------------- |
| `normal`             | Normal                  |
| `posibles_problemas` | Posibles problemas      |
| `muchos_reportes`    | Muchos reportes         |

El umbral que separa un nivel de otro lo decide el worker (#6, #33) y no forma parte del contrato:
puede cambiar sin tocar el frontend. Sobre el conteo de 15 minutos, los umbrales fijos son: 0
reportes es `normal`, de 1 a 4 es `posibles_problemas` y 5 o más es `muchos_reportes` (decisión D19
en [`decisiones.md`](decisiones.md)). Cuando el par tiene historial suficiente, además compara con su
línea base por hora (decisión D20): el promedio de reportes por ventana de 15 minutos a esa hora del
día (hora de Venezuela, UTC-4) en los últimos 14 días, con reportes en al menos 3 días distintos a
esa hora. Con línea base, un par pasa a `posibles_problemas` solo si supera el umbral fijo y llega a 2
veces su línea base, y a `muchos_reportes` solo si supera el fijo y llega a 4 veces. Con historial
corto se usan solo los umbrales fijos. El texto de `message` no cambia: solo cuenta personas (R4).

## Errores

Todas las respuestas de error tienen la misma forma, que es la de Fastify:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "body/type must be equal to one of the allowed values"
}
```

- `statusCode` repite el código HTTP.
- `message` explica qué falló. Sirve para el log y para depurar; el frontend no lo muestra tal cual.
- Fastify puede agregar `code` (por ejemplo `FST_ERR_VALIDATION`). El frontend no depende de él.

| Código | Cuándo                                                                                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | El cuerpo no cumple el esquema o nombra un banco que no existe                                                                                                  |
| `404`  | La ruta no existe                                                                                                                                               |
| `429`  | Límite de reportes por dispositivo e IP (Corte 2, #30). Incluye la cabecera `Retry-After` con los segundos que faltan, para que el frontend diga cuánto esperar |
| `500`  | Error inesperado de la API                                                                                                                                      |
| `503`  | La base de datos no responde, o el estado todavía no se ha calculado                                                                                            |

## CORS

El frontend vive en otro dominio (Vercel), así que el navegador pide permiso antes de llamar a la
API.

- La API solo acepta el origen que dice la variable `CORS_ORIGIN`, por ejemplo la URL de Vercel. Sin
  esa variable, CORS queda apagado y el navegador bloquea las llamadas desde otro dominio.
- Antes de cada `POST /reports` con `Content-Type: application/json`, el navegador manda una
  petición `OPTIONS` (preflight). La API la responde con `204` y las cabeceras
  `Access-Control-Allow-Origin` y `Access-Control-Allow-Methods`. Lo hace `@fastify/cors`, registrado
  en `apps/api/src/app.ts`.
- Todas las respuestas llevan `Access-Control-Allow-Origin` con el valor de `CORS_ORIGIN`. Si la
  llamada viene de otro dominio, ese valor no coincide y el navegador descarta la respuesta.
- El navegador no deja leer `Retry-After` por defecto, así que la API también debe exponerla con la
  opción `exposedHeaders` de `@fastify/cors`; ese cambio llega con #30, junto con el `429`.
- CORS lo aplica el navegador: no frena a un script o a `curl`. Contra el abuso están los límites
  del Corte 2 (#30).
- Las pruebas de estas reglas están en `apps/api/src/cors.test.ts`.

## `POST /reports`

Guarda un reporte. No pide cuenta ni token (R2).

### Petición

```json
{
  "origin": "banesco",
  "destination": "mercantil",
  "type": "sale_no_llega"
}
```

| Campo         | Tipo  | Regla                                        |
| ------------- | ----- | -------------------------------------------- |
| `origin`      | texto | Obligatorio. Un `id` de la lista de bancos   |
| `destination` | texto | Obligatorio. Un `id` de la lista de bancos   |
| `type`        | texto | Obligatorio. Un `type` de la lista de fallas |

No se aceptan campos de más: un cuerpo con otro campo devuelve `400`.

### Respuesta `201 Created`

El reporte guardado, con su identificador y la hora en que la API lo recibió:

```json
{
  "id": 1834,
  "origin": "banesco",
  "destination": "mercantil",
  "type": "sale_no_llega",
  "createdAt": "2026-10-28T14:05:12.483Z"
}
```

### Respuestas de error

`400`: tipo de falla inválido.

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "body/type must be equal to one of the allowed values"
}
```

`400`: banco que no existe.

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Unknown bank in origin or destination"
}
```

`400`: falta un campo.

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "body must have required property 'destination'"
}
```

`503`: la base de datos no responde. El frontend pide intentarlo de nuevo en unos segundos.

## `GET /status`

El nivel de cada par de bancos, calculado con los reportes de los últimos 15 minutos (R1). El
worker lo recalcula cada cierto tiempo (#21); esta ruta devuelve el último cálculo y no consulta la
base de datos.

### Respuesta `200 OK`

```json
{
  "updatedAt": "2026-10-28T14:05:30.000Z",
  "windowMinutes": 15,
  "pairs": [
    {
      "origin": "banesco",
      "destination": "mercantil",
      "level": "muchos_reportes",
      "reports": 12,
      "message": "12 personas reportan problemas con pagos de Banesco a Mercantil en los últimos 15 minutos"
    },
    {
      "origin": "venezuela",
      "destination": "banesco",
      "level": "posibles_problemas",
      "reports": 1,
      "message": "1 persona reporta problemas con pagos de Banco de Venezuela a Banesco en los últimos 15 minutos"
    },
    {
      "origin": "mercantil",
      "destination": "provincial",
      "level": "normal",
      "reports": 0,
      "message": "Sin reportes en los últimos 15 minutos"
    }
  ]
}
```

| Campo                 | Qué es                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `updatedAt`           | Hora del último cálculo. El frontend avisa si es vieja (#26, Corte 2)                                                                                                                       |
| `windowMinutes`       | Tamaño de la ventana que se contó, en minutos                                                                                                                                               |
| `pairs`               | Los 100 pares, de más a menos reportes. Si dos tienen los mismos, por `origin` y luego por `destination`, en orden alfabético del `id`, para que la lista no cambie de orden entre recargas |
| `pairs[].origin`      | `id` del banco de origen                                                                                                                                                                    |
| `pairs[].destination` | `id` del banco de destino                                                                                                                                                                   |
| `pairs[].level`       | Un `level` de la lista de niveles                                                                                                                                                           |
| `pairs[].reports`     | Reportes del par en la ventana                                                                                                                                                              |
| `pairs[].message`     | El texto que muestra la pantalla, tal cual                                                                                                                                                  |

### El texto de `message` (R4)

La aplicación **nunca dice que un banco está caído**: solo cuenta reportes. El texto depende solo del
número de reportes, no del nivel:

| `reports` | `message`                                                                                   |
| --------- | ------------------------------------------------------------------------------------------- |
| `0`       | `Sin reportes en los últimos 15 minutos`                                                    |
| `1`       | `1 persona reporta problemas con pagos de {origen} a {destino} en los últimos 15 minutos`   |
| `N > 1`   | `N personas reportan problemas con pagos de {origen} a {destino} en los últimos 15 minutos` |

`{origen}` y `{destino}` son los nombres de la lista de bancos, no los `id`.

### Respuesta `503 Service Unavailable`

Solo justo después de arrancar, antes de que termine el primer cálculo:

```json
{
  "statusCode": 503,
  "error": "Service Unavailable",
  "message": "Status has not been computed yet"
}
```

## `GET /health`

Lo llaman el monitor de disponibilidad (#43), el chequeo de Render (#8), el CI y la prueba después
del despliegue (#41). Hace una consulta mínima a PostgreSQL (`select 1`) para saber si la base
responde.

### Respuesta `200 OK`

```json
{ "status": "ok", "database": "ok" }
```

En Render, la respuesta trae además el campo `commit`: el SHA completo del commit desplegado, que
Render pone en la variable `RENDER_GIT_COMMIT`. Fuera de Render la variable no existe y el campo no
aparece.

```json
{ "status": "ok", "database": "ok", "commit": "7c10c71a2b3c4d5e6f708192a3b4c5d6e7f80912" }
```

El job `deploy` del CI compara `commit` con el commit fusionado. Así distingue la versión
nueva de la anterior, que Render mantiene viva hasta que la nueva arranca.

### Respuesta `503 Service Unavailable`

La API está viva pero la base de datos no responde:

```json
{ "status": "error", "database": "unreachable" }
```
