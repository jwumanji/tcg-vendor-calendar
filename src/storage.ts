export const stages = ['New', 'Pass', 'Too expensive', 'Interested', 'Contacted', 'Need to pay', 'Paid / attending'] as const;
export type Stage = typeof stages[number];
export interface Entry { stage: Stage; note: string; noteUpdatedAt: string | null; stageUpdatedAt: string | null }
export type Entries = Record<string, Entry>;
export const emptyEntry: Entry = { stage: 'New', note: '', noteUpdatedAt: null, stageUpdatedAt: null };
export const STORAGE_KEY = 'tcg-pipeline-v1';
export interface Backup { version: 1; exportedAt: string; entries: Entries }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const timestamp = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString() === v;
export function validateBackup(value: unknown): Backup {
  if (!object(value) || value.version !== 1 || !timestamp(value.exportedAt) || !object(value.entries)) throw new Error('Invalid backup: expected version 1, exportedAt and entries.');
  const entries: Entries = Object.create(null);
  for (const [id, e] of Object.entries(value.entries)) {
    if (!id.trim() || !object(e) || !stages.includes(e.stage as Stage) || typeof e.note !== 'string' || !(e.noteUpdatedAt === null || timestamp(e.noteUpdatedAt)) || !(e.stageUpdatedAt === null || timestamp(e.stageUpdatedAt))) throw new Error(`Invalid entry: ${id}`);
    entries[id] = { stage: e.stage as Stage, note: e.note, noteUpdatedAt: e.noteUpdatedAt, stageUpdatedAt: e.stageUpdatedAt };
  }
  return { version: 1, exportedAt: value.exportedAt, entries };
}
export function backup(entries: Entries): Backup { return { version: 1, exportedAt: new Date().toISOString(), entries }; }
export function importEntries(current: Entries, incoming: Entries, mode: 'merge' | 'replace'): Entries {
  return Object.assign(Object.create(null), mode === 'merge' ? current : {}, incoming);
}
export function unknownIds(entries: Entries, ids: string[]) { const known = new Set(ids); return Object.keys(entries).filter(id => !known.has(id)); }
export function migrateLegacy(value: unknown): Entries {
  const result: Entries = Object.create(null);
  const mapping: Record<string, Stage> = { Interested: 'Interested', 'Planning to vend': 'Interested', Applied: 'Contacted', Accepted: 'Need to pay', Skip: 'Pass' };
  if (object(value)) for (const [id, plan] of Object.entries(value)) if (typeof plan === 'string' && Object.hasOwn(mapping, plan)) result[id] = { ...emptyEntry, stage: mapping[plan] };
  return result;
}
export function loadEntries(storage: Pick<Storage, 'getItem'>): { entries: Entries; error: string } {
  try {
    const saved = storage.getItem(STORAGE_KEY);
    return { entries: saved ? validateBackup(JSON.parse(saved)).entries : migrateLegacy(JSON.parse(storage.getItem('tcg-plans') || '{}')), error: '' };
  } catch { return { entries: {}, error: 'Could not read saved pipeline data. Storage may be unavailable or the saved data invalid.' }; }
}
export function saveValue(key: string, value: unknown): string {
  try { localStorage.setItem(key, JSON.stringify(value)); return ''; }
  catch { return 'Could not save on this device. Storage is unavailable or full. Export a JSON backup to keep your changes.'; }
}
