import { describe, it, expect } from 'vitest';
import { normalizeStoredLogs, AXC_LOGS_CAP } from '../src/logStore';

describe('logStore.normalizeStoredLogs', () => {
  it('non-tableau -> []', () => {
    expect(normalizeStoredLogs(null)).toEqual([]);
    expect(normalizeStoredLogs({})).toEqual([]);
    expect(normalizeStoredLogs('x')).toEqual([]);
  });

  it('filtre les entrées invalides', () => {
    const raw = [
      { t: 1, lvl: 'info', msg: 'ok' },
      { t: 'x', lvl: 'info', msg: 'bad t' },
      { t: 2, lvl: 'nope', msg: 'bad lvl' },
      null,
      { t: 3, lvl: 'error', msg: 'ok2' },
    ];
    expect(normalizeStoredLogs(raw)).toEqual([
      { t: 1, lvl: 'info', msg: 'ok' },
      { t: 3, lvl: 'error', msg: 'ok2' },
    ]);
  });

  it('cap : garde les plus récentes', () => {
    const raw = Array.from({ length: AXC_LOGS_CAP + 50 }, (_, i) => ({
      t: i,
      lvl: 'info' as const,
      msg: `m${i}`,
    }));
    const out = normalizeStoredLogs(raw);
    expect(out).toHaveLength(AXC_LOGS_CAP);
    expect(out[0].t).toBe(50);
    expect(out[out.length - 1].t).toBe(AXC_LOGS_CAP + 49);
  });
});
