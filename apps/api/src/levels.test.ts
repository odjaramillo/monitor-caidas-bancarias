import { describe, expect, it } from 'vitest';
import {
  MANY_REPORTS_THRESHOLD,
  POSSIBLE_PROBLEMS_THRESHOLD,
  WINDOW_MINUTES,
  computeStatus,
  levelFor,
  messageFor
} from './levels.js';

const BANKS = [
  { id: 'banesco', name: 'Banesco' },
  { id: 'mercantil', name: 'Mercantil' },
  { id: 'provincial', name: 'BBVA Provincial' }
];

const NOW = new Date('2026-10-28T14:05:30.000Z');

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

function reports(origin: string, destination: string, count: number, ageMinutes = 1) {
  return Array.from({ length: count }, () => ({
    origin,
    destination,
    createdAt: minutesAgo(ageMinutes)
  }));
}

describe('levelFor', () => {
  it('is normal with no reports', () => {
    expect(levelFor(0)).toBe('normal');
  });

  it('turns to posibles_problemas at the first threshold', () => {
    expect(levelFor(POSSIBLE_PROBLEMS_THRESHOLD - 1)).toBe('normal');
    expect(levelFor(POSSIBLE_PROBLEMS_THRESHOLD)).toBe('posibles_problemas');
  });

  it('stays in posibles_problemas until the second threshold', () => {
    expect(levelFor(MANY_REPORTS_THRESHOLD - 1)).toBe('posibles_problemas');
  });

  it('turns to muchos_reportes at the second threshold and above', () => {
    expect(levelFor(MANY_REPORTS_THRESHOLD)).toBe('muchos_reportes');
    expect(levelFor(MANY_REPORTS_THRESHOLD + 100)).toBe('muchos_reportes');
  });

  it('keeps the thresholds in order', () => {
    expect(POSSIBLE_PROBLEMS_THRESHOLD).toBeGreaterThan(0);
    expect(MANY_REPORTS_THRESHOLD).toBeGreaterThan(POSSIBLE_PROBLEMS_THRESHOLD);
  });

  it('agrees with the pairs of the demo seed', () => {
    expect(levelFor(12)).toBe('muchos_reportes');
    expect(levelFor(2)).toBe('posibles_problemas');
    expect(levelFor(0)).toBe('normal');
  });
});

describe('messageFor (R4)', () => {
  it('says there are no reports when the count is 0', () => {
    expect(messageFor(0, 'Banesco', 'Mercantil')).toBe('Sin reportes en los últimos 15 minutos');
  });

  it('uses the singular for one report', () => {
    expect(messageFor(1, 'Banesco', 'Mercantil')).toBe(
      '1 persona reporta problemas con pagos de Banesco a Mercantil en los últimos 15 minutos'
    );
  });

  it('uses the plural for several reports', () => {
    expect(messageFor(12, 'Banesco', 'Mercantil')).toBe(
      '12 personas reportan problemas con pagos de Banesco a Mercantil en los últimos 15 minutos'
    );
  });

  it('never says a bank is down, at any count', () => {
    for (const count of [0, 1, 2, MANY_REPORTS_THRESHOLD, 500]) {
      expect(messageFor(count, 'Banesco', 'Mercantil').toLowerCase()).not.toMatch(/ca[ií]do/);
    }
  });
});

