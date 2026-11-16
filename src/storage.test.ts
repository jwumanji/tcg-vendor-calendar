import { describe, it, expect, vi } from 'vitest';
import { backup, validateBackup, emptyEntry, migrateLegacy, loadEntries, saveValue, importEntries, unknownIds, STORAGE_KEY } from './storage';
const entry = { ...emptyEntry, stage: 'Interested' as const, note: 'Booth: $200\nCall Friday', noteUpdatedAt: '2026-11-16T10:00:00.000Z' };
describe('versioned pipeline backup validation', () => {
  it('round trips notes and timestamps and ignores unknown fields', () => {
    const value = backup({ event: entry, missing: emptyEntry });
    expect(validateBackup({ ...value, extra: true, entries: { event: { ...entry, extra: 'ignore' }, missing: emptyEntry } })).toEqual(value);
  });
  it.each([null, [], {}, { version: 2 }, { ...backup({}), exportedAt: 'yesterday' }, { ...backup({}), entries: [] }])('rejects malformed envelopes %j', value => {
    expect(() => validateBackup(value)).toThrow();
  });
  it.each([{ stage: 'Applied' }, { note: 42 }, { noteUpdatedAt: '2026-02-30T10:00:00.000Z' }, { stageUpdatedAt: 0 }, { noteUpdatedAt: undefined }])('rejects malformed entries %j', patch => {
    expect(() => validateBackup(backup({ id: { ...entry, ...patch } as typeof entry }))).toThrow();
  });
  it('handles special object keys as ordinary event IDs', () => {
    const value = JSON.parse(JSON.stringify(backup({})));
    value.entries = JSON.parse('{"__proto__":{"stage":"New","note":"","noteUpdatedAt":null,"stageUpdatedAt":null}}');
    expect(Object.keys(validateBackup(value).entries)).toEqual(['__proto__']);
  });
});
describe('storage and refresh persistence', () => {
  it('migrates each old plan without deleting absent IDs', () => {
    const entries = migrateLegacy({ a: 'Interested', b: 'Planning to vend', c: 'Applied', d: 'Accepted', absent: 'Skip', invalid: 'bad' });
    expect(Object.values(entries).map(e => e.stage)).toEqual(['Interested', 'Interested', 'Contacted', 'Need to pay', 'Pass']);
    const getItem = vi.fn((key: string) => key === STORAGE_KEY ? JSON.stringify(backup(entries)) : null);
    expect(loadEntries({ getItem }).entries).toEqual(entries);
    expect(unknownIds(entries, ['a', 'b', 'c', 'd'])).toEqual(['absent']);
  });
  it('reads legacy data only when no versioned backup exists', () => {
    expect(loadEntries({ getItem: key => key === 'tcg-plans' ? '{"old":"Skip"}' : null }).entries.old.stage).toBe('Pass');
    expect(loadEntries({ getItem: key => key === STORAGE_KEY ? JSON.stringify(backup({})) : '{"old":"Skip"}' }).entries).toEqual({});
  });
  it('merges by ID and replaces only after the selected mode', () => {
    const current = { absent: entry, same: entry };
    const incoming = { same: emptyEntry, new: entry };
    expect(importEntries(current, incoming, 'merge')).toEqual({ absent: entry, same: emptyEntry, new: entry });
    expect(importEntries(current, incoming, 'replace')).toEqual(incoming);
    expect(current.same).toBe(entry);
  });
  it('reports unavailable, corrupt, and full storage', () => {
    expect(loadEntries({ getItem: () => { throw new Error('denied'); } }).error).toBeTruthy();
    expect(loadEntries({ getItem: () => '{broken' }).error).toBeTruthy();
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('quota'); } });
    expect(saveValue(STORAGE_KEY, backup({}))).toContain('Could not save');
    vi.unstubAllGlobals();
  });
});
