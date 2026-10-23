# Calidad: qué control hace cumplir cada regla

Una regla que solo está escrita depende de que alguien se acuerde. Esta tabla dice, para cada
regla, qué control la hace cumplir, dónde corre y qué error atrapa. También enlaza la prueba de
que el control falla: un control que nunca falla no prueba nada.

- **Fuentes.** Las reglas de "Cómo trabajamos" del [README](../README.md) y los controles de la
  sección 6 de la [propuesta](propuesta.md).
- **Dónde corre.** `hook` es local y se puede saltar con `--no-verify`. Por eso cada hook se
  repite en un job requerido del CI. `CI` es un job que `main` exige para fusionar. `GitHub` es
  la protección de la rama `main`.
- **Prueba de que falla.** La corrida que vio el control en rojo. Las del 2026-10-20 se hicieron
  en la auditoría de QA y en los PR de cada gate.
- **Si agregas una regla o un control, agrega su fila en el mismo PR.**

## Reglas con control

| Regla                                           | Control                                                                                   | Dónde corre                       | Qué error atrapa                                                                      | Prueba de que falla                                                                                                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commits con Conventional Commits                | commitlint (`.husky/commit-msg`)                                                          | hook y CI (`checks`, en cada PR)  | Un mensaje como `added some stuff`                                                    | 2026-10-20: `added some stuff` da exit 1; `feat(api): accept bank reports` da exit 0                                                                          |
| Un PR por issue con `Closes #N` o `[sin-issue]` | `.github/workflows/pr.yml`                                                                | CI (`issue`)                      | Un PR que no cierra su issue, por ejemplo con "Cierra #N"                             | 2026-10-20: el cuerpo `Cierra #5` da exit 1; `Closes #5` da exit 0                                                                                            |
| `main` solo recibe PR con el CI en verde        | Protección de `main`: PR obligatorio, también para admins, y rama al día (`strict`, D14)  | GitHub                            | Un push directo, un merge con el CI en rojo, o dos PR verdes que juntos rompen `main` | Exige `checks`, `docker`, `secrets` e `issue`, los cuatro solo desde GitHub Actions; no permite force push ni borrar la rama. `strict` aplicado el 2026-10-21 |
| Estilo y formato del código                     | ESLint y Prettier (`lint-staged` en `.husky/pre-commit`)                                  | hook y CI (`checks`: `pnpm lint`) | Código mal formateado o con errores de lint                                           | 2026-10-20: `const x   =  1` da exit 1 en `prettier --check`                                                                                                  |
| Funciones de complejidad 10 como máximo         | Regla `complexity` en `eslint.config.js`                                                  | hook y CI (`checks`: `pnpm lint`) | Una función difícil de probar                                                         | 2026-10-20: una función con 10 `if` da "complexity of 11" y exit 1                                                                                            |
| Las dependencias coinciden con el lockfile      | `pnpm install --frozen-lockfile`                                                          | CI (`checks`)                     | Un `package.json` cambiado sin actualizar `pnpm-lock.yaml`                            | Sin prueba negativa todavía                                                                                                                                   |
| El código compila con tipos correctos           | `pnpm typecheck` (`tsc` y `svelte-check`)                                                 | CI (`checks`)                     | Un error de tipos                                                                     | 2026-10-20: `layout.test.ts` sin `params` ni `data` dio exit 1 (#70)                                                                                          |
| Las pruebas pasan y existen                     | Vitest en API y frontend; falla si no encuentra pruebas                                   | CI (`checks`: `pnpm test`)        | Una prueba rota, o un proyecto que "pasa" sin ejecutar nada                           | 2026-10-20: `apps/web` sin archivos de prueba da exit 1 (#78)                                                                                                 |
| La cobertura no baja                            | `thresholds` de Vitest iguales a la última medición, fechada en su config                 | CI (`checks`: `pnpm test`)        | Código nuevo sin pruebas                                                              | 2026-10-20: quitar `layout.test.ts` da exit 1 en el frontend; una función sin prueba da exit 1 en la API (#70)                                                |
| Las dos pantallas funcionan en un navegador     | Playwright con Chromium (`apps/web/e2e`) contra el build estático y la API                | CI (`checks`: `test:e2e`)         | Un fallo que solo se ve en el navegador, como el de #103                              | 2026-10-22: sin el arreglo de #103, la prueba del JavaScript tardío da exit 1; `->` en vez de `→` en los pares da exit 1 (#111)                               |
| La aplicación compila                           | `pnpm build`                                                                              | CI (`checks`)                     | Un build roto antes de llegar a Vercel o Render                                       | Sin prueba negativa todavía                                                                                                                                   |
| La imagen de la API se construye                | `docker/build-push-action`                                                                | CI (`docker`)                     | Un Dockerfile roto antes de llegar a Render                                           | Sin prueba negativa todavía                                                                                                                                   |
| La imagen de la API arranca y responde          | Arrancar la imagen con PostgreSQL y exigir `{"status":"ok","database":"ok"}` en `/health` | CI (`docker`)                     | Una imagen que compila pero no arranca o no responde                                  | 2026-10-20: una imagen cuyo `CMD` termina con error da exit 1 en 30 s (#80)                                                                                   |
| `compose.yaml` es válido                        | `docker compose config -q`                                                                | CI (`docker`)                     | Un `compose.yaml` roto que rompe el entorno local de todos                            | 2026-10-20: un `compose.yaml` con YAML roto da exit 1 (#80)                                                                                                   |
| Ningún secreto en el repositorio                | gitleaks sobre todo el historial                                                          | CI (`secrets`)                    | Un token o una contraseña subidos por error                                           | 2026-10-20: un repo temporal con un token falso de GitHub da "leaks found: 1" y exit 1                                                                        |
| Sin vulnerabilidades altas en producción        | `pnpm audit --prod --audit-level high`                                                    | CI (`checks`)                     | Una dependencia de producción con un aviso alto o crítico                             | 2026-10-20: un proyecto temporal con `lodash@4.17.15` da 3 avisos altos y exit 1 (#70)                                                                        |

## Controles en camino

| Regla                           | Control previsto                                | Estado        |
| ------------------------------- | ----------------------------------------------- | ------------- |
| Un despliegue en verde responde | Prueba del `/health` después de cada despliegue | #41 (Corte 2) |
| Las dependencias se actualizan  | Dependabot mensual                              | #46 (Corte 2) |

## Reglas sin control: convenciones aceptadas

Estas reglas no tienen un control automático. El equipo las acepta como convención: cada una se
revisa a mano en el PR, y agregar un control costaría más que el error que atrapa a esta altura
del semestre.

| Regla                                                                             | Por qué queda como convención                                                                       | Cómo se revisa                                               |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Todo empieza en un issue con la plantilla, su requisito y criterios de aceptación | El check `issue` ya exige que el PR enlace un issue; el contenido del issue es juicio, no sintaxis  | Quien revisa el PR abre el issue enlazado                    |
| Una rama por issue con el formato `<usuario>/<numero>-<tema>`                     | Un nombre de rama distinto no rompe nada; el enlace al issue ya lo exige el check `issue`           | Quien revisa el PR mira el nombre de la rama                 |
| Si el PR cumple un requisito, actualiza `docs/requisitos.md`                      | Decidir si un PR cumple un requisito es juicio, no sintaxis                                         | Quien revisa el PR compara el issue con `docs/requisitos.md` |
| Cada integrante usa su propia identidad de Git                                    | Git acepta cualquier nombre y correo; solo la firma de commits lo comprobaría, y el equipo no firma | `git shortlog -sn` antes de cada corte                       |
| El tamaño del PR                                                                  | D15: sin límite automático                                                                          | Quien revisa el PR                                           |
