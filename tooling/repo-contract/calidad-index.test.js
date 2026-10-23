// Checks the rule index of docs/calidad.md (issue #116).
// A row that names a renamed or deleted control still claims a gate that does not exist.
// A README rule without a row has no control and no accepted convention.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  markersOf,
  parseTable,
  referenceExists,
  referenceOf,
  rowReferences,
  ruleBlocks,
  sectionLines
} from './calidad.js';
import { contextOf, readWorkflows } from './workflows.js';
import { workspacePackageDirs } from './workspace.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

// The rows of "Reglas con control". Keep this list equal to the table.
// A row that disappears, or a row that nobody adds here, makes the test fail.
const CONTROLLED_RULES = [
  'Un despliegue en verde responde',
  'Las dos pantallas funcionan en un navegador',
  'Commits con Conventional Commits',
  'Un PR por issue con `Closes #N` o `[sin-issue]`',
  '`main` solo recibe PR con el CI en verde',
  'Estilo y formato del código',
  'Lo cambiado compila y pasa sus pruebas',
  'Funciones de complejidad 10 como máximo',
  '`levels.ts` no importa infraestructura',
  'Las dependencias coinciden con el lockfile',
  'El código compila con tipos correctos',
  'Las pruebas pasan y existen',
  'La cobertura no baja',
  'La aplicación compila',
  'La imagen de la API se construye',
  'La imagen de la API arranca y responde',
  '`compose.yaml` es válido',
  'Ningún secreto en el repositorio',
  'Sin vulnerabilidades altas en producción',
  '`pnpm verify` repite el job `checks`',
  'Los jobs requeridos existen y revisan algo',
  'Los hooks no pierden pasos y el CI los repite',
  'La tabla nombra controles que existen',
  'Ninguna prueba enfocada, pendiente o con espera',
  'Un `.skip` lleva su issue y su vencimiento',
  'Cada paquete del workspace tiene script `test`'
];

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

// Reads the scripts of the root package.json and of each package of the workspace.
function workspaceScripts() {
  const packages = workspacePackageDirs(root).map((dir) => join(dir, 'package.json'));
  const scripts = ['package.json', ...packages].flatMap((path) =>
    Object.keys(JSON.parse(read(path)).scripts ?? {})
  );
  return new Set(scripts);
}

function readRepo() {
  const jobs = readWorkflows(join(root, '.github/workflows'));
  const steps = jobs.flatMap((job) => job.steps);
  return {
    hasPath: (path) => existsSync(join(root, path)),
    scripts: workspaceScripts(),
    jobs: new Set(jobs.map(contextOf)),
    actions: new Set(steps.filter((step) => step.uses).map((step) => step.uses.split('@')[0]))
  };
}

const calidad = read('docs/calidad.md');
const controlled = parseTable(sectionLines(calidad, 'Reglas con control'));
const conventions = parseTable(sectionLines(calidad, 'Reglas sin control: convenciones aceptadas'));
const readmeRules = ruleBlocks(sectionLines(read('README.md'), 'Cómo trabajamos'));

describe('rule index of docs/calidad.md', () => {
  const repo = readRepo();

  it('finds both tables and the README rules', () => {
    expect(controlled.length, 'rows of "Reglas con control"').toBeGreaterThan(0);
    expect(conventions.length, 'rows of the conventions table').toBeGreaterThan(0);
    expect(readmeRules.length, 'rules of "Cómo trabajamos"').toBeGreaterThan(0);
  });

  it('"Reglas con control" has exactly the pinned rows', () => {
    const sorted = (names) => [...names].sort();
    expect(sorted(controlled.map((row) => row.Regla))).toEqual(sorted(CONTROLLED_RULES));
  });

  it.each(controlled)('the row "$Regla" names only controls that exist', (row) => {
    const missing = rowReferences(row).filter((reference) => !referenceExists(reference, repo));
    expect(missing).toEqual([]);
  });

  it.each(controlled.filter((row) => row['Dónde corre'] !== 'GitHub'))(
    'the row "$Regla" names at least one control that the test can check',
    (row) => {
      expect(rowReferences(row)).not.toEqual([]);
    }
  );

  it('every rule of "Cómo trabajamos" carries a regla marker', () => {
    const unmarked = readmeRules.filter((block) => markersOf(block).length === 0);
    expect(unmarked).toEqual([]);
  });

  it('every regla marker of the README names a row of docs/calidad.md', () => {
    const rows = new Set([...controlled, ...conventions].map((row) => row.Regla));
    const markers = readmeRules.flatMap(markersOf);
    expect(markers.filter((marker) => !rows.has(marker))).toEqual([]);
  });
});

describe('calidad reader', () => {
  it('classifies backticked tokens by their syntax and column', () => {
    expect(referenceOf('pnpm lint', 'Control')).toEqual({ kind: 'script', name: 'lint' });
    expect(referenceOf('.husky/commit-msg', 'Control')).toEqual({
      kind: 'path',
      name: '.husky/commit-msg'
    });
    expect(referenceOf('eslint.config.js', 'Control')).toEqual({
      kind: 'path',
      name: 'eslint.config.js'
    });
    expect(referenceOf('checks', 'Dónde corre')).toEqual({ kind: 'job', name: 'checks' });
    expect(referenceOf('complexity', 'Control')).toBeNull();
    expect(referenceOf('/health', 'Control')).toBeNull();
    expect(referenceOf('docker compose config -q', 'Control')).toBeNull();
  });

  it('reads only the control columns of a row', () => {
    const lines = [
      '| Regla | Control | Dónde corre | Qué error atrapa |',
      '| ----- | ------- | ----------- | ---------------- |',
      '| `a.md` | `b.js` | CI (`checks`: `pnpm test`) | `c.json` |'
    ];
    expect(rowReferences(parseTable(lines)[0])).toEqual([
      { kind: 'path', name: 'b.js' },
      { kind: 'job', name: 'checks' },
      { kind: 'script', name: 'test' }
    ]);
  });

  it('accepts a pnpm command, and an Action that a workflow uses', () => {
    const repo = { hasPath: () => false, scripts: new Set(), jobs: new Set(), actions: new Set() };
    repo.actions.add('docker/build-push-action');
    expect(referenceExists({ kind: 'script', name: 'install' }, repo)).toBe(true);
    expect(referenceExists({ kind: 'path', name: 'docker/build-push-action' }, repo)).toBe(true);
    expect(referenceExists({ kind: 'script', name: 'lint' }, repo)).toBe(false);
    expect(referenceExists({ kind: 'path', name: '.husky/pre-push' }, repo)).toBe(false);
  });

  it('splits numbered items and paragraphs into rules', () => {
    const lines = ['1. **One.** <!-- regla: A -->', '   more', '2. Two.', '', 'Para.', 'graph.'];
    const blocks = ruleBlocks(lines);
    expect(blocks).toHaveLength(3);
    expect(blocks.map(markersOf)).toEqual([['A'], [], []]);
  });
});