describe('computeStatus', () => {
  it('returns the window and the time of the calculation', () => {
    const status = computeStatus({ reports: [], banks: BANKS, now: NOW });
    expect(status.updatedAt).toBe('2026-10-28T14:05:30.000Z');
    expect(status.windowMinutes).toBe(WINDOW_MINUTES);
    expect(WINDOW_MINUTES).toBe(15);
  });

  it('returns every origin → destination pair, a bank with itself included', () => {
    const status = computeStatus({ reports: [], banks: BANKS, now: NOW });
    expect(status.pairs).toHaveLength(BANKS.length * BANKS.length);
    expect(status.pairs).toContainEqual(
      expect.objectContaining({ origin: 'banesco', destination: 'banesco' })
    );
  });

  it('puts every pair in normal when nobody reported', () => {
    const status = computeStatus({ reports: [], banks: BANKS, now: NOW });
    expect(status.pairs.every((pair) => pair.level === 'normal' && pair.reports === 0)).toBe(true);
  });

  it('counts the reports of each pair and assigns its level, message included', () => {
    const status = computeStatus({
      reports: [...reports('banesco', 'mercantil', 12), ...reports('mercantil', 'banesco', 2)],
      banks: BANKS,
      now: NOW
    });
    expect(
      status.pairs.find((p) => p.origin === 'banesco' && p.destination === 'mercantil')
    ).toEqual({
      origin: 'banesco',
      destination: 'mercantil',
      level: 'muchos_reportes',
      reports: 12,
      message:
        '12 personas reportan problemas con pagos de Banesco a Mercantil en los últimos 15 minutos'
    });
    expect(
      status.pairs.find((p) => p.origin === 'mercantil' && p.destination === 'banesco')
    ).toMatchObject({
      level: 'posibles_problemas',
      reports: 2
    });
  });

  it('does not mix a pair with its reverse', () => {
    const status = computeStatus({
      reports: reports('banesco', 'mercantil', 3),
      banks: BANKS,
      now: NOW
    });
    expect(
      status.pairs.find((p) => p.origin === 'mercantil' && p.destination === 'banesco')?.reports
    ).toBe(0);
  });

  it('counts a report that is just under 15 minutes old', () => {
    const status = computeStatus({
      reports: reports('banesco', 'mercantil', 1, WINDOW_MINUTES - 0.01),
      banks: BANKS,
      now: NOW
    });
    expect(status.pairs[0]?.reports).toBe(1);
  });

  it('ignores a report that is exactly 15 minutes old or older', () => {
    const status = computeStatus({
      reports: [
        ...reports('banesco', 'mercantil', 3, WINDOW_MINUTES),
        ...reports('banesco', 'mercantil', 3, 40)
      ],
      banks: BANKS,
      now: NOW
    });
    expect(status.pairs.every((pair) => pair.reports === 0)).toBe(true);
  });

  it('ignores a report dated after the calculation', () => {
    const status = computeStatus({
      reports: reports('banesco', 'mercantil', 2, -1),
      banks: BANKS,
      now: NOW
    });
    expect(status.pairs.every((pair) => pair.reports === 0)).toBe(true);
  });

  it('ignores reports of banks that are not in the list', () => {
    const status = computeStatus({
      reports: reports('ghost', 'mercantil', 5),
      banks: BANKS,
      now: NOW
    });
    expect(status.pairs).toHaveLength(BANKS.length * BANKS.length);
    expect(status.pairs.every((pair) => pair.reports === 0)).toBe(true);
  });

  it('orders the pairs from most to fewest reports', () => {
    const status = computeStatus({
      reports: [
        ...reports('mercantil', 'provincial', 1),
        ...reports('banesco', 'mercantil', 12),
        ...reports('provincial', 'banesco', 3)
      ],
      banks: BANKS,
      now: NOW
    });
    expect(status.pairs.slice(0, 3).map((pair) => pair.reports)).toEqual([12, 3, 1]);
    const counts = status.pairs.map((pair) => pair.reports);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('breaks ties in bank-list order, so the output is stable', () => {
    const status = computeStatus({ reports: [], banks: BANKS, now: NOW });
    expect(status.pairs[0]).toMatchObject({ origin: 'banesco', destination: 'banesco' });
    expect(status.pairs[1]).toMatchObject({ origin: 'banesco', destination: 'mercantil' });
    expect(status.pairs.at(-1)).toMatchObject({ origin: 'provincial', destination: 'provincial' });
  });
});
