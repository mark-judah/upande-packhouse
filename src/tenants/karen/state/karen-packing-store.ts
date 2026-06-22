import { create } from 'zustand';
import { karenPackingApi } from '../api/karen-packing-api';
import type {
  PackListItemPayload,
  RawBunchEntry,
  RawBunchResponse,
  RawPickListWithFpl,
  RawPickListWithFplResponse,
  RawPicklistsResponse,
} from '../api/karen-packing-api';
import { mapAxiosError } from '@/src/core/api/client';
import { todayISO } from '@/src/core/date';

// ---------------------------------------------------------------------
// Normalised view models
// ---------------------------------------------------------------------
export type OplOption = { oplName: string; orderName: string; itemGroup: string; team: string };

export type PickListLine = {
  itemCode: string;
  itemName: string;
  qty: number;
  uom: string;
  warehouse: string;
  stemLength: string;
  /** Specification from the Sales Order line (custom_line), e.g. "DI05 CERISE 52CM". */
  spec: string;
};

export type PackingGuideItem = {
  itemCode: string;
  itemName: string;
  plannedStems: number;
};

export type PackingGuide = {
  itemGroup: string;
  isMixed: boolean;
  /** Planned box count (>= 1). */
  plannedBoxes: number;
  packratePerBox: number;
  items: PackingGuideItem[];
};

export type PackOutcome =
  | { kind: 'success'; message?: string }
  | { kind: 'error'; message: string }
  | { kind: 'warning'; message: string };

const DEFAULT_SOURCE_WAREHOUSE = 'Goods sold - KF';

