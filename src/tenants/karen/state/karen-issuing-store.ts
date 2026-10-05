import { create } from 'zustand';
import { karenIssuingApi } from '../api/karen-issuing-api';
import type {
  RawIssueResponse,
  RawPackingListResponse,
  RawReadyOrder,
  RawReadyOrdersResponse,
  RawReadySaleOrderItem,
} from '../api/karen-issuing-api';
import { mapAxiosError } from '@/src/core/api/client';
import { tomorrowISO } from '@/src/core/date';

/** Normalised packing-list row used by the screen. */
export type PackingItem = {
  variety: string;
  bucket: string;
  stemLength: string;
  shelf: string;
  saleOrderItem: string;
  oplName: string;
  qty: string;
  team: string;
  mixed: number;
  downgradeTo: string | null;
  isIssued: boolean;
  /** Replaced from a remote farm: issued once the truck brings it and it is shelved. */
  waitingTransfer: string | null;
  /** Sale order lines this bucket feeds on the OPL; each is issued on its own. */
  lines: PackingLine[];
};

export type PackingLine = {
  saleOrderItem: string;
  qty: number;
  isIssued: boolean;
};

/** Why an allocated bucket is replaced (Bucket Replacement.reason). */
export type ReplaceReason = 'Missing' | 'Damaged' | 'Wrong variety' | 'Issued offline';
export const REPLACE_REASONS: ReplaceReason[] = ['Missing', 'Damaged', 'Wrong variety', 'Issued offline'];

/** "Issued offline": the lines (OPL teams) the bucket already went to, and whether
 *  one is this OPL's own line -- then it is marked issued instead of replaced. */
export type IssuedOfflineInfo =
  | {
      kind: 'ok';
      line: string;
      sameLine: boolean;
      issuedTo: { opl: string; orderName: string; team: string; sameLine: boolean }[];
    }
  | { kind: 'error'; message: string };

export type ReplacementCandidate = {
  bucket: string;
  shelf: string | null;
  stemLength: string | null;
  availableQty: number | null;
  harvestDate: string | null;
  /** The remote farm it comes from by truck; null at the sales farm. */
  farm: string | null;
};

/** The Replace sheet for one packing-list bucket. */
export type ReplaceSheet = {
  item: PackingItem;
  loading: boolean;
  candidates: ReplacementCandidate[];
  neededQty: number | null;
  /** Why nothing can be offered, when that is the answer -- or, with remote
   *  candidates, that they come from remote farms. */
  message: string | null;
  /** Same-day order and the candidates are remote: they may not arrive in time. */
  warning: string | null;
  submitting: boolean;
};

export type IssueOutcome =
  | { kind: 'success'; bucket: string; message?: string }
  | { kind: 'error';   bucket: string | null; message: string };

/** One Order Pick List ready to be issued — the issuing unit. A sale order
 *  can have several of these (e.g. split by team); each is its own row. */
export type ReadyOrder = {
  oplName: string;
  name: string;
  customer: string;
  varieties: string[];
  stemLengths: string[];
  qty: string;
  itemGroups: string[];
  teams: string[];
  /** Its team's place on the Packhouse Schedule (0 = not scheduled). */
  schedule: number;
  scheduleTeam: string;
  /** The team's next order to issue. */
  isNext: boolean;
};

type State = {
  ordersLoading: boolean;
  availableOrders: ReadyOrder[];
  /** Day being viewed (YYYY-MM-DD). Defaults to tomorrow — pack/issue today for tomorrow's shipments; lets users pick other days. */
  selectedDate: string;
  /** Active item-group filter for the order picker; null = show all. */
  selectedItemGroup: string | null;
  /** Active team filter for the order picker; null = show all. */
  selectedTeam: string | null;

  packingLoading: boolean;
  /** Currently selected Order Pick List name (the issuing unit). */
  selectedOpl: string | null;
  packingItems: PackingItem[];

  submitting: boolean;
  lastOutcome: IssueOutcome | null;
  replace: ReplaceSheet | null;

  loadOrders: () => Promise<void>;
  setDate: (date: string) => Promise<void>;
  setItemGroup: (group: string | null) => void;
  setTeam: (team: string | null) => void;
  selectOrder: (oplName: string) => Promise<void>;
  /** Parse a scanned bucket QR, find the matching packing line, submit. */
  submitScan: (raw: string) => Promise<IssueOutcome>;
  /** Open the Replace sheet for a bucket that cannot be found. */
  openReplace: (item: PackingItem) => Promise<void>;
  closeReplace: () => void;
  /** Swap the bucket for `newBucket`; the packing list reloads to show it. */
  confirmReplace: (
    newBucket: string,
    reason: ReplaceReason,
  ) => Promise<{ ok: boolean; message: string }>;
  /** "Issued offline": where the Replace sheet's bucket was already issued. */
  issuedOfflineInfo: () => Promise<IssuedOfflineInfo>;
  /** Issued offline to this OPL's own line: mark it issued; the packing list reloads. */
  markIssuedOffline: () => Promise<{ ok: boolean; message: string }>;
  reset: () => void;
};

