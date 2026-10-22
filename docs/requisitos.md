# Requisitos

Este registro conecta cada requisito con su fuente, su corte y el issue que lo cubre.
Es la única fuente del estado de un requisito: los issues no llevan labels de estado.

- **Fuentes.** `E#` sale del enunciado del profesor
  ([`enunciado/enunciado-proyecto-nube-ucab.pdf`](enunciado/enunciado-proyecto-nube-ucab.pdf));
  la columna Fuente da la página. `R#` sale de la [propuesta del equipo](propuesta.md).
- **Estado.** `pendiente`, `parcial` o `hecho`. Un requisito pasa a `hecho` cuando se fusiona
  el PR que lo cumple y la evidencia está enlazada.
- **Si el enunciado y este archivo no coinciden, gana el enunciado.** Corrige este archivo en un PR.

## Requisitos del enunciado

| ID  | Requisito                                                                                                          | Fuente     | Corte | Issues                                        | Estado    |
| --- | ------------------------------------------------------------------------------------------------------------------ | ---------- | ----- | --------------------------------------------- | --------- |
| E1  | Repositorio GitHub con historial activo, README, `.gitignore` y `.env.example`                                     | p. 3, p. 5 | 1     | #2, #68                                       | parcial   |
| E2  | URL pública funcional durante las revisiones; nada que dependa de localhost                                        | p. 3, p. 5 | 1     | #3, #8, #22, #68                              | parcial   |
| E3  | Diagrama de arquitectura con frontend, backend/API, persistencia, caché y servicios externos, actualizado          | p. 3, p. 5 | 1, 2  | #10, #47, #58                                 | parcial   |
| E4  | Problema, usuarios objetivo y alcance del MVP                                                                      | p. 5       | 1     | #11, #50, #52, #56                            | parcial   |
| E5  | Aplicación básica funcional: flujo frontend → backend/API → persistencia                                           | p. 5       | 1     | #4, #5, #7, #12, #15, #16, #19, #20, #21, #54 | hecho     |
| E6  | Docker en un componente clave, con explicación de imagen, contenedor, puertos, variables y ejecución               | p. 3, p. 5 | 1     | #8, #9, #19, #60                              | parcial   |
| E7  | Modelos de servicio cloud identificados y justificados                                                             | p. 5       | 1     | #10, #58                                      | parcial   |
| E8  | Base de datos administrada en la nube, adaptada al caso de uso y operativa en producción                           | p. 3, p. 5 | 1, 2  | #3, #4, #20, #39, #40, #59                    | parcial   |
| E9  | Caché implementada o justificación técnica de no usarla                                                            | p. 5       | 2     | #37, #59                                      | pendiente |
| E10 | CI/CD o automatización equivalente funcionando                                                                     | p. 3, p. 5 | 2     | #28, #41, #46, #60, #70, #71                  | parcial   |
| E11 | Secretos fuera del código; ninguna credencial en el repositorio                                                    | p. 3, p. 8 | 1     | #3, #20, #71                                  | parcial   |
| E12 | Logs, monitoreo de errores y estado del servicio visibles                                                          | p. 3, p. 5 | 2     | #42, #43, #44, #60                            | pendiente |
| E13 | Medidas mínimas de seguridad                                                                                       | p. 5       | 2     | #27, #30, #32, #46, #57, #70                  | parcial   |
| E14 | Análisis de cuellos de botella y propuesta ante demanda masiva                                                     | p. 3, p. 5 | 2     | #36, #39, #45, #58                            | pendiente |
| E15 | Infraestructura como código (opcional, bonificación)                                                               | p. 3       | Final | #60, #63, #64                                 | pendiente |
| E16 | Informe técnico final en PDF con las 16 secciones mínimas                                                          | p. 6       | Final | #55, #56, #57, #58, #59, #60, #61, #62, #68   | pendiente |
| E17 | Demostración en vivo sobre la versión desplegada y defensa de 20 minutos                                           | p. 7       | Final | #13, #48, #65, #66, #67, #68                  | pendiente |
| E18 | Participación verificable de todos: historial, revisiones y respuestas individuales (60 % equipo, 40 % individual) | p. 5, p. 7 | Todos | #2, #13, #48, #50, #61, #67, #68              | parcial   |

Evidencia de lo que ya está `parcial` o `hecho`:

- **E1.** README, `.gitignore` y `.env.example` existen, y los cinco integrantes tienen commits fusionados (#2).
  Falta revisarlo con el checklist de la entrega final (#68).
- **E2.** El frontend está en https://monitor-caidas-bancarias.vercel.app y la API en
  https://monitor-caidas-bancarias.onrender.com (README, #8, #22). El 22-10-2026 un reporte enviado desde un teléfono
  apareció en la pantalla de estado. Falta el checklist de la entrega final (#68).
- **E3.** [`arquitectura.md`](arquitectura.md) tiene el diagrama con frontend, API, persistencia, caché y servicios
  externos, y cómo se comunica cada componente (#10). Falta mantenerlo actualizado en el Corte 2 (#47) y en el informe (#58).
- **E4.** [`propuesta.md`](propuesta.md) presenta el problema, los usuarios objetivo y el alcance del MVP (#11), y el
  equipo la aprobó (#50). Sus datos tienen fuente (#52). Falta llevarlo al informe (#56).
- **E5.** La persistencia existe: las tablas `banks` y `reports` salen de una migración versionada, y la
  semilla carga los 10 bancos del MVP ([`datos.md`](datos.md), #4). El formulario envía el reporte a
  `POST /reports` (#16), la API lo guarda en PostgreSQL (#5), el worker recalcula el estado de cada par cada
  30 segundos (#21) y la pantalla de estado lo muestra con `GET /status` (#7). El PR del formulario (#103) lo
  probó de punta a punta contra PostgreSQL local. La URL pública es E2.
- **E6.** `apps/api/Dockerfile` existe; el CI construye la imagen, la arranca y exige que `/health` responda
  (#80). `compose.yaml` levanta PostgreSQL y Redis en local (#19, #54). [`contenedor.md`](contenedor.md) explica la imagen, el contenedor, el puerto, las variables y la ejecución (#9). Render corre esa imagen en producción (#8). Falta llevarlo al informe (#60).
- **E7.** [`arquitectura.md`](arquitectura.md) da el modelo de servicio de cada pieza (PaaS, DBaaS, SaaS) y por qué
  (#10). Falta llevarlo al informe (#58).
- **E8.** El esquema está adaptado al caso de uso: llaves foráneas a los bancos, tipos de falla cerrados e
  índice para la ventana de 15 minutos ([`datos.md`](datos.md), #4). La migración corre en Supabase y la API la usa en
  producción desde el 22-10-2026 (#8). Faltan los totales por hora con la purga a los 30 días (#39), el respaldo (#40)
  y llevarlo al informe (#59).
- **E10.** El CI corre lint, typecheck, pruebas, build de Docker y gitleaks en cada PR. Las pruebas cubren la API y el
  frontend, y `pnpm test` falla si un proyecto no tiene ninguna (#78) o si su cobertura baja del piso medido (#70).
  Render despliega `main` cuando pasa el CI, y Vercel despliega `main` y una vista previa por PR (#8, #22). Falta que el
  pipeline pruebe `/health` después de cada despliegue y que el README lo describa (#41).
- **E11.** Solo se versiona `.env.example`, y gitleaks revisa el historial en cada PR. La API lee `DATABASE_URL`
  del entorno y no arranca sin ella (#20).
- **E13.** El CI falla si una dependencia de producción tiene una vulnerabilidad alta o crítica (`pnpm audit`, #70).
  La API rechaza un reporte con campos de más o con valores fuera de las listas (#5). Faltan los límites y
  las cabeceras.

### Prácticas no aceptables (p. 8)

Estas reglas aplican siempre y no tienen issue propio:

- Presentar como producción algo que solo funciona en localhost.
- Versionar contraseñas, tokens, llaves privadas u otros secretos reales.
- Subir el proyecto en uno o pocos commits al final.
- Incluir tecnologías que el equipo no pueda explicar.
- Presentar código, documentación o infraestructura de terceros sin reconocer su origen.
- Preparar solo una demo visual sin poder mostrar despliegue, repositorio y componentes.

## Requisitos del producto

| ID  | Requisito                                                                                                                                    | Corte | Issues                                   | Estado    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------- | --------- |
| R1  | Estado por par de bancos (origen → destino): normal, posibles problemas o muchos reportes, comparando los últimos 15 minutos con lo habitual | 1, 2  | #4, #6, #7, #12, #15, #18, #21, #33, #37 | parcial   |
| R2  | Reportar en un toque y sin cuenta: banco de origen, banco de destino y qué pasó; máximo un reporte por dispositivo, par y 15 minutos         | 1, 2  | #4, #5, #15, #16, #18, #30               | parcial   |
| R3  | Detalle por banco: reportes de las últimas 24 horas como origen y como destino, y los pares más afectados                                    | 2     | #18, #25, #29                            | parcial   |
| R4  | Nunca decir "el banco está caído"; decir "N personas reportan problemas con … en los últimos 15 minutos"                                     | 1     | #6, #7, #15                              | hecho     |
| R5  | Frenar el abuso: límite por dispositivo e IP, CAPTCHA invisible y respuesta 429                                                              | 2     | #27, #30                                 | pendiente |
| R6  | Seguir funcionando si cae PostgreSQL, Redis, el worker o el CAPTCHA (plan de la sección 7 de la [propuesta](propuesta.md))                   | 2     | #26, #38, #54                            | parcial   |
| R7  | Responder "¿dónde se rompe este pago?" en menos de 5 segundos, en un teléfono con mala señal                                                 | 1     | #7, #16, #18                             | parcial   |
| R8  | Quincena simulada con k6: de 5 a 500 lecturas y 50 reportes por segundo en 10 minutos, con un banco caído                                    | 2     | #45, #66                                 | pendiente |

Fuera del MVP: cuentas de usuario, comentarios, aplicación móvil nativa, alertas por Telegram (D11)
y sondeo automático de los servidores de los bancos.