type State = {
  // picklist selection
  picklistsLoading: boolean;
  availablePicklists: OplOption[];
  /** Day being viewed (YYYY-MM-DD). Defaults to today; lets users see past orders. */
  selectedDate: string;
  /** Active item-group filter for the picklist picker; null = show all. */
  selectedItemGroup: string | null;
  /** Active team filter for the picklist picker; null = show all. */
  selectedTeam: string | null;

  // selected order
  guideLoading: boolean;
  showTable: boolean;
  selectedOpl: string | null;
  saleOrderId: string;
  customerId: string;
  pickListItems: PickListLine[];
  packingGuide: PackingGuide | null;

  // packing progress
  /** key `${itemCode}|${uom}|${stemLength}` -> packed bunch count. */
  packedBunchesTally: Record<string, number>;
  /** variety -> (boxNumber -> stems already in that box). */
  varietyStemsInBox: Record<string, Record<number, number>>;
  scannedBunchIds: string[];
  currentBoxId: number;
  lastScannedKey: string | null;

  submitting: boolean;
  lastOutcome: PackOutcome | null;

  // actions
  loadPicklists: () => Promise<void>;
  setDate: (date: string) => Promise<void>;
  setItemGroup: (group: string | null) => void;
  setTeam: (team: string | null) => void;
  selectOpl: (oplName: string) => Promise<void>;
  setBox: (box: number) => void;
  submitScan: (raw: string) => Promise<PackOutcome>;
  submitManual: (enteredQty: number) => Promise<PackOutcome>;
  reset: () => void;
};

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function toNum(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/** Stems per bunch from a UOM string like "Bunch (10)". Falls back to 10. */
export function stemsPerBunch(uom: string): number {
  const m = uom.match(/\((\d+)\)/);
  return m ? parseInt(m[1], 10) : 10;
}

function key(itemCode: string, uom: string, stemLength: string): string {
  return `${itemCode}|${uom}|${stemLength}`;
}

function extractPicklists(raw: RawPicklistsResponse): OplOption[] {
  const data = raw?.message?.data ?? [];
  return data
    .map((d) => ({
      oplName: (d.opl_name ?? '').toString(),
      orderName: (d.order_name ?? '').toString(),
      itemGroup: (d.item_group ?? '').toString(),
      team: (d.team ?? '').toString(),
    }))
    .filter((o) => o.oplName.length > 0);
}

function extractPickListWithFpl(
  raw: RawPickListWithFplResponse,
): RawPickListWithFpl | null {
  if (raw?.data && typeof raw.data === 'object') return raw.data;
  const m = raw?.message;
  if (m && typeof m === 'object') {
    if ('data' in m && m.data) return m.data as RawPickListWithFpl;
    if ('order_pick_list' in m) return m as RawPickListWithFpl;
  }
  return null;
}

/** Planned box count from the guide; always >= 1 (matches Flutter). */
function plannedBoxesFrom(planned: number | null | undefined): number {
  const n = toNum(planned, 0);
  return n > 0 ? Math.ceil(n) : 1;
}

/** Build the normalised packing view from the server payload. */
function buildGuideView(payload: RawPickListWithFpl): {
  pickListItems: PickListLine[];
  packingGuide: PackingGuide | null;
  packedBunchesTally: Record<string, number>;
  varietyStemsInBox: Record<string, Record<number, number>>;
  saleOrderId: string;
  customerId: string;
} {
  const opl = payload.order_pick_list ?? {};
  const farmPackLists = payload.farm_pack_lists ?? [];
  const guideRaw = payload.packing_guide ?? {};

  const pickListItems: PickListLine[] = (opl.locations ?? []).map((l) => ({
    itemCode: (l.item_code ?? '').toString(),
    itemName: (l.item_name ?? l.item_code ?? '').toString(),
    qty: toNum(l.qty),
    uom: (l.uom ?? '').toString(),
    warehouse: (l.warehouse ?? '').toString(),
    stemLength: (l.custom_stem_length ?? '').toString(),
    spec: (l.custom_spec ?? '').toString(),
  }));

  // stems already packed, per variety per box
  const varietyStemsInBox: Record<string, Record<number, number>> = {};
  for (const fpl of farmPackLists) {
    for (const item of fpl.pack_list_item ?? []) {
      const boxNum = parseInt((item.box_id ?? '1').toString(), 10) || 1;
      const stems =
        toNum(item.custom_number_of_stems, 0) || toNum(item.bunch_qty, 0) * 10;
      const variety = (item.item_code ?? '').toString();
      if (!variety) continue;
      varietyStemsInBox[variety] = varietyStemsInBox[variety] ?? {};
      varietyStemsInBox[variety][boxNum] =
        (varietyStemsInBox[variety][boxNum] ?? 0) + stems;
    }
  }

  // packed bunch tally, per order line
  const packedBunchesTally: Record<string, number> = {};
  for (const line of pickListItems) {
    let count = 0;
    for (const fpl of farmPackLists) {
      for (const item of fpl.pack_list_item ?? []) {
        if (
          item.item_code === line.itemCode &&
          item.bunch_uom === line.uom &&
          item.stem_length === line.stemLength
        ) {
          count += toNum(item.bunch_qty, 0);
        }
      }
    }
    packedBunchesTally[key(line.itemCode, line.uom, line.stemLength)] = count;
  }

  const packingGuide: PackingGuide = {
    itemGroup: (guideRaw.item_group ?? '').toString(),
    isMixed: guideRaw.is_mixed === true,
    plannedBoxes: plannedBoxesFrom(guideRaw.planned_boxes),
    packratePerBox: toNum(guideRaw.packrate_per_box, 0),
    items: (guideRaw.items ?? []).map((it) => ({
      itemCode: (it.item_code ?? '').toString(),
      itemName: (it.item_name ?? it.item_code ?? '').toString(),
      plannedStems: toNum(it.planned_stems, 0),
    })),
  };

  return {
    pickListItems,
    packingGuide,
    packedBunchesTally,
    varietyStemsInBox,
    saleOrderId: (opl.sales_order ?? '').toString(),
    customerId: (opl.customer ?? '').toString(),
  };
}

function extractBunch(raw: RawBunchResponse): RawBunchEntry | null {
  const m = raw?.message;
  if (!m || typeof m !== 'object') return null;
  if ('error' in m && m.error === true) return null;
  return m as RawBunchEntry;
}

/** target stems per variety per box for a mixed box. */
function targetPerVariety(guide: PackingGuide, variety: string): number {
  const item = guide.items.find((i) => i.itemCode === variety);
  if (!item || guide.plannedBoxes <= 0) return 0;
  return Math.round(item.plannedStems / guide.plannedBoxes);
}

export const useKarenPackingStore = create<State>((set, get) => ({
  picklistsLoading: false,
  availablePicklists: [],
  selectedDate: todayISO(),
  selectedItemGroup: null,
  selectedTeam: null,

  guideLoading: false,
  showTable: false,
  selectedOpl: null,
  saleOrderId: '',
  customerId: '',
  pickListItems: [],
  packingGuide: null,

  packedBunchesTally: {},
  varietyStemsInBox: {},
  scannedBunchIds: [],
  currentBoxId: 1,
  lastScannedKey: null,

  submitting: false,
  lastOutcome: null,

  loadPicklists: async () => {
    set({ picklistsLoading: true });
    try {
      const raw = await karenPackingApi.fetchPicklists(get().selectedDate);
      // Drop a stale group filter if the reloaded picklists no longer contain it.
      const picklists = extractPicklists(raw);
      const groups = new Set(picklists.map((p) => p.itemGroup).filter(Boolean));
      const teams = new Set(picklists.map((p) => p.team).filter(Boolean));
      set((s) => ({
        availablePicklists: picklists,
        picklistsLoading: false,
        selectedItemGroup:
          s.selectedItemGroup && groups.has(s.selectedItemGroup) ? s.selectedItemGroup : null,
        selectedTeam: s.selectedTeam && teams.has(s.selectedTeam) ? s.selectedTeam : null,
      }));
    } catch (err) {
      const message = mapAxiosError(err).message || 'Could not load pick lists.';
      set({
        availablePicklists: [],
        picklistsLoading: false,
        selectedItemGroup: null,
        selectedTeam: null,
        lastOutcome: { kind: 'error', message },
      });
    }
  },

  setDate: async (date) => {
    // New day: clear the loaded order + picklists, then refetch for that day.
    set({
      selectedDate: date,
      selectedOpl: null,
      showTable: false,
      packingGuide: null,
      pickListItems: [],
      packedBunchesTally: {},
      varietyStemsInBox: {},
      scannedBunchIds: [],
      currentBoxId: 1,
      lastScannedKey: null,
      selectedItemGroup: null,
      selectedTeam: null,
    });
    await get().loadPicklists();
  },

  setItemGroup: (group) => set({ selectedItemGroup: group }),

  setTeam: (team) => set({ selectedTeam: team }),

  selectOpl: async (oplName) => {
    // Fresh selection: clear box + scan history (a reload after packing keeps
    // them by calling reloadGuide internally instead).
    set({
      selectedOpl: oplName,
      guideLoading: true,
      showTable: false,
      packingGuide: null,
      pickListItems: [],
      packedBunchesTally: {},
      varietyStemsInBox: {},
      scannedBunchIds: [],
      currentBoxId: 1,
      lastScannedKey: null,
      lastOutcome: null,
    });
    await reloadGuide(oplName, set);
  },

  setBox: (box) => {
    set({ currentBoxId: box, lastOutcome: { kind: 'success', message: `Packing Box ${box}` } });
  },

  submitScan: async (raw) => {
    const state = get();
    const guide = state.packingGuide;

    const fail = (kind: 'error' | 'warning', message: string): PackOutcome => {
      const out: PackOutcome = { kind, message };
      set({ lastOutcome: out });
      return out;
    };

    if (!state.selectedOpl || !state.showTable) {
      return fail('warning', 'Select an order before scanning.');
    }

    // Parse the bunch QR.
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw.trim()) as Record<string, unknown>;
    } catch {
      return fail('warning', 'Failed to decode QR.');
    }
    const bunchId = (parsed.bunch_id ?? '').toString();
    if (!bunchId) return fail('warning', 'Valid bunch QR required.');

    const variety = (parsed.variety ?? '').toString();
    const bunchSize = (parsed.bunch_size ?? '').toString();
    const bunchStems = stemsPerBunch(bunchSize);

    // Box-full guard: block a scan that would push the box past its packrate.
    if (guide && guide.packratePerBox > 0) {
      const inBox = Object.values(state.varietyStemsInBox).reduce(
        (sum, byBox) => sum + (byBox[state.currentBoxId] ?? 0),
        0,
      );
      if (inBox + bunchStems > guide.packratePerBox) {
        return fail(
          'warning',
          `Box ${state.currentBoxId} is full (${guide.packratePerBox} stems). Switch to the next box.`,
        );
      }
    }

    // Strict per-variety limit for mixed boxes (+ optimistic reserve).
    if (guide && guide.isMixed && variety) {
      const target = targetPerVariety(guide, variety);
      const alreadyInBox = state.varietyStemsInBox[variety]?.[state.currentBoxId] ?? 0;
      if (alreadyInBox + bunchStems > target) {
        return fail(
          'warning',
          `${variety} target reached in Box ${state.currentBoxId} (${target} stems max)`,
        );
      }
    }

    if (state.scannedBunchIds.includes(bunchId)) {
      return fail('warning', 'You have already scanned this bunch.');
    }

    set({ submitting: true });
    let bunch: RawBunchEntry | null;
    try {
      const res = await karenPackingApi.fetchBunchForPacking(bunchId);
      bunch = extractBunch(res);
    } catch (err) {
      set({ submitting: false });
      return fail('error', mapAxiosError(err).message || 'Bunch lookup failed.');
    }

    if (!bunch) {
      set({ submitting: false });
      return fail('warning', 'Bunch not graded. Perform grading scan first.');
    }
    if (bunch.stock_entry_type === 'Discard') {
      set({ submitting: false });
      return fail('warning', 'You cannot pack a discarded bunch.');
    }
    if (toNum(bunch.scanned_packing) === 1) {
      set({ submitting: false });
      return fail('warning', 'The bunch has already been packed.');
    }

    const pVariety = (bunch.items?.[0]?.item_code ?? '').toString();
    const pUom = (bunch.items?.[0]?.uom ?? '').toString();
    const pLength = (bunch.stem_length ?? '').toString();
    const pStems = stemsPerBunch(pUom);

    // The bunch must match an order line (variety + uom + length).
    const match = state.pickListItems.find(
      (it) => it.itemCode === pVariety && it.uom === pUom && it.stemLength === pLength,
    );
    if (!match) {
      set({ submitting: false });
      const byCode = state.pickListItems.filter((e) => e.itemCode === pVariety);
      const byCodeUom = byCode.filter((e) => e.uom === pUom);
      const message =
        byCode.length === 0
          ? `Variety (${pVariety}) not in pick list.`
          : byCodeUom.length === 0
            ? `Size (${pUom}) invalid for ${pVariety}.`
            : `Stem length (${pLength}) mismatch for ${pVariety}.`;
      return fail('warning', message);
    }

    const compoundKey = key(pVariety, pUom, pLength);
    if ((state.packedBunchesTally[compoundKey] ?? 0) >= match.qty) {
      set({ submitting: false });
      return fail('warning', `${pVariety} (${pLength}) is already fully packed.`);
    }

    // Re-check mixed target against the bunch's resolved variety.
    if (guide && guide.isMixed && pVariety) {
      const target = targetPerVariety(guide, pVariety);
      const alreadyInBox = state.varietyStemsInBox[pVariety]?.[state.currentBoxId] ?? 0;
      if (alreadyInBox + pStems > target) {
        set({ submitting: false });
        return fail(
          'warning',
          `${pVariety} target reached in Box ${state.currentBoxId} (${target} stems max)`,
        );
      }
    }

    const item: PackListItemPayload = {
      item_code: pVariety,
      bunch_uom: pUom,
      bunch_qty: 1,
      source_warehouse: DEFAULT_SOURCE_WAREHOUSE,
      sales_order_id: state.saleOrderId,
      customer_id: state.customerId,
      custom_number_of_stems: pStems,
      custom_stem_length: pLength,
      box_id: state.currentBoxId.toString(),
      bunch_id: bunch.bunch_id ?? bunchId,
    };

    try {
      await karenPackingApi.createOrUpdateFarmPackList({
        custom_farm: match.warehouse ? match.warehouse : '',
        custom_customer: state.customerId,
        custom_sales_order: state.saleOrderId,
        custom_order_pick_list: state.selectedOpl,
        items: [item],
      });
    } catch (err) {
      set({ submitting: false });
      return fail('error', mapAxiosError(err).message || 'Packing failed.');
    }

    set({
      submitting: false,
      lastScannedKey: compoundKey,
      scannedBunchIds: [...state.scannedBunchIds, bunchId],
      lastOutcome: { kind: 'success', message: 'Packed successfully' },
    });
    // Refresh tallies from the server while keeping box + scan history.
    await reloadGuide(state.selectedOpl, set);
    return { kind: 'success', message: 'Packed successfully' };
  },

  submitManual: async (enteredQty) => {
    const state = get();
    const fail = (kind: 'error' | 'warning', message: string): PackOutcome => {
      const out: PackOutcome = { kind, message };
      set({ lastOutcome: out });
      return out;
    };

    if (!state.selectedOpl) return fail('warning', 'Select an order first.');
    const item = state.pickListItems[0];
    if (!item) return fail('warning', 'No order line to pack.');

    if (!Number.isFinite(enteredQty) || enteredQty <= 0) {
      return fail('warning', 'Enter a valid number of bunches.');
    }

    const guide = state.packingGuide;
    const perBunch = stemsPerBunch(item.uom);
    const k = key(item.itemCode, item.uom, item.stemLength);
    const alreadyPacked = Math.trunc(state.packedBunchesTally[k] ?? 0);

    // Cap 1 — order line: never pack more than was ordered for this variety.
    const orderRemaining = Math.max(0, Math.trunc(item.qty) - alreadyPacked);

    // Cap 2 — box capacity: never push the current box past its packrate.
    let boxRemaining = Infinity;
    if (guide && guide.packratePerBox > 0) {
      const boxStems = Object.values(state.varietyStemsInBox).reduce(
        (sum, byBox) => sum + (byBox[state.currentBoxId] ?? 0),
        0,
      );
      boxRemaining = Math.max(0, Math.floor((guide.packratePerBox - boxStems) / perBunch));
    }

    // Cap 3 — mixed boxes: never exceed this variety's per-box target.
    let varietyRemaining = Infinity;
    if (guide && guide.isMixed) {
      const target = targetPerVariety(guide, item.itemCode);
      const inBox = state.varietyStemsInBox[item.itemCode]?.[state.currentBoxId] ?? 0;
      varietyRemaining = Math.max(0, Math.floor((target - inBox) / perBunch));
    }

    const maxBunches = Math.min(orderRemaining, boxRemaining, varietyRemaining);
    if (enteredQty > maxBunches) {
      if (orderRemaining === 0) {
        return fail('warning', `${item.itemCode} is already fully packed.`);
      }
      if (maxBunches === boxRemaining && boxRemaining < orderRemaining) {
        return fail(
          'warning',
          `Box ${state.currentBoxId} has room for ${maxBunches} more bunch(es). Switch to the next box.`,
        );
      }
      return fail('warning', `Cannot exceed ${maxBunches} remaining bunch(es).`);
    }

    const payload: PackListItemPayload = {
      item_code: item.itemCode,
      bunch_uom: item.uom,
      bunch_qty: enteredQty,
      source_warehouse: item.warehouse ? item.warehouse : DEFAULT_SOURCE_WAREHOUSE,
      sales_order_id: state.saleOrderId,
      customer_id: state.customerId,
      custom_number_of_stems: enteredQty * perBunch,
      custom_stem_length: item.stemLength,
      box_id: state.currentBoxId.toString(),
      bunch_id: null,
    };

    set({ submitting: true });
    try {
      await karenPackingApi.createOrUpdateFarmPackList({
        custom_farm: item.warehouse ? item.warehouse : '',
        custom_customer: state.customerId,
        custom_sales_order: state.saleOrderId,
        custom_order_pick_list: state.selectedOpl,
        items: [payload],
      });
    } catch (err) {
      set({ submitting: false });
      return fail('error', mapAxiosError(err).message || 'Packing failed.');
    }

    set({ submitting: false, lastOutcome: { kind: 'success', message: 'Packed successfully' } });
    await reloadGuide(state.selectedOpl, set);
    return { kind: 'success', message: 'Packed successfully' };
  },

  reset: () =>
    set({
      picklistsLoading: false,
      availablePicklists: [],
      selectedDate: todayISO(),
      selectedItemGroup: null,
      guideLoading: false,
      showTable: false,
      selectedOpl: null,
      saleOrderId: '',
      customerId: '',
      pickListItems: [],
      packingGuide: null,
      packedBunchesTally: {},
      varietyStemsInBox: {},
      scannedBunchIds: [],
      currentBoxId: 1,
      lastScannedKey: null,
      submitting: false,
      lastOutcome: null,
    }),
}));

