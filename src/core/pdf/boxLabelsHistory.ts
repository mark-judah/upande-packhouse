import { storage, StorageKeys } from '@/src/core/storage';

/** One PDF the operator chose to save for one OPL. Several can pile up for
 *  the same OPL over a shift (e.g. re-generated after packing more boxes) --
 *  newest first. */
export type SavedBoxLabels = {
  path: string;
  filename: string;
  count: number;
  savedAt: number;
};

type HistoryMap = Record<string, SavedBoxLabels[]>;

async function readAll(): Promise<HistoryMap> {
  const raw = await storage.get(StorageKeys.boxLabelsHistory);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as HistoryMap) : {};
  } catch {
    return {};
  }
}

async function writeAll(map: HistoryMap): Promise<void> {
  await storage.set(StorageKeys.boxLabelsHistory, JSON.stringify(map));
}

/** Every saved-labels PDF on record for one OPL, newest first. */
export async function getSavedBoxLabels(opl: string): Promise<SavedBoxLabels[]> {
  const map = await readAll();
  return map[opl] ?? [];
}

/** Records a just-saved PDF against its OPL. */
export async function recordSavedBoxLabels(opl: string, entry: SavedBoxLabels): Promise<void> {
  const map = await readAll();
  map[opl] = [entry, ...(map[opl] ?? [])];
  await writeAll(map);
}
