# Calidad: qué control hace cumplir cada regla

Una regla que solo está escrita depende de que alguien se acuerde. Esta tabla dice, para cada
regla, qué control la hace cumplir, dónde corre y qué error atrapa. También enlaza la prueba de
que el control falla: un control que nunca falla no prueba nada.

- **Fuentes.** Las reglas de "Cómo trabajamos" del [README](../README.md) y los controles de la
  sección 6 de la [propuesta](propuesta.md).
- **Dónde corre.** `hook` es local y se puede saltar con `--no-verify`. Por eso cada hook se
  repite en un job requerido del CI, y una prueba lo comprueba. `CI` es un job que `main` exige
  para fusionar. `GitHub` es la protección de la rama `main`. `CI después del merge` corre en
  cada push a `main`: no bloquea el merge, pero queda en rojo en Actions si falla.
- **Prueba de que falla.** La corrida que vio el control en rojo. Las del 2026-10-20 se hicieron
  en la auditoría de QA y en los PR de cada gate.
- **Si agregas una regla o un control, agrega su fila en el mismo PR.** La prueba del índice fija
  las filas, así que la fila nueva también va en `tooling/repo-contract/calidad-index.test.js`. Si
  la regla está en "Cómo trabajamos", ponle también su marcador.

## Reglas con control

`tooling/repo-contract/calidad-index.test.js` revisa esta tabla en cada PR. En las columnas
Control y Dónde corre, un texto entre comillas invertidas es una referencia que debe existir: si
tiene `/` o una extensión, es una ruta del repositorio o una Action que usa un workflow; si empieza
con `pnpm`, es un script de un `package.json` o un comando propio de pnpm (`install`, `audit`,
`exec`); y si es un nombre solo en Dónde corre, es un job del CI. Cada fila nombra al menos una
referencia, salvo las que corren en GitHub. Cada regla de "Cómo trabajamos" del README lleva un
marcador `<!-- regla: ... -->` con el texto exacto de su fila en la columna Regla, en esta tabla o
en la de convenciones.