/** Normalise a value (string or list) into a clean string list. */
function toStringList(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value : value != null ? [value] : [];
  return raw
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Coerce one raw entry (bare name or enriched object) into a ReadyOrder.
 *  A bare string has no OPL identity — skipped, since every entry the
 *  backend actually sends now carries `opl_name`. */
function toReadyOrder(entry: string | RawReadyOrder): ReadyOrder | null {
  if (typeof entry === 'string') return null;
  if (!entry || typeof entry !== 'object') return null;

  const oplName = (entry.opl_name ?? '').toString().trim();
  if (!oplName) return null;

  const name = (
    entry.name ??
    entry.order ??
    entry.sale_order ??
    entry.custom_order_name ??
    oplName
  )
    .toString()
    .trim();

  return {
    oplName,
    name,
    customer: (entry.customer ?? '').toString().trim(),
    varieties: toStringList(entry.varieties),
    stemLengths: toStringList(entry.stem_lengths),
    qty: (entry.qty ?? '').toString(),
    itemGroups: toStringList(entry.custom_item_group ?? entry.item_group),
    teams: toStringList(entry.custom_team ?? entry.team),
    schedule: Number(entry.schedule ?? 0) || 0,
    scheduleTeam: (entry.schedule_team ?? '').toString(),
    isNext: !!entry.is_next,
  };
}

export function extractOrders(raw: RawReadyOrdersResponse): ReadyOrder[] {
  // Real Frappe response: `{message: "Found N pick lists…", orders: [...]}`.
  // The orders live at the top level — `message` is a human-readable string.
  // We also tolerate the legacy nested shapes for safety.
  //
  // One row PER ORDER PICK LIST — never merged by sale order name. A sale
  // order can have several OPLs (e.g. split by team), each with its own
  // customer/variety/qty and its own buckets to issue.
  let list: (string | RawReadyOrder)[] = [];
  if (Array.isArray(raw?.orders)) {
    list = raw.orders;
  } else {
    const m = raw?.message;
    if (Array.isArray(m)) list = m;
    else if (m && typeof m !== 'string') list = m.orders ?? [];
  }

  const byOpl = new Map<string, ReadyOrder>();
  for (const entry of list) {
    const ro = toReadyOrder(entry);
    if (!ro) continue;
    byOpl.set(ro.oplName, ro);
  }
  return [...byOpl.values()];
}

function extractPackingList(raw: RawPackingListResponse): PackingItem[] {
  // Real shape: `{message: "…", packing_list: [...]}` — top-level array.
  let rows: RawReadySaleOrderItem[] = [];
  if (Array.isArray(raw?.packing_list)) {
    rows = raw.packing_list;
  } else {
    const m = raw?.message;
    if (m && typeof m !== 'string') {
      rows = Array.isArray(m) ? m : (m.packing_list ?? []);
    }
  }
  // The OPL holds one Pick List Item PER BOX (and per sale order line), so a
  // single bucket arrives as several rows. Show it once per OPL; the lines
  // stay inside it because the server still issues each line separately.
  const merged = new Map<string, PackingItem>();
  for (const r of rows) {
    const bucket = (r.bucket ?? '').toString();
    const oplName = (r.opl_name ?? '').toString();
    const saleOrderItem = (r.custom_sale_order_item ?? '').toString();
    const qty = Number(r.qty) || 0;
    const isIssued = r.is_issued === true || r.is_issued === 1;
    const variety = (r.variety ?? '').toString();
    const stemLength = (r.stem_length ?? '').toString();
    const key = `${oplName}|${bucket.toLowerCase()}`;

    let item = merged.get(key);
    if (!item) {
      item = {
        variety,
        bucket,
        stemLength,
        shelf:         (r.shelf ?? '').toString(),
        saleOrderItem,
        oplName,
        qty:           '0',
        team:          (r.team ?? 'Unassigned').toString(),
        mixed:         typeof r.mixed === 'number' ? r.mixed : 0,
        downgradeTo:   r.downgrade_to ? r.downgrade_to.toString() : null,
        isIssued:      true,
        waitingTransfer: null,
        lines:         [],
      };
      merged.set(key, item);
    } else {
      item.variety = joinDistinct(item.variety, variety);
      item.stemLength = joinDistinct(item.stemLength, stemLength);
      if (typeof r.mixed === 'number' && r.mixed) item.mixed = r.mixed;
      if (!item.downgradeTo && r.downgrade_to) item.downgradeTo = r.downgrade_to.toString();
    }

    if (r.waiting_transfer) item.waitingTransfer = (r.transfer_farm ?? '').toString() || 'remote farm';
    item.qty = String((Number(item.qty) || 0) + qty);
    item.isIssued = item.isIssued && isIssued;
    const line = item.lines.find((l) => l.saleOrderItem === saleOrderItem);
    if (line) {
      line.qty += qty;
      line.isIssued = line.isIssued && isIssued;
    } else {
      item.lines.push({ saleOrderItem, qty, isIssued });
    }
  }
  return [...merged.values()];
}

function joinDistinct(list: string, value: string): string {
  if (!value) return list;
  const parts = list ? list.split(', ') : [];
  return parts.includes(value) ? list : [...parts, value].join(', ');
}

function extractMessage(raw: RawIssueResponse): string | undefined {
  const m = raw?.message;
  if (!m) return undefined;
  if (typeof m === 'string') return m;
  return m.message;
}

/** Pull a bucket id out of a scan payload. Accepts:
 *  - bare strings (just the bucket id)
 *  - {"bucket_id":"…"} or {"id":"…"}
 *  - {"BUCK-001":"bucket", …}   ← legacy QR shape */
function extractBucketIdFromScan(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (!trimmed.startsWith('{')) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof parsed.bucket_id === 'string' && parsed.bucket_id.trim()) {
      return parsed.bucket_id.trim();
    }
    if (typeof parsed.id === 'string' && parsed.id.trim()) {
      return parsed.id.trim();
    }
    for (const [k, v] of Object.entries(parsed)) {
      if (v === 'bucket') return k;
    }
    return '';
  } catch {
    return '';
  }
}

