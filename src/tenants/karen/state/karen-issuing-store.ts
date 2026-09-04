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
};

export type IssueOutcome =
  | { kind: 'success'; bucket: string; message?: string }
  | { kind: 'error';   bucket: string | null; message: string };

/** A sale order ready to be issued, with the OPL item group(s) + team(s) it spans. */
export type ReadyOrder = { name: string; itemGroups: string[]; teams: string[] };

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
  selectedOrder: string | null;
  packingItems: PackingItem[];

  submitting: boolean;
  lastOutcome: IssueOutcome | null;

  loadOrders: () => Promise<void>;
  setDate: (date: string) => Promise<void>;
  setItemGroup: (group: string | null) => void;
  setTeam: (team: string | null) => void;
  selectOrder: (orderName: string) => Promise<void>;
  /** Parse a scanned bucket QR, find the matching packing line, submit. */
  submitScan: (raw: string) => Promise<IssueOutcome>;
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

/** Coerce one raw entry (bare name or enriched object) into a ReadyOrder. */
function toReadyOrder(entry: string | RawReadyOrder): ReadyOrder | null {
  if (typeof entry === 'string') {
    const name = entry.trim();
    return name ? { name, itemGroups: [], teams: [] } : null;
  }
  if (entry && typeof entry === 'object') {
    const name = (
      entry.name ??
      entry.order ??
      entry.sale_order ??
      entry.custom_order_name ??
      ''
    )
      .toString()
      .trim();
    if (!name) return null;
    return {
      name,
      itemGroups: toStringList(entry.custom_item_group ?? entry.item_group),
      teams: toStringList(entry.custom_team ?? entry.team),
    };
  }
  return null;
}

export function extractOrders(raw: RawReadyOrdersResponse): ReadyOrder[] {
  // Real Frappe response: `{message: "Found N orders…", orders: [...]}`.
  // The orders live at the top level — `message` is a human-readable string.
  // We also tolerate the legacy nested shapes for safety. Entries may be bare
  // name strings or objects enriched with the OPL item group.
  let list: (string | RawReadyOrder)[] = [];
  if (Array.isArray(raw?.orders)) {
    list = raw.orders;
  } else {
    const m = raw?.message;
    if (Array.isArray(m)) list = m;
    else if (m && typeof m !== 'string') list = m.orders ?? [];
  }

  // Merge by order name: the backend may emit one row per OPL, so the same
  // order can appear several times carrying different item groups.
  const byName = new Map<string, ReadyOrder>();
  for (const entry of list) {
    const ro = toReadyOrder(entry);
    if (!ro) continue;
    const existing = byName.get(ro.name);
    if (existing) {
      for (const g of ro.itemGroups) {
        if (!existing.itemGroups.includes(g)) existing.itemGroups.push(g);
      }
      for (const t of ro.teams) {
        if (!existing.teams.includes(t)) existing.teams.push(t);
      }
    } else {
      byName.set(ro.name, {
        name: ro.name,
        itemGroups: [...ro.itemGroups],
        teams: [...ro.teams],
      });
    }
  }
  return [...byName.values()];
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
  return rows.map((r) => ({
    variety:       (r.variety ?? '').toString(),
    bucket:        (r.bucket ?? '').toString(),
    stemLength:    (r.stem_length ?? '').toString(),
    shelf:         (r.shelf ?? '').toString(),
    saleOrderItem: (r.custom_sale_order_item ?? '').toString(),
    oplName:       (r.opl_name ?? '').toString(),
    qty:           (r.qty ?? '').toString(),
    team:          (r.team ?? 'Unassigned').toString(),
    mixed:         typeof r.mixed === 'number' ? r.mixed : 0,
    downgradeTo:   r.downgrade_to ? r.downgrade_to.toString() : null,
    isIssued:      r.is_issued === true || r.is_issued === 1,
  }));
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
  selectedOrder: null,
  packingItems: [],

  submitting: false,
  lastOutcome: null,

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
    // New day: clear the selected order + packing list, then refetch.
    set({
      selectedDate: date,
      selectedOrder: null,
      packingItems: [],
      selectedItemGroup: null,
      selectedTeam: null,
      lastOutcome: null,
    });
    await get().loadOrders();
  },

  setItemGroup: (group) => set({ selectedItemGroup: group }),
  setTeam: (team) => set({ selectedTeam: team }),

  selectOrder: async (orderName) => {
    set({
      selectedOrder: orderName,
      packingItems: [],
      packingLoading: true,
      lastOutcome: null,
    });
    try {
      const raw = await karenIssuingApi.fetchPackingList(orderName);
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
    if (!state.selectedOrder) {
      const out: IssueOutcome = {
        kind: 'error',
        bucket: null,
        message: 'Pick a sale order before scanning.',
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
        message: `Bucket ${bucketId} isn't allocated to ${state.selectedOrder}.`,
      };
      set({ lastOutcome: out });
      return out;
    }
    if (!match.saleOrderItem) {
      const out: IssueOutcome = {
        kind: 'error',
        bucket: bucketId,
        message: `Bucket ${bucketId} has no Sale Order Item — server data is incomplete.`,
      };
      set({ lastOutcome: out });
      return out;
    }
    if (match.isIssued) {
      const out: IssueOutcome = {
        kind: 'error',
        bucket: bucketId,
        message: `Bucket ${bucketId} is already issued.`,
      };
      set({ lastOutcome: out });
      return out;
    }

    set({ submitting: true });
    try {
      const res = await karenIssuingApi.issueBucket({
        bucket: bucketId,
        sale_order_item: match.saleOrderItem,
        opl_name: match.oplName,
      });
      // Optimistically mark the matched row as issued so the operator sees
      // immediate feedback without waiting for a re-fetch.
      const updated = state.packingItems.map((it) =>
        it.bucket.toLowerCase() === bucketId.toLowerCase()
          ? { ...it, isIssued: true }
          : it,
      );
      const out: IssueOutcome = {
        kind: 'success',
        bucket: bucketId,
        message: extractMessage(res),
      };
      set({ submitting: false, packingItems: updated, lastOutcome: out });
      return out;
    } catch (err) {
      const message = mapAxiosError(err).message || 'Issue failed.';
      const out: IssueOutcome = { kind: 'error', bucket: bucketId, message };
      set({ submitting: false, lastOutcome: out });
      return out;
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
      selectedOrder: null,
      packingItems: [],
      submitting: false,
      lastOutcome: null,
    }),
}));