| Regla                                           | Control                                                                                                               | Dónde corre                                     | Qué error atrapa                                                                      | Prueba de que falla                                                                                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commits con Conventional Commits                | commitlint (`.husky/commit-msg`)                                                                                      | hook y CI (`checks`, en cada PR)                | Un mensaje como `added some stuff`                                                    | 2026-10-20: `added some stuff` da exit 1; `feat(api): accept bank reports` da exit 0                                                                          |
| Un PR por issue con `Closes #N` o `[sin-issue]` | `.github/workflows/pr.yml`                                                                                            | CI (`issue`)                                    | Un PR que no cierra su issue, por ejemplo con "Cierra #N"                             | 2026-10-20: el cuerpo `Cierra #5` da exit 1; `Closes #5` da exit 0                                                                                            |
| `main` solo recibe PR con el CI en verde        | Protección de `main`: PR obligatorio, también para admins, y rama al día (`strict`, D14)                              | GitHub                                          | Un push directo, un merge con el CI en rojo, o dos PR verdes que juntos rompen `main` | Exige `checks`, `docker`, `secrets` e `issue`, los cuatro solo desde GitHub Actions; no permite force push ni borrar la rama. `strict` aplicado el 2026-10-21 |
| Estilo y formato del código                     | ESLint y Prettier (`lint-staged` en `.husky/pre-commit`)                                                              | hook y CI (`checks`: `pnpm lint`)               | Código mal formateado o con errores de lint                                           | 2026-10-20: `const x   =  1` da exit 1 en `prettier --check`                                                                                                  |
| Lo cambiado compila y pasa sus pruebas          | `.husky/pre-push`: `typecheck` y `test` de paquetes cambiados y sus dependientes, no la raíz; para al primer fallo    | hook y CI (`checks`: typecheck y test)          | Un error de tipos o una prueba rota que solo vería el CI                              | 2026-10-22: un error de tipos en `apps/web` da exit 1 y las pruebas no corren (#112)                                                                          |
| Funciones de complejidad 10 como máximo         | Regla `complexity` en `eslint.config.js`                                                                              | hook y CI (`checks`: `pnpm lint`)               | Una función difícil de probar                                                         | 2026-10-20: una función con 10 `if` da "complexity of 11" y exit 1                                                                                            |
| `levels.ts` no importa infraestructura          | Regla `no-restricted-imports` en `eslint.config.js`, y `apps/api/src/levels-imports.test.ts` la prueba con un archivo | hook y CI (`checks`: `pnpm lint` y `pnpm test`) | Un `import` de `pg`, `fastify` o un módulo de I/O de la API en la lógica de niveles   | 2026-10-22: `import pg from 'pg'` en `levels.ts` da exit 1 en `pnpm lint` (#115)                                                                              |
| Las dependencias coinciden con el lockfile      | `pnpm install --frozen-lockfile`                                                                                      | CI (`checks`)                                   | Un `package.json` cambiado sin actualizar `pnpm-lock.yaml`                            | Sin prueba negativa todavía                                                                                                                                   |
| El código compila con tipos correctos           | `pnpm typecheck` (`tsc` y `svelte-check`)                                                                             | CI (`checks`)                                   | Un error de tipos                                                                     | 2026-10-20: `layout.test.ts` sin `params` ni `data` dio exit 1 (#70)                                                                                          |
| Las pruebas pasan y existen                     | Vitest en API y frontend; falla si no encuentra pruebas                                                               | CI (`checks`: `pnpm test`)                      | Una prueba rota, o un proyecto que "pasa" sin ejecutar nada                           | 2026-10-20: `apps/web` sin archivos de prueba da exit 1 (#78)                                                                                                 |
| La cobertura no baja                            | `thresholds` de Vitest iguales a la última medición, fechada en su config                                             | CI (`checks`: `pnpm test`)                      | Código nuevo sin pruebas                                                              | 2026-10-20: quitar `layout.test.ts` da exit 1 en el frontend; una función sin prueba da exit 1 en la API (#70)                                                |
| La aplicación compila                           | `pnpm build`                                                                                                          | CI (`checks`)                                   | Un build roto antes de llegar a Vercel o Render                                       | Sin prueba negativa todavía                                                                                                                                   |
| La imagen de la API se construye                | `docker/build-push-action`                                                                                            | CI (`docker`)                                   | Un Dockerfile roto antes de llegar a Render                                           | Sin prueba negativa todavía                                                                                                                                   |
| La imagen de la API arranca y responde          | Arrancar la imagen con PostgreSQL y exigir `{"status":"ok","database":"ok"}` en `/health`                             | CI (`docker`)                                   | Una imagen que compila pero no arranca o no responde                                  | 2026-10-20: una imagen cuyo `CMD` termina con error da exit 1 en 30 s (#80)                                                                                   |
| `compose.yaml` es válido                        | `docker compose config -q`                                                                                            | CI (`docker`)                                   | Un `compose.yaml` roto que rompe el entorno local de todos                            | 2026-10-20: un `compose.yaml` con YAML roto da exit 1 (#80)                                                                                                   |
| Ningún secreto en el repositorio                | gitleaks sobre todo el historial                                                                                      | CI (`secrets`)                                  | Un token o una contraseña subidos por error                                           | 2026-10-20: un repo temporal con un token falso de GitHub da "leaks found: 1" y exit 1                                                                        |
| Sin vulnerabilidades altas en producción        | `pnpm audit --prod --audit-level high`                                                                                | CI (`checks`)                                   | Una dependencia de producción con un aviso alto o crítico                             | 2026-10-20: un proyecto temporal con `lodash@4.17.15` da 3 avisos altos y exit 1 (#70)                                                                        |
| `pnpm verify` repite el job `checks`            | Prueba de paridad en `tooling/repo-contract/ci-contract.test.js`                                                      | CI (`checks`: `pnpm test`)                      | Un comando de `checks` que `pnpm verify` no corre, o que corre en otro orden          | 2026-10-22: quitar `pnpm lint` de `verify` da exit 1 (#114)                                                                                                   |
| Los jobs requeridos existen y revisan algo      | Prueba de contrato del CI en `tooling/repo-contract/ci-contract.test.js`                                              | CI (`checks`: `pnpm test`)                      | Un job requerido renombrado, un gate quitado o un job solo con preparación            | 2026-10-22: renombrar el job `secrets` da exit 1 (#114)                                                                                                       |
| La tabla nombra controles que existen           | Prueba del índice en `tooling/repo-contract/calidad-index.test.js`                                                    | CI (`checks`: `pnpm test`)                      | Un control renombrado o borrado que la tabla sigue nombrando, o una regla sin fila    | 2026-10-22: borrar una fila, renombrar una ruta o quitar un marcador del README da exit 1 (#116)                                                              |
| Las dos pantallas funcionan en un navegador     | Playwright con Chromium (`apps/web/e2e`) contra el build estático y la API                                            | CI (`checks`: test:e2e)                         | Un fallo que solo se ve en el navegador, como el de #103                              | 2026-10-22: sin el arreglo de #103, la prueba del JavaScript tardío da exit 1; `->` en vez de `→` en los pares da exit 1 (#111)                               |
| Los hooks no pierden pasos y el CI los repite   | Prueba de los hooks en `tooling/repo-contract/hooks-contract.test.js`                                                 | CI (`checks`: `pnpm test`)                      | Un hook borrado, un paso quitado o un paso que ningún job requerido repite            | 2026-10-22: quitar `test` de `.husky/pre-push` da exit 1 (#112)                                                                                               |
| Un despliegue en verde responde                 | Job `deploy` de `.github/workflows/ci.yml`: Deploy Hook de Render con el commit fusionado y `/health` con ese commit  | CI después del merge (`deploy`)                 | Un despliegue que no arranca o deja la versión anterior; un Deploy Hook que falta     | 2026-10-22: secreto vacío, hook en un puerto cerrado o con 401, y `/health` con otro `commit` dan exit distinto de 0. Primera corrida en `main`: pendiente    |

## Comandos del CI que `pnpm verify` no corre

`pnpm verify` corre los comandos del job `checks` en el mismo orden. Las pruebas de la API necesitan
el PostgreSQL de `docker compose up -d`. La prueba de paridad falla si los dos listados se separan,
salvo en estos comandos:

| Comando del CI                                                   | Por qué no corre en local                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec commitlint`                                           | Revisa los commits del PR entre dos SHA que solo trae el evento del PR. En local, `.husky/commit-msg` revisa cada commit                                           |
| `pnpm --filter web exec playwright install --with-deps chromium` | Instala Chromium y paquetes del sistema con permisos de administrador. En local se instala una vez: `pnpm --filter web exec playwright install chromium`           |
| `pnpm --filter web test:e2e`                                     | Deja reportes reales en la base, y esos reportes hacen fallar las pruebas de la API durante 15 minutos. En local se corre aparte, con la base `mcb_e2e` del README |

`pnpm verify` tampoco corre los jobs `docker`, `secrets`, `issue` y `deploy`, porque no son parte de
`checks`. `issue` lee la descripción del PR, que solo existe en GitHub. `deploy` despliega producción
y solo corre en GitHub.

## Controles en camino

| Regla                          | Control previsto   | Estado        |
| ------------------------------ | ------------------ | ------------- |
| Las dependencias se actualizan | Dependabot mensual | #46 (Corte 2) |

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
| Docs, issues y PR en español; código y commits en inglés                          | D9. El idioma de un texto es juicio, no sintaxis                                                    | Quien revisa el PR                                           |
