import { create } from 'zustand';
import { karenPackingApi } from '../api/karen-packing-api';
import type {
  PackListItemPayload,
  RawBunchEntry,
  RawBunchResponse,
  RawPickListWithFpl,
  RawPickListWithFplResponse,
  RawPicklistsResponse,
  RawPackingBypassReasonsResponse,
  RawUnderPackReasonsResponse,
} from '../api/karen-packing-api';
import { mapAxiosError } from '@/src/core/api/client';
import { tomorrowISO } from '@/src/core/date';

// ---------------------------------------------------------------------
// Normalised view models
// ---------------------------------------------------------------------
export type OplOption = {
  oplName: string;
  orderName: string;
  itemGroup: string;
  team: string;
  customer: string;
  varieties: string[];
  stemLengths: string[];
  qty: string;
};

export type PickListLine = {
  itemCode: string;
  itemName: string;
  qty: number;
  uom: string;
  warehouse: string;
  stemLength: string;
  /** Specification from the Sales Order line (custom_line), e.g. "DI05 CERISE 52CM". */
  spec: string;
  /** Item group of this variety (e.g. "Standard Roses" vs "Spray Roses"): decides
   *  manual-entry vs scan during packing. '' when the lookup returned nothing. */
  itemGroup: string;
};

export type PackingGuideItem = {
  itemCode: string;
  itemName: string;
  plannedStems: number;
};

/** One colour/variety component of a mixed-bunch bouquet (the packing recipe). */
export type BouquetGuideItem = {
  colour: string;
  variety: string;
  varietyName: string;
  stemsPerBunch: number;
  length: string;
};

export type PackingGuide = {
  itemGroup: string;
  isMixed: boolean;
  /** Planned box count (>= 1). */
  plannedBoxes: number;
  packratePerBox: number;
  items: PackingGuideItem[];
  /** Mixed BUNCH: this order's bunch is composed of the bouquet-guide rows below. */
  isMixedBunch: boolean;
  bouquetGuide: BouquetGuideItem[];
  /** Spec guide-image path (relative, e.g. /private/files/…); '' when none. */
  specImage: string;
};

export type PackOutcome =
  | { kind: 'success'; message?: string }
  | { kind: 'error'; message: string }
  | { kind: 'warning'; message: string };

/** One reason an operator can pick when a box came in under its packrate. */
export type UnderPackReason = { name: string; reason: string; description: string };

/** One reason an operator can pick when a bunch can't be scanned at all
 *  (damaged/missing QR, or it was never graded) and needs to be logged
 *  instead. */
export type PackingBypassReason = { name: string; reason: string; description: string };

const DEFAULT_SOURCE_WAREHOUSE = 'Goods sold - KF';

