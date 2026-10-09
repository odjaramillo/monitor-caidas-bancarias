# Requisitos

Este registro conecta cada requisito con su fuente, su corte y el issue que lo cubre.
Es la única fuente del estado de un requisito: los issues no llevan labels de estado.

- **Fuentes.** `E#` sale del enunciado del profesor
  ([`enunciado/enunciado-proyecto-nube-ucab.pdf`](enunciado/enunciado-proyecto-nube-ucab.pdf));
  la columna Fuente da la página. `R#` sale de la propuesta del equipo.
- **Estado.** `pendiente`, `parcial` o `hecho`. Un requisito pasa a `hecho` cuando se fusiona
  el PR que lo cumple y la evidencia está enlazada.
- **Si el enunciado y este archivo no coinciden, gana el enunciado.** Corrige este archivo en un PR.

## Requisitos del enunciado

| ID  | Requisito                                                                                                          | Fuente     | Corte | Issues                                   | Estado    |
| --- | ------------------------------------------------------------------------------------------------------------------ | ---------- | ----- | ---------------------------------------- | --------- |
| E1  | Repositorio GitHub con historial activo, README, `.gitignore` y `.env.example`                                     | p. 3, p. 5 | 1     | #2                                       | parcial   |
| E2  | URL pública funcional durante las revisiones; nada que dependa de localhost                                        | p. 3, p. 5 | 1     | #3, #8, #22                              | pendiente |
| E3  | Diagrama de arquitectura con frontend, backend/API, persistencia, caché y servicios externos, actualizado          | p. 3, p. 5 | 1, 2  | #10, #47                                 | pendiente |
| E4  | Problema, usuarios objetivo y alcance del MVP                                                                      | p. 5       | 1     | #11, #24                                 | pendiente |
| E5  | Aplicación básica funcional: flujo frontend → backend/API → persistencia                                           | p. 5       | 1     | #4, #5, #7, #12, #15, #16, #19, #20, #21 | pendiente |
| E6  | Docker en un componente clave, con explicación de imagen, contenedor, puertos, variables y ejecución               | p. 3, p. 5 | 1     | #8, #9, #19                              | parcial   |
| E7  | Modelos de servicio cloud identificados y justificados                                                             | p. 5       | 1     | #10                                      | pendiente |
| E8  | Base de datos administrada en la nube, adaptada al caso de uso y operativa en producción                           | p. 3, p. 5 | 1, 2  | #3, #4, #20, #39, #40                    | pendiente |
| E9  | Caché implementada o justificación técnica de no usarla                                                            | p. 5       | 2     | #37                                      | pendiente |
| E10 | CI/CD o automatización equivalente funcionando                                                                     | p. 3, p. 5 | 2     | #28, #41, #46                            | parcial   |
| E11 | Secretos fuera del código; ninguna credencial en el repositorio                                                    | p. 3, p. 8 | 1     | #3, #20                                  | parcial   |
| E12 | Logs, monitoreo de errores y estado del servicio visibles                                                          | p. 3, p. 5 | 2     | #42, #43, #44                            | pendiente |
| E13 | Medidas mínimas de seguridad                                                                                       | p. 5       | 2     | #27, #30, #32, #46                       | pendiente |
| E14 | Análisis de cuellos de botella y propuesta ante demanda masiva                                                     | p. 3, p. 5 | 2     | #31, #34, #36, #39, #45                  | pendiente |
| E15 | Infraestructura como código (opcional, bonificación)                                                               | p. 3       | Final | —                                        | pendiente |
| E16 | Informe técnico final en PDF con las 16 secciones mínimas                                                          | p. 6       | Final | —                                        | pendiente |
| E17 | Demostración en vivo sobre la versión desplegada y defensa de 20 minutos                                           | p. 7       | Final | #13, #48                                 | pendiente |
| E18 | Participación verificable de todos: historial, revisiones y respuestas individuales (60 % equipo, 40 % individual) | p. 5, p. 7 | Todos | #2, #13, #48                             | pendiente |

Evidencia de lo que ya está `parcial`:

- **E1.** README, `.gitignore` y `.env.example` existen. Falta el aporte de todos (#2).
- **E6.** `apps/api/Dockerfile` existe y el CI lo construye. Faltan el despliegue (#8) y la explicación (#9).
- **E10.** El CI corre lint, typecheck, pruebas, build de Docker y gitleaks en cada PR. Falta el despliegue automático.
- **E11.** Solo se versiona `.env.example`, y gitleaks revisa el historial en cada PR.

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
| R1  | Estado por par de bancos (origen → destino): normal, posibles problemas o muchos reportes, comparando los últimos 15 minutos con lo habitual | 1, 2  | #4, #6, #7, #12, #15, #18, #21, #33, #37 | pendiente |
| R2  | Reportar en un toque y sin cuenta: banco de origen, banco de destino y qué pasó; máximo un reporte por dispositivo, par y 15 minutos         | 1, 2  | #4, #5, #15, #16, #18, #30               | pendiente |
| R3  | Detalle por banco: reportes de las últimas 24 horas como origen y como destino, y los pares más afectados                                    | 2     | #18, #25, #29                            | pendiente |
| R4  | Nunca decir "el banco está caído"; decir "N personas reportan problemas con … en los últimos 15 minutos"                                     | 1     | #6, #7, #15                              | pendiente |
| R5  | Frenar el abuso: límite por dispositivo e IP, CAPTCHA invisible y respuesta 429                                                              | 2     | #27, #30                                 | pendiente |
| R6  | Seguir funcionando si cae PostgreSQL, Redis, el worker o el CAPTCHA (plan de la sección 7 de la propuesta)                                   | 2     | #26, #31, #34, #38                       | pendiente |
| R7  | Responder "¿dónde se rompe este pago?" en menos de 5 segundos, en un teléfono con mala señal                                                 | 1     | #7, #16, #18                             | pendiente |
| R8  | Quincena simulada con k6: de 5 a 500 lecturas y 50 reportes por segundo en 10 minutos, con un banco caído                                    | 2     | #45                                      | pendiente |

Fuera del MVP: cuentas de usuario, comentarios, aplicación móvil nativa, alertas por Telegram (D11)
y sondeo automático de los servidores de los bancos.
