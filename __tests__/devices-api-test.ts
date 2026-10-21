import { mergeInstallRows, parseServerTime, type InstallRow } from '@/src/core/version/devices-api';

jest.mock('@/src/core/api/client', () => ({ api: jest.fn() }));

const row = (install_id: string, user = 'a@x.com') => ({ install_id, user }) as InstallRow;

describe('parseServerTime', () => {
  it('reads site timestamps with or without microseconds', () => {
    const ms = parseServerTime('2026-10-21 08:30:00.123');
    expect(ms).not.toBeNull();
    expect(parseServerTime('2026-10-21 08:30:00.123456')).toBe(ms);
    expect(parseServerTime('2026-10-21 08:30:00')).toBe((ms as number) - 123);
  });

  it('is null for nothing or junk', () => {
    expect(parseServerTime(null)).toBeNull();
    expect(parseServerTime('')).toBeNull();
    expect(parseServerTime('not a date')).toBeNull();
  });
});

describe('mergeInstallRows', () => {
  it('keeps one row per install across pages, with the newer data', () => {
    const merged = mergeInstallRows([row('1'), row('2')], [row('2', 'b@x.com'), row('3')]);
    expect(merged.map((r) => r.install_id)).toEqual(['1', '2', '3']);
    expect(merged[1].user).toBe('b@x.com');
  });
});
