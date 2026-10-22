# Arquitectura

Un monolito con un worker: la API y el worker corren en el mismo proceso, dentro de un solo
contenedor (D1). No hay Kubernetes ni microservicios. Este documento muestra cada componente, cómo
se comunica con los demás y qué modelo de servicio usa. La justificación de cada elección está en
la [propuesta](propuesta.md) y en las [decisiones](decisiones.md). Los reportes no pasan por un
stream de Redis (D21).

## Diagrama

```mermaid
flowchart LR
  subgraph R1[Render · un contenedor Docker]
    A[API<br/>Fastify]
    W[Worker<br/>intervalo en el mismo proceso]
  end
  U[Usuario<br/>navegador] -->|HTTPS| F[Frontend<br/>SvelteKit estático<br/>Vercel · CDN]
  U -->|HTTPS · JSON| A
  U -.->|token del CAPTCHA| T[Cloudflare Turnstile]
  A -->|protocolo Redis · TLS| R[(Upstash Redis<br/>caché · límites)]
  A -->|protocolo PostgreSQL · TLS| P[(Supabase PostgreSQL<br/>fuente de verdad)]
  W -->|protocolo Redis · TLS| R
  W -->|protocolo PostgreSQL · TLS| P
  A -.->|verifica el token| T
  A -.->|errores| S[Sentry]
  B[Better Stack] -.->|GET /health cada 30 s| A
  G[GitHub Actions<br/>CI/CD] -.->|despliegue| R1
```

Figura 1. Las líneas continuas son el tráfico de la aplicación. Las punteadas son servicios
externos y el despliegue. Supabase, Upstash y el servicio de Render están en la
misma región, Oregon (`us-west-2`), para que cada consulta de la API a sus datos no cruce el país.

El navegador descarga el frontend desde la CDN de Vercel y después llama a la API directamente. El
frontend no tiene servidor propio: son archivos estáticos (D3).

## Componentes

| Componente            | Qué hace                                                                                                           | Con quién se comunica y cómo                                                                                                           | Hoy                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Frontend              | Muestra el estado de cada par de bancos, el formulario de reporte y el detalle por banco                           | El navegador lo descarga de Vercel por HTTPS y desde ahí llama a la API con JSON                                                       | Estado y reporte (#7, #16). Falta el detalle (#25) |
| API                   | Recibe reportes, los valida, frena el abuso y sirve el estado                                                      | Recibe HTTPS del navegador. Escribe los reportes en PostgreSQL y lee el estado de la caché de Redis. Verifica el CAPTCHA con Turnstile | `/reports` y `/status` (#5, #21)                   |
| Worker                | Recalcula el nivel de cada par de bancos desde PostgreSQL y lo escribe en la caché de Redis                        | Corre dentro del proceso de la API. Lee y escribe en Redis y en PostgreSQL                                                             | Estado en memoria cada 30 s (#6, #21)              |
| PostgreSQL (Supabase) | Fuente de verdad: bancos, reportes y totales por hora                                                              | Solo la API y el worker se conectan, con una URL de conexión que vive en las variables de Render                                       | Migrada y en producción (#8)                       |
| Redis (Upstash)       | Estado temporal: caché del estado con 30 s de vida y contadores de límites                                         | Solo la API y el worker se conectan, con TLS. Todo lo que guarda se puede reconstruir desde PostgreSQL                                 | Base creada (#30, #37)                             |
| Cloudflare Turnstile  | CAPTCHA invisible contra bots                                                                                      | El navegador obtiene un token; la API lo verifica contra Cloudflare antes de aceptar el reporte                                        | Corte 2 (#27)                                      |
| Sentry                | Guarda los errores de la API con su contexto                                                                       | La API le envía cada error por HTTPS                                                                                                   | Corte 2 (#42)                                      |
| Better Stack          | Monitorea que la API responda y la mantiene despierta (D5)                                                         | Llama a `GET /health` cada 30 s                                                                                                        | Corte 2 (#43)                                      |
| GitHub Actions        | CI en cada PR: lint, tipos, pruebas, build y arranque de la imagen, secretos y auditoría. CD al fusionar en `main` | Lee el repositorio. El despliegue automático a Render llega con #41                                                                    | CI activo; CD en #41                               |

La API y el worker no guardan estado propio: si el contenedor se reinicia, no se pierde nada. El
estado vive en PostgreSQL y, de forma temporal, en Redis.

## Los tres flujos

**Enviar un reporte.** El navegador envía `POST /reports` con el token del CAPTCHA. La API verifica
el token, revisa el límite por dispositivo e IP en Redis y guarda el reporte en PostgreSQL. Un stream
de Redis delante de PostgreSQL queda como siguiente paso del análisis de escalabilidad (D21, #36).

**Calcular el estado.** El worker lee los reportes de PostgreSQL y recalcula el nivel de cada par de
bancos. Después lo escribe en la caché de Redis.

**Ver el estado.** El navegador pide `GET /status`. La API responde desde la caché de Redis, sin
consultar PostgreSQL.

Si Redis cae, la API sigue guardando en PostgreSQL con un límite más estricto (modo degradado, #38).
El plan de cada falla está en la sección 7 de la [propuesta](propuesta.md).

## Modelos de servicio

Ninguna pieza usa IaaS (infraestructura como servicio): nadie del equipo administra un servidor, un
sistema operativo ni una red. Cada plataforma se encarga de eso, y el equipo solo entrega código,
una imagen o datos.

| Pieza               | Plataforma            | Modelo | Qué administra la plataforma                                   | Qué administra el equipo                  | Por qué este modelo                                                                         |
| ------------------- | --------------------- | ------ | -------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| Frontend            | Vercel Hobby          | PaaS   | Build, CDN, HTTPS y dominio                                    | El código de SvelteKit                    | Archivos estáticos servidos desde la CDN aguantan un pico de lecturas sin ejecutar código   |
| API y worker        | Render (Docker)       | PaaS   | Servidor, red, HTTPS, reinicios y logs                         | El Dockerfile, el código y las variables  | Corre nuestra imagen sin administrar una máquina; el plan gratuito cubre un servicio        |
| Base de datos       | Supabase PostgreSQL   | DBaaS  | Instalación, respaldos, parches y disponibilidad de PostgreSQL | El esquema, las consultas y los datos     | Una base relacional administrada y gratuita para la fuente de verdad                        |
| Caché y límites     | Upstash Redis         | DBaaS  | Servidor de Redis, persistencia y TLS                          | Qué llaves se guardan y su tiempo de vida | Cobra por comando, así que sin tráfico no consume; no hay un servidor de Redis que mantener |
| CAPTCHA             | Cloudflare Turnstile  | SaaS   | Todo el servicio                                               | La clave del sitio y la verificación      | Construir un CAPTCHA propio no tiene sentido para el problema                               |
| Errores y monitoreo | Sentry y Better Stack | SaaS   | Todo el servicio                                               | Qué se envía y qué alerta                 | Usar el producto listo cuesta $0 en sus planes gratuitos                                    |
| CI/CD               | GitHub Actions        | SaaS   | Las máquinas que corren cada job                               | Los workflows en `.github/workflows/`     | Gratis en un repositorio público, junto al código (D6)                                      |

PaaS: plataforma como servicio. DBaaS: base de datos como servicio. SaaS: software como servicio.
Los límites de cada plan gratuito están en la sección 8 de la [propuesta](propuesta.md).
