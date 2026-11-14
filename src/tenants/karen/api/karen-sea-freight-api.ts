import { api } from '@/src/core/api/client';

/**
 * Open sea freight orders (Sales Order Mode Of Transport = Sea Freight), backed by
 * upande_packhouse.api.sea_freight.orders: per line what was ordered, harvested for the
 * order (tagged by the production app), received here, and the order's pick list.
 */
export type SeaFreightLine = {
  name: string;
  itemCode: string;
  itemName: string;
  stemLength: string;
  orderedStems: number;
  harvestedStems: number;
  receivedStems: number;
};

/** A bucket harvested for the order: what the receive scan expects. */
export type SeaFreightBucket = {
  bucket: string;
  itemCode: string;
  salesOrderItem: string;
  stems: number;
  greenhouse: string;
};

export type SeaFreightOrder = {
  name: string;
  /** The Sales Order's order name (custom_order_name), when set. */
  orderName: string;
  /** Harvesting marked 100% done in the production app: ready to receive. */
  harvestDone: boolean;
  /** Received here: its pick lists exist and it packs like any order. */
  received: boolean;
  pickLists: string[];
  buckets: SeaFreightBucket[];
  customer: string;
  deliveryDate: string;
  status: string;
  orderedStems: number;
  harvestedStems: number;
  receivedStems: number;
  packedStems: number;
  pickList: string | null;
  items: SeaFreightLine[];
};

type RawLine = {
  name?: string;
  item_code?: string;
  item_name?: string;
  stem_length?: string;
  ordered_stems?: number;
  harvested_stems?: number;
  received_stems?: number;
};

type RawOrder = {
  name?: string;
  order_name?: string;
  harvest_done?: boolean;
  received?: boolean;
  pick_lists?: string[];
  buckets?: Array<{ bucket?: string; item_code?: string; sales_order_item?: string; stems?: number; greenhouse?: string }>;
  customer?: string;
  delivery_date?: string;
  status?: string;
  ordered_stems?: number;
  harvested_stems?: number;
  received_stems?: number;
  packed_stems?: number;
  pick_list?: string | null;
  items?: RawLine[];
};

const n = (v: unknown) => Number(v ?? 0) || 0;

export const karenSeaFreightApi = {
  async orders(): Promise<SeaFreightOrder[]> {
    const res = await api<{ message?: { orders?: RawOrder[] } }>({
      method: 'GET',
      url: '/api/method/upande_packhouse.api.sea_freight.orders',
    });
    return (res.message?.orders ?? []).map((o) => ({
      name: String(o.name ?? ''),
      orderName: String(o.order_name ?? ''),
      harvestDone: !!o.harvest_done,
      received: !!o.received,
      pickLists: (o.pick_lists ?? []).map(String),
      buckets: (o.buckets ?? []).map((b) => ({
        bucket: String(b.bucket ?? ''),
        itemCode: String(b.item_code ?? ''),
        salesOrderItem: String(b.sales_order_item ?? ''),
        stems: n(b.stems),
        greenhouse: String(b.greenhouse ?? ''),
      })),
      customer: String(o.customer ?? ''),
      deliveryDate: String(o.delivery_date ?? ''),
      status: String(o.status ?? ''),
      orderedStems: n(o.ordered_stems),
      harvestedStems: n(o.harvested_stems),
      receivedStems: n(o.received_stems),
      packedStems: n(o.packed_stems),
      pickList: o.pick_list ? String(o.pick_list) : null,
      items: (o.items ?? []).map((l) => ({
        name: String(l.name ?? ''),
        itemCode: String(l.item_code ?? ''),
        itemName: String(l.item_name ?? l.item_code ?? ''),
        stemLength: String(l.stem_length ?? ''),
        orderedStems: n(l.ordered_stems),
        harvestedStems: n(l.harvested_stems),
        receivedStems: n(l.received_stems),
      })),
    }));
  },

  /** Take the order in from its scanned buckets: builds its pick lists, issued and ready to pack. */
  async receive(salesOrder: string, buckets: string[]): Promise<{ pickLists: string[] }> {
    const res = await api<{ message?: { pick_lists?: string[] } }>({
      method: 'POST',
      url: '/api/method/upande_packhouse.api.sea_freight.receive',
      data: { sales_order: salesOrder, buckets },
    });
    return { pickLists: (res.message?.pick_lists ?? []).map(String) };
  },

  /** Pick lists of open sea freight orders, for the Packing screen's banner. */
  async pickLists(): Promise<string[]> {
    const res = await api<{ message?: string[] }>({
      method: 'GET',
      url: '/api/method/upande_packhouse.api.sea_freight.pick_lists',
    });
    return (res.message ?? []).map(String);
  },
};