type State = {
  // picklist selection
  picklistsLoading: boolean;
  availablePicklists: OplOption[];
  /** Day being viewed (YYYY-MM-DD). Defaults to tomorrow — pack/issue today for tomorrow's shipments; lets users pick other days. */
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
  /** Which pick-list line manual entry currently targets — key(itemCode,
   *  uom, stemLength). A straight box has exactly one line, so this never
   *  needs to change; a mixed bunch/box has several, and the operator
   *  switches between them here instead of being stuck on line 0. */
  selectedItemKey: string | null;

  // packing progress
  /** key `${itemCode}|${uom}|${stemLength}` -> packed bunch count. */
  packedBunchesTally: Record<string, number>;
  /** variety -> (boxNumber -> stems already in that box). */
  varietyStemsInBox: Record<string, Record<number, number>>;
  scannedBunchIds: string[];
  currentBoxId: number;
  lastScannedKey: string | null;
  /** Boxes closed via an Under Pack Reason this session -- packable stems
   *  remain (it was closed short of packrate on purpose), but the box is
   *  done and must not accept any more. Keyed by box number. */
  closedBoxes: Record<number, boolean>;

  submitting: boolean;
  lastOutcome: PackOutcome | null;

  underPackReasons: UnderPackReason[];
  underPackReasonsLoading: boolean;
  reasonSubmitting: boolean;

  packingBypassReasons: PackingBypassReason[];
  packingBypassReasonsLoading: boolean;
  bypassSubmitting: boolean;

  // actions
  loadPicklists: () => Promise<void>;
  setDate: (date: string) => Promise<void>;
  setItemGroup: (group: string | null) => void;
  setTeam: (team: string | null) => void;
  selectOpl: (oplName: string) => Promise<void>;
  /** Switch which pick-list line manual entry targets. */
  selectPackItem: (itemKey: string) => void;
  setBox: (box: number) => void;
  submitScan: (raw: string) => Promise<PackOutcome>;
  submitManual: (enteredQty: number) => Promise<PackOutcome>;
  loadUnderPackReasons: () => Promise<void>;
  /** Save a chosen Under Pack Reason against the current box. */
  submitUnderPackReason: (reasonName: string) => Promise<PackOutcome>;
  loadPackingBypassReasons: () => Promise<void>;
  /** Log `bunches` unscannable bunches against the currently selected line's
   *  box (same caps as submitManual) and record the bypass reason. */
  submitBypass: (reasonName: string, bunches: number) => Promise<PackOutcome>;
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

/** Parse a stem length ('60cm', '60', ' 60 CM ') to a number of cm, or 0 when
 *  unusable. Mirrors the server's _length_cm (upande_packhouse/mobile/api.py)
 *  so the client applies the exact same downgrade rule before ever calling it. */
function lengthCm(value: string): number {
  const n = parseInt(value.toLowerCase().replace('cm', '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

/** A bunch is graded once and its QR label carries that length for life, but
 *  sales allocation can send its BUCKET to an order asking for a SHORTER
 *  length (the stems get cut down at packing) -- so the label and the order
 *  legitimately disagree and the scan must not be refused for it. The reverse
 *  never holds: a 50cm bunch cannot fill a 60cm line. Mirrors the server's
 *  _bunch_packing_target: among pick-list lines for this variety+uom whose
 *  own length is the bunch's length or shorter, the shallowest downgrade
 *  (largest qualifying length) wins.
 *
 *  Returns the matching line, or null with `upgradeOnly` true when every
 *  same-variety+uom line on this pick list wants something LONGER than the
 *  bunch actually is (a real mismatch, not a valid downgrade). */
function findPackTarget(
  pickListItems: PickListLine[],
  itemCode: string,
  uom: string,
  gradedLength: string,
): { match: PickListLine | null; upgradeOnly: boolean } {
  const gradedCm = lengthCm(gradedLength);
  const sameVarietyUom = pickListItems.filter((it) => it.itemCode === itemCode && it.uom === uom);
  if (!gradedCm) return { match: sameVarietyUom[0] ?? null, upgradeOnly: false };

  let best: PickListLine | null = null;
  let bestCm = -1;
  for (const it of sameVarietyUom) {
    const cm = lengthCm(it.stemLength);
    if (!cm || cm > gradedCm) continue; // 0 = unusable; > gradedCm = upgrade, not allowed
    if (cm > bestCm) {
      best = it;
      bestCm = cm;
    }
  }
  return { match: best, upgradeOnly: best === null && sameVarietyUom.length > 0 };
}

function key(itemCode: string, uom: string, stemLength: string): string {
  return `${itemCode}|${uom}|${stemLength}`;
}

/** First pick-list line that isn't fully packed yet, so a fresh load (or
 *  finishing the current line) lands manual entry somewhere useful instead
 *  of a completed line — falls back to the first line, or null if there
 *  are none at all. */
function firstIncompleteItemKey(
  items: PickListLine[],
  tally: Record<string, number>,
): string | null {
  for (const item of items) {
    const k = key(item.itemCode, item.uom, item.stemLength);
    if (Math.trunc(tally[k] ?? 0) < Math.trunc(item.qty)) return k;
  }
  return items[0] ? key(items[0].itemCode, items[0].uom, items[0].stemLength) : null;
}

/** Normalise a value (string or list) into a clean string list. */
function toStringList(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value : value != null ? [value] : [];
  return raw
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function extractPicklists(raw: RawPicklistsResponse): OplOption[] {
  const data = raw?.message?.data ?? [];
  return data
    .map((d) => ({
      oplName: (d.opl_name ?? '').toString(),
      orderName: (d.order_name ?? '').toString(),
      itemGroup: (d.item_group ?? '').toString(),
      team: (d.team ?? '').toString(),
      customer: (d.customer ?? '').toString(),
      varieties: toStringList(d.varieties),
      stemLengths: toStringList(d.stem_lengths),
      qty: (d.qty ?? '').toString(),
    }))
    .filter((o) => o.oplName.length > 0);
}

function extractUnderPackReasons(raw: RawUnderPackReasonsResponse): UnderPackReason[] {
  const data = raw?.data ?? [];
  return data
    .map((d) => ({
      name: (d.name ?? d.reason ?? '').toString(),
      reason: (d.reason ?? d.name ?? '').toString(),
      description: (d.description ?? '').toString(),
    }))
    .filter((r) => r.name.length > 0);
}

function extractPackingBypassReasons(raw: RawPackingBypassReasonsResponse): PackingBypassReason[] {
  const data = raw?.data ?? [];
  return data
    .map((d) => ({
      name: (d.name ?? d.reason ?? '').toString(),
      reason: (d.reason ?? d.name ?? '').toString(),
      description: (d.description ?? '').toString(),
    }))
    .filter((r) => r.name.length > 0);
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

/** Build the normalised packing view from the server payload. Each order line
 *  carries its Item group (server-provided) so packing can tell scan-per-bunch
 *  (spray) from manual-entry (standard) varieties. */
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

  const pickListItems: PickListLine[] = (opl.locations ?? []).map((l) => {
    const itemCode = (l.item_code ?? '').toString();
    return {
      itemCode,
      itemName: (l.item_name ?? l.item_code ?? '').toString(),
      qty: toNum(l.qty),
      uom: (l.uom ?? '').toString(),
      warehouse: (l.warehouse ?? '').toString(),
      // The ORDER's own required length (Sales Order Item.custom_length), not
      // custom_stem_length -- that field holds the bucket's own graded length,
      // which is longer than the order on every downgraded line by design.
      // Comparing a scanned bunch against custom_stem_length here made
      // findPackTarget reject every valid downgrade as "needs longer", since
      // the bucket's graded length is never <= itself minus the downgrade.
      stemLength: (l.custom_so_length || l.custom_stem_length || '').toString(),
      spec: (l.custom_spec ?? '').toString(),
      itemGroup: (l.item_group ?? '').toString(),
    };
  });

  // stems already packed, per variety per box
  const varietyStemsInBox: Record<string, Record<number, number>> = {};
  for (const fpl of farmPackLists) {
    for (const item of fpl.pack_list_item ?? []) {
      const boxNum = parseInt((item.box_id ?? '1').toString(), 10) || 1;
      // Farm Packlist Item has no `custom_number_of_stems` field at all (only
      // `stock_qty` -- see farm_packlist_item.json); `custom_number_of_stems`
      // is an outbound-only field this app sends when packing, never one the
      // server returns. Reading it here always came back 0, so every row
      // silently fell through to the `bunch_qty * 10` guess -- correct only
      // for the 10-stem spray bunches this was tested against, and wrong for
      // any other bunch size (e.g. Standard Roses' 15-stem "Bunch (15)"),
      // under-counting stems already in a box and letting the client's own
      // box-full guard (submitScan/submitManual above) wave through an entry
      // the server's authoritative over-pack guard then has to reject.
      const stems =
        toNum(item.stock_qty, 0) ||
        toNum(item.custom_number_of_stems, 0) ||
        toNum(item.bunch_qty, 0) * 10;
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
    isMixedBunch: guideRaw.is_mixed_bunch === true,
    bouquetGuide: (guideRaw.bouquet_guide ?? []).map((b) => ({
      colour: (b.colour ?? '').toString(),
      variety: (b.variety ?? '').toString(),
      varietyName: (b.variety_name ?? b.variety ?? '').toString(),
      stemsPerBunch: toNum(b.stems_per_bunch, 0),
      length: (b.length ?? '').toString(),
    })),
    specImage: (guideRaw.spec_image ?? '').toString(),
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

/** The backend already computes a specific reason for every rejection (not
 *  graded, already packed, discarded, ...) via frappe.throw -- collapsing
 *  all of them to null here previously threw away that message, so every
 *  rejection surfaced as the same generic "not graded" text regardless of
 *  the real cause (confirmed live: a bunch that was already packed showed
 *  "Bunch not graded. Perform grading scan first." instead of "This bunch
 *  has already been packed"). Carry the real message through instead. */
function extractBunch(raw: RawBunchResponse): { bunch: RawBunchEntry | null; errorMessage: string | null } {
  const m = raw?.message;
  if (!m || typeof m !== 'object') return { bunch: null, errorMessage: null };
  if ('error' in m && m.error === true) {
    return { bunch: null, errorMessage: (m as { message?: string }).message || null };
  }
  return { bunch: m as RawBunchEntry, errorMessage: null };
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
  selectedDate: tomorrowISO(),
  selectedItemGroup: null,
  selectedTeam: null,

  guideLoading: false,
  showTable: false,
  selectedOpl: null,
  saleOrderId: '',
  customerId: '',
  pickListItems: [],
  packingGuide: null,
  selectedItemKey: null,

  packedBunchesTally: {},
  varietyStemsInBox: {},
  scannedBunchIds: [],
  currentBoxId: 1,
  lastScannedKey: null,
  closedBoxes: {},

  submitting: false,
  lastOutcome: null,

  underPackReasons: [],
  underPackReasonsLoading: false,
  reasonSubmitting: false,

  packingBypassReasons: [],
  packingBypassReasonsLoading: false,
  bypassSubmitting: false,

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
      selectedItemKey: null,
      packedBunchesTally: {},
      varietyStemsInBox: {},
      scannedBunchIds: [],
      currentBoxId: 1,
      lastScannedKey: null,
      closedBoxes: {},
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
      selectedItemKey: null,
      packedBunchesTally: {},
      varietyStemsInBox: {},
      scannedBunchIds: [],
      currentBoxId: 1,
      lastScannedKey: null,
      closedBoxes: {},
      lastOutcome: null,
    });
    await reloadGuide(oplName, set);
  },

  selectPackItem: (itemKey) => set({ selectedItemKey: itemKey }),

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

    // Reentrancy guard, checked synchronously before any await: a scanner
    // that keeps injecting keystrokes (or a double-tap) can fire a second
    // onScan before React has re-rendered the ScanField's `editable={false}`,
    // so that UI-level disable alone doesn't stop an overlapping call. Two
    // overlapping submitScan calls can each load the Farm Pack List before
    // the other's append is committed, so the FPL auto-submits and generates
    // its Box Label from whichever snapshot is missing the other's item.
    if (state.submitting) {
      return fail('warning', 'Still submitting the previous scan — please wait.');
    }

    if (!state.selectedOpl || !state.showTable) {
      return fail('warning', 'Select an order before scanning.');
    }
    if (state.closedBoxes[state.currentBoxId]) {
      return fail('warning', `Box ${state.currentBoxId} is closed (under-packed). Switch to the next box.`);
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

    // scannedBunchIds only ever gains an id after a successful pack (see
    // below) -- a hit here means this exact bunch was already packed this
    // session, not merely "scanned", so say that (matches the backend's own
    // wording for the same condition, fetched via fetchBunchForPacking below).
    if (state.scannedBunchIds.includes(bunchId)) {
      return fail('warning', 'This bunch has already been packed.');
    }

    set({ submitting: true });
    let bunch: RawBunchEntry | null;
    let bunchErrorMessage: string | null;
    try {
      const res = await karenPackingApi.fetchBunchForPacking(bunchId);
      ({ bunch, errorMessage: bunchErrorMessage } = extractBunch(res));
    } catch (err) {
      set({ submitting: false });
      return fail('error', mapAxiosError(err).message || 'Bunch lookup failed.');
    }

    if (!bunch) {
      set({ submitting: false });
      return fail('warning', bunchErrorMessage || 'Bunch not graded. Perform grading scan first.');
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

    // The bunch must match an order line (variety + uom), at its own graded
    // length or a shorter one on that line -- never longer. See findPackTarget.
    const { match, upgradeOnly } = findPackTarget(state.pickListItems, pVariety, pUom, pLength);
    if (!match) {
      set({ submitting: false });
      const byCode = state.pickListItems.filter((e) => e.itemCode === pVariety);
      const byCodeUom = byCode.filter((e) => e.uom === pUom);
      const message =
        byCode.length === 0
          ? `Variety (${pVariety}) not in pick list.`
          : byCodeUom.length === 0
            ? `Size (${pUom}) invalid for ${pVariety}.`
            : upgradeOnly
              ? `Bunch graded ${pLength} but ${pVariety} on this pick list needs longer. A bunch can be packed shorter, never longer.`
              : `Stem length (${pLength}) mismatch for ${pVariety}.`;
      return fail('warning', message);
    }
    // The order's own length (may be shorter than what the bunch was graded
    // at) is the length this pack actually counts against.
    const targetLength = match.stemLength;

    const compoundKey = key(pVariety, pUom, targetLength);
    if ((state.packedBunchesTally[compoundKey] ?? 0) >= match.qty) {
      set({ submitting: false });
      return fail('warning', `${pVariety} (${targetLength}) is already fully packed.`);
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
      custom_stem_length: targetLength,
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
    await reloadGuide(state.selectedOpl, set, state.selectedItemKey);
    return { kind: 'success', message: 'Packed successfully' };
  },

  submitManual: async (enteredQty) => {
    const state = get();
    const fail = (kind: 'error' | 'warning', message: string): PackOutcome => {
      const out: PackOutcome = { kind, message };
      set({ lastOutcome: out });
      return out;
    };

    // Same reentrancy guard as submitScan -- see its comment.
    if (state.submitting) {
      return fail('warning', 'Still submitting the previous entry — please wait.');
    }

    if (!state.selectedOpl) return fail('warning', 'Select an order first.');
    if (state.closedBoxes[state.currentBoxId]) {
      return fail('warning', `Box ${state.currentBoxId} is closed (under-packed). Switch to the next box.`);
    }
    // Resolve the SELECTED line, not always the first — a straight box has
    // just one line so this is unchanged for it, but a mixed bunch/box has
    // several, and hardcoding index 0 here used to make every one of them
    // (Athena, Pink Ice, ...) unreachable once the first line was full.
    const item =
      state.pickListItems.find(
        (i) => key(i.itemCode, i.uom, i.stemLength) === state.selectedItemKey,
      ) ?? state.pickListItems[0];
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
    await reloadGuide(state.selectedOpl, set, state.selectedItemKey);
    return { kind: 'success', message: 'Packed successfully' };
  },

  loadUnderPackReasons: async () => {
    if (get().underPackReasons.length > 0) return; // static master data — fetch once per session
    set({ underPackReasonsLoading: true });
    try {
      const raw = await karenPackingApi.fetchUnderPackReasons();
      set({ underPackReasons: extractUnderPackReasons(raw), underPackReasonsLoading: false });
    } catch {
      set({ underPackReasonsLoading: false });
    }
  },

  submitUnderPackReason: async (reasonName) => {
    const state = get();
    const fail = (kind: 'error' | 'warning', message: string): PackOutcome => {
      const out: PackOutcome = { kind, message };
      set({ lastOutcome: out });
      return out;
    };

    if (!state.selectedOpl) return fail('warning', 'Select an order first.');
    const reason = reasonName.trim();
    if (!reason) return fail('warning', 'Pick a reason first.');
    if (state.closedBoxes[state.currentBoxId]) {
      return fail('warning', `Box ${state.currentBoxId} is already closed.`);
    }

    set({ reasonSubmitting: true });
    try {
      await karenPackingApi.setPackListBoxUnderPackReason({
        order_pick_list: state.selectedOpl,
        box_id: state.currentBoxId.toString(),
        reason,
      });
    } catch (err) {
      set({ reasonSubmitting: false });
      return fail('error', mapAxiosError(err).message || 'Could not save reason.');
    }

    // Closed on purpose, short of packrate -- must never accept another
    // scan/manual pack/bypass, unlike a box that's merely not full yet.
    const out: PackOutcome = { kind: 'success', message: `Box ${state.currentBoxId} closed as under-packed.` };
    set((s) => ({
      reasonSubmitting: false,
      lastOutcome: out,
      closedBoxes: { ...s.closedBoxes, [state.currentBoxId]: true },
    }));
    return out;
  },

  loadPackingBypassReasons: async () => {
    if (get().packingBypassReasons.length > 0) return; // static master data — fetch once per session
    set({ packingBypassReasonsLoading: true });
    try {
      const raw = await karenPackingApi.fetchPackingBypassReasons();
      set({ packingBypassReasons: extractPackingBypassReasons(raw), packingBypassReasonsLoading: false });
    } catch {
      set({ packingBypassReasonsLoading: false });
    }
  },

  submitBypass: async (reasonName, bunches) => {
    const state = get();
    const fail = (kind: 'error' | 'warning', message: string): PackOutcome => {
      const out: PackOutcome = { kind, message };
      set({ lastOutcome: out });
      return out;
    };

    if (state.bypassSubmitting) {
      return fail('warning', 'Still submitting the previous bypass — please wait.');
    }
    if (!state.selectedOpl) return fail('warning', 'Select an order first.');
    if (state.closedBoxes[state.currentBoxId]) {
      return fail('warning', `Box ${state.currentBoxId} is closed (under-packed). Switch to the next box.`);
    }
    const reason = reasonName.trim();
    if (!reason) return fail('warning', 'Pick a reason first.');
    if (!Number.isFinite(bunches) || bunches <= 0) {
      return fail('warning', 'Enter a valid number of bunches.');
    }

    // Same line + same three caps as submitManual -- a bypassed bunch still
    // counts toward the order line, the box's packrate, and (for a mixed
    // box) this variety's own per-box target, exactly like a normal pack.
    const item =
      state.pickListItems.find(
        (i) => key(i.itemCode, i.uom, i.stemLength) === state.selectedItemKey,
      ) ?? state.pickListItems[0];
    if (!item) return fail('warning', 'No order line to pack.');

    const guide = state.packingGuide;
    const perBunch = stemsPerBunch(item.uom);
    const k = key(item.itemCode, item.uom, item.stemLength);
    const alreadyPacked = Math.trunc(state.packedBunchesTally[k] ?? 0);
    const orderRemaining = Math.max(0, Math.trunc(item.qty) - alreadyPacked);

    let boxRemaining = Infinity;
    if (guide && guide.packratePerBox > 0) {
      const boxStems = Object.values(state.varietyStemsInBox).reduce(
        (sum, byBox) => sum + (byBox[state.currentBoxId] ?? 0),
        0,
      );
      boxRemaining = Math.max(0, Math.floor((guide.packratePerBox - boxStems) / perBunch));
    }

    let varietyRemaining = Infinity;
    if (guide && guide.isMixed) {
      const target = targetPerVariety(guide, item.itemCode);
      const inBox = state.varietyStemsInBox[item.itemCode]?.[state.currentBoxId] ?? 0;
      varietyRemaining = Math.max(0, Math.floor((target - inBox) / perBunch));
    }

    const maxBunches = Math.min(orderRemaining, boxRemaining, varietyRemaining);
    if (bunches > maxBunches) {
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
      bunch_qty: bunches,
      source_warehouse: item.warehouse ? item.warehouse : DEFAULT_SOURCE_WAREHOUSE,
      sales_order_id: state.saleOrderId,
      customer_id: state.customerId,
      custom_number_of_stems: bunches * perBunch,
      custom_stem_length: item.stemLength,
      box_id: state.currentBoxId.toString(),
      bunch_id: null,
    };

    set({ bypassSubmitting: true });
    try {
      await karenPackingApi.createOrUpdateFarmPackList({
        custom_farm: item.warehouse ? item.warehouse : '',
        custom_customer: state.customerId,
        custom_sales_order: state.saleOrderId,
        custom_order_pick_list: state.selectedOpl,
        items: [payload],
      });
    } catch (err) {
      set({ bypassSubmitting: false });
      return fail('error', mapAxiosError(err).message || 'Packing failed.');
    }

    // The box tally is already updated at this point -- a failure logging
    // the reason is reported but doesn't undo it or block moving on.
    let logMessage = `Bypass logged: ${bunches} bunch(es) — ${reason}.`;
    try {
      await karenPackingApi.createPackingBypass({
        order_pick_list: state.selectedOpl,
        box_id: state.currentBoxId.toString(),
        reason,
        bunches,
      });
    } catch (err) {
      logMessage = `Packed, but the bypass log failed: ${mapAxiosError(err).message}`;
    }

    set({ bypassSubmitting: false, lastOutcome: { kind: 'success', message: logMessage } });
    await reloadGuide(state.selectedOpl, set, state.selectedItemKey);
    return { kind: 'success', message: logMessage };
  },

  reset: () =>
    set({
      picklistsLoading: false,
      availablePicklists: [],
      selectedDate: tomorrowISO(),
      selectedItemGroup: null,
      guideLoading: false,
      showTable: false,
      selectedOpl: null,
      saleOrderId: '',
      customerId: '',
      pickListItems: [],
      packingGuide: null,
      selectedItemKey: null,
      packedBunchesTally: {},
      varietyStemsInBox: {},
      scannedBunchIds: [],
      currentBoxId: 1,
      lastScannedKey: null,
      closedBoxes: {},
      submitting: false,
      lastOutcome: null,
      reasonSubmitting: false,
      bypassSubmitting: false,
    }),
}));

// Fetch + recompute the guide. Does NOT touch currentBoxId / scannedBunchIds,
// so it is safe to call after each pack to refresh tallies in place.
async function reloadGuide(
  oplName: string,
  set: (partial: Partial<State>) => void,
  currentSelectedItemKey: string | null = null,
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

    // Keep the operator on their current line as long as it still has room;
    // advance to the next incomplete line the moment it doesn't (e.g. right
    // after packing the last bunch of Aqua, this moves on to Athena instead
    // of leaving manual entry stuck on a now-finished line with nowhere to
    // go). A fresh load (no prior selection) just picks the first incomplete
    // line outright.
    const current = view.pickListItems.find(
      (i) => key(i.itemCode, i.uom, i.stemLength) === currentSelectedItemKey,
    );
    const currentStillOpen =
      !!current &&
      Math.trunc(view.packedBunchesTally[currentSelectedItemKey as string] ?? 0) <
        Math.trunc(current.qty);
    const selectedItemKey = currentStillOpen
      ? currentSelectedItemKey
      : firstIncompleteItemKey(view.pickListItems, view.packedBunchesTally);

    set({
      guideLoading: false,
      showTable: true,
      pickListItems: view.pickListItems,
      packingGuide: view.packingGuide,
      selectedItemKey,
      packedBunchesTally: view.packedBunchesTally,
      varietyStemsInBox: view.varietyStemsInBox,
      saleOrderId: view.saleOrderId,
      customerId: view.customerId,
    });
  } catch (err) {
    set({ guideLoading: false, lastOutcome: { kind: 'error', message: mapAxiosError(err).message || 'Could not load pick list.' } });
  }
}