// Fetch + recompute the guide. Does NOT touch currentBoxId / scannedBunchIds,
// so it is safe to call after each pack to refresh tallies in place.
async function reloadGuide(
  oplName: string,
  set: (partial: Partial<State>) => void,
): Promise<void> {
  set({ guideLoading: true });
  try {
    const raw = await karenPackingApi.fetchPickListWithFpl(oplName);
    const payload = extractPickListWithFpl(raw);
    if (!payload) {
      set({ guideLoading: false, lastOutcome: { kind: 'error', message: 'Empty pick list response.' } });
      return;
    }
    if (toNum(payload.order_pick_list?.docstatus) === 0) {
      set({ guideLoading: false, showTable: false, lastOutcome: { kind: 'warning', message: 'This Order Pick List is cancelled.' } });
      return;
    }
    const view = buildGuideView(payload);
    set({
      guideLoading: false,
      showTable: true,
      pickListItems: view.pickListItems,
      packingGuide: view.packingGuide,
      packedBunchesTally: view.packedBunchesTally,
      varietyStemsInBox: view.varietyStemsInBox,
      saleOrderId: view.saleOrderId,
      customerId: view.customerId,
    });
  } catch (err) {
    set({ guideLoading: false, lastOutcome: { kind: 'error', message: mapAxiosError(err).message || 'Could not load pick list.' } });
  }
}