export const useKarenIssuingStore = create<State>((set, get) => ({
  ordersLoading: false,
  availableOrders: [],
  selectedDate: tomorrowISO(),
  selectedItemGroup: null,
  selectedTeam: null,

  packingLoading: false,
  selectedOpl: null,
  packingItems: [],

  submitting: false,
  lastOutcome: null,
  replace: null,

  loadOrders: async () => {
    set({ ordersLoading: true });
    try {
      const raw = await karenIssuingApi.fetchReadyOrders(get().selectedDate);
      // Drop stale filters if the reloaded orders no longer contain them.
      const orders = extractOrders(raw);
      const groups = new Set(orders.flatMap((o) => o.itemGroups));
      const teams = new Set(orders.flatMap((o) => o.teams));
      set((s) => ({
        availableOrders: orders,
        ordersLoading: false,
        selectedItemGroup:
          s.selectedItemGroup && groups.has(s.selectedItemGroup) ? s.selectedItemGroup : null,
        selectedTeam: s.selectedTeam && teams.has(s.selectedTeam) ? s.selectedTeam : null,
      }));
    } catch (err) {
      const message = mapAxiosError(err).message || 'Could not load sale orders.';
      set({
        availableOrders: [],
        ordersLoading: false,
        selectedItemGroup: null,
        selectedTeam: null,
        lastOutcome: { kind: 'error', bucket: null, message },
      });
    }
  },

  setDate: async (date) => {
    // New day: clear the selected OPL + packing list, then refetch.
    set({
      selectedDate: date,
      selectedOpl: null,
      packingItems: [],
      selectedItemGroup: null,
      selectedTeam: null,
      lastOutcome: null,
    });
    await get().loadOrders();
  },

  setItemGroup: (group) => set({ selectedItemGroup: group }),
  setTeam: (team) => set({ selectedTeam: team }),

  selectOrder: async (oplName) => {
    set({
      selectedOpl: oplName,
      packingItems: [],
      packingLoading: true,
      lastOutcome: null,
    });
    try {
      const raw = await karenIssuingApi.fetchPackingList(oplName);
      set({ packingItems: extractPackingList(raw), packingLoading: false });
    } catch (err) {
      const message = mapAxiosError(err).message || 'Could not load packing list.';
      set({
        packingItems: [],
        packingLoading: false,
        lastOutcome: { kind: 'error', bucket: null, message },
      });
    }
  },

  submitScan: async (raw) => {
    const state = get();
    if (!state.selectedOpl) {
      const out: IssueOutcome = {
        kind: 'error',
        bucket: null,
        message: 'Pick a pick list before scanning.',
      };
      set({ lastOutcome: out });
      return out;
    }

    const bucketId = extractBucketIdFromScan(raw);
    if (!bucketId) {
      const out: IssueOutcome = {
        kind: 'error',
        bucket: null,
        message: 'Could not read a bucket ID from that scan.',
      };
      set({ lastOutcome: out });
      return out;
    }

    const match = state.packingItems.find(
      (it) => it.bucket.toLowerCase() === bucketId.toLowerCase(),
    );

    if (!match) {
      const out: IssueOutcome = {
        kind: 'error',
        bucket: bucketId,
        message: `Bucket ${bucketId} isn't allocated to ${state.selectedOpl}.`,
      };
      set({ lastOutcome: out });
      return out;
    }
    if (match.lines.some((l) => !l.saleOrderItem)) {
      const out: IssueOutcome = {
        kind: 'error',
        bucket: bucketId,
        message: `Bucket ${bucketId} has no Sale Order Item — server data is incomplete.`,
      };
      set({ lastOutcome: out });
      return out;
    }
    const pending = match.lines.filter((l) => !l.isIssued);
    if (match.isIssued || pending.length === 0) {
      const out: IssueOutcome = {
        kind: 'error',
        bucket: bucketId,
        message: `Bucket ${bucketId} is already issued.`,
      };
      set({ lastOutcome: out });
      return out;
    }

    if (match.waitingTransfer) {
      const out: IssueOutcome = {
        kind: 'error',
        bucket: bucketId,
        message: `Bucket ${bucketId} is waiting for transfer from ${match.waitingTransfer}. Issue it once it arrives and is shelved.`,
      };
      set({ lastOutcome: out });
      return out;
    }

    set({ submitting: true });
    // One scan hands over the whole bucket: issue each of its outstanding
    // lines in turn, stopping at the first the server rejects.
    const issued = new Set<string>();
    const messages: string[] = [];
    let failure: string | null = null;
    for (const line of pending) {
      try {
        const res = await karenIssuingApi.issueBucket({
          bucket: match.bucket,
          sale_order_item: line.saleOrderItem,
          opl_name: match.oplName,
        });
        issued.add(line.saleOrderItem);
        const m = extractMessage(res);
        if (m) messages.push(m);
      } catch (err) {
        failure = mapAxiosError(err).message || 'Issue failed.';
        break;
      }
    }

    // Optimistically mark the issued lines so the operator sees immediate
    // feedback without waiting for a re-fetch.
    const updated = get().packingItems.map((it) => {
      if (it !== match && !(it.oplName === match.oplName && it.bucket === match.bucket)) return it;
      const lines = it.lines.map((l) =>
        issued.has(l.saleOrderItem) ? { ...l, isIssued: true } : l,
      );
      return { ...it, lines, isIssued: lines.every((l) => l.isIssued) };
    });

    const out: IssueOutcome = failure
      ? { kind: 'error', bucket: bucketId, message: failure }
      : { kind: 'success', bucket: bucketId, message: [...new Set(messages)].join('\n') || undefined };
    set({ submitting: false, packingItems: updated, lastOutcome: out });
    return out;
  },

  openReplace: async (item) => {
    const opl = get().selectedOpl;
    if (!opl) return;
    const pendingLine = item.lines.find((l) => !l.isIssued)?.saleOrderItem;
    set({
      replace: { item, loading: true, candidates: [], neededQty: null, message: null, warning: null, submitting: false },
    });
    try {
      const res = await karenIssuingApi.fetchReplacementOptions({
        opl_name: opl,
        bucket: item.bucket,
        sale_order_item: pendingLine || undefined,
      });
      if (get().replace?.item !== item) return; // closed or moved on meanwhile
      set({
        replace: {
          item,
          loading: false,
          neededQty: typeof res.needed_qty === 'number' ? res.needed_qty : null,
          message: res.found ? res.message || null : res.message || 'No bucket can replace this one.',
          warning: res.found ? res.warning || null : null,
          submitting: false,
          candidates: (res.candidates ?? []).map((c) => ({
            bucket: c.new_bucket,
            shelf: c.shelf ?? null,
            stemLength: c.stem_length ?? null,
            availableQty: typeof c.available_qty === 'number' ? c.available_qty : null,
            harvestDate: c.harvest_date ?? null,
            farm: c.remote ? c.farm ?? null : null,
          })),
        },
      });
    } catch (err) {
      if (get().replace?.item !== item) return;
      set({
        replace: {
          item,
          loading: false,
          candidates: [],
          neededQty: null,
          warning: null,
          message: mapAxiosError(err).message || 'Could not load replacements.',
          submitting: false,
        },
      });
    }
  },

  closeReplace: () => set({ replace: null }),

  confirmReplace: async (newBucket, reason) => {
    const sheet = get().replace;
    const opl = get().selectedOpl;
    if (!sheet || !opl) return { ok: false, message: 'Nothing to replace.' };
    set({ replace: { ...sheet, submitting: true } });
    try {
      const res = await karenIssuingApi.replaceBucket({
        opl_name: opl,
        bucket: sheet.item.bucket,
        new_bucket_id: newBucket,
        reason,
        sale_order_item: sheet.item.lines.find((l) => !l.isIssued)?.saleOrderItem || undefined,
      });
      if (!res.success) {
        set({ replace: { ...sheet, submitting: false } });
        return { ok: false, message: res.message || 'The replacement failed.' };
      }
      set({ replace: null });
      // The OPL now lists the replacement; scanning it issues it as usual.
      await get().selectOrder(opl);
      if (res.remote_farm) {
        return { ok: true, message: res.message || `${newBucket} requested from ${res.remote_farm}.` };
      }
      const where = res.shelf ? ` from shelf ${res.shelf}` : '';
      return { ok: true, message: `${sheet.item.bucket} replaced. Fetch ${newBucket}${where} and scan it.` };
    } catch (err) {
      set({ replace: { ...sheet, submitting: false } });
      return { ok: false, message: mapAxiosError(err).message || 'The replacement failed.' };
    }
  },

  issuedOfflineInfo: async () => {
    const sheet = get().replace;
    const opl = get().selectedOpl;
    if (!sheet || !opl) return { kind: 'error', message: 'Nothing to check.' };
    try {
      const res = await karenIssuingApi.fetchIssuedOfflineInfo({
        opl_name: opl,
        bucket: sheet.item.bucket,
        sale_order_item: sheet.item.lines.find((l) => !l.isIssued)?.saleOrderItem || undefined,
      });
      if (!res.success) return { kind: 'error', message: res.message || 'Could not check where it was issued.' };
      return {
        kind: 'ok',
        line: res.line ?? '',
        sameLine: !!res.same_line,
        issuedTo: (res.issued_to ?? []).map((r) => ({
          opl: r.opl,
          orderName: r.order_name || r.opl,
          team: r.team ?? '',
          sameLine: !!r.same_line,
        })),
      };
    } catch (err) {
      return { kind: 'error', message: mapAxiosError(err).message || 'Could not check where it was issued.' };
    }
  },

  markIssuedOffline: async () => {
    const sheet = get().replace;
    const opl = get().selectedOpl;
    if (!sheet || !opl) return { ok: false, message: 'Nothing to mark.' };
    set({ replace: { ...sheet, submitting: true } });
    try {
      const res = await karenIssuingApi.markIssuedOffline({
        opl_name: opl,
        bucket: sheet.item.bucket,
        sale_order_item: sheet.item.lines.find((l) => !l.isIssued)?.saleOrderItem || undefined,
      });
      if (!res.success) {
        set({ replace: { ...sheet, submitting: false } });
        return { ok: false, message: res.message || 'Could not mark it issued.' };
      }
      set({ replace: null });
      await get().selectOrder(opl);
      return { ok: true, message: res.message || `${sheet.item.bucket} marked issued.` };
    } catch (err) {
      set({ replace: { ...sheet, submitting: false } });
      return { ok: false, message: mapAxiosError(err).message || 'Could not mark it issued.' };
    }
  },

  reset: () =>
    set({
      ordersLoading: false,
      availableOrders: [],
      selectedDate: tomorrowISO(),
      selectedItemGroup: null,
      selectedTeam: null,
      packingLoading: false,
      selectedOpl: null,
      packingItems: [],
      submitting: false,
      lastOutcome: null,
      replace: null,
    }),
}));
