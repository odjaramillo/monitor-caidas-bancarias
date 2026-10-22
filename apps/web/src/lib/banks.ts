// Closed lists from the API contract (docs/api.md). The API has no endpoint that returns them,
// so the frontend keeps this copy: change both together.

export const BANKS = {
  venezuela: 'Banco de Venezuela',
  banesco: 'Banesco',
  mercantil: 'Mercantil',
  provincial: 'BBVA Provincial',
  bnc: 'Banco Nacional de Crédito',
  bancamiga: 'Bancamiga',
  bdt: 'Banco Digital de los Trabajadores',
  bancaribe: 'Bancaribe',
  exterior: 'Banco Exterior',
  plaza: 'Banco Plaza'
} as const;

export type BankId = keyof typeof BANKS;

export const LEVEL_LABELS = {
  normal: 'Normal',
  posibles_problemas: 'Posibles problemas',
  muchos_reportes: 'Muchos reportes'
} as const;

export type Level = keyof typeof LEVEL_LABELS;

// A bank the API knows but this copy does not still shows up, by its id.
export function bankName(id: string): string {
  return BANKS[id as BankId] ?? id;
}
