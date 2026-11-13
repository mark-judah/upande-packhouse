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

export type SeaFreightOrder = {
  name: string;
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
};
