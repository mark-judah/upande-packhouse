import { api } from '@/src/core/api/client';
import { stationParams } from '@/src/core/tenant/user-station';

/** A box on the Internal Box Transfer screen (a sales farm's packed box going to the main sales farm). */
export type RawTransferBox = {
  box_label?: string;
  box_number?: number;
  customer?: string;
  order_name?: string;
  opl?: string;
  variety?: string;
  length?: string;
  farm?: string;
  delivery_date?: string;
  status?: string;
  /** 1 once staged (a received box is staged again at the main sales farm). */
  staged?: number;
  vehicle?: string;
  to?: string;
  /** When it was scanned onto the transfer truck. */
  loaded_at?: string;
  sent_at?: string;
  /** When it arrived (was received) at the main sales farm. */
  received_at?: string;
};

export type RawTransferData = {
  /** send: a sales farm sending to the main one; receive: the main sales farm; none: neither. */
  role?: 'send' | 'receive' | 'none';
  main?: string;
  station?: string;
  trucks?: { name: string; label?: string }[];
  to_load?: RawTransferBox[];
  not_staged?: RawTransferBox[];
  loaded?: RawTransferBox[];
  in_transit?: RawTransferBox[];
  received?: RawTransferBox[];
  /** One per truck run: loaded on a truck and sent together, every box with where it stands. */
  trips?: RawTransferTrip[];
};

export type RawTransferTrip = {
  vehicle?: string;
  sent_at?: string;
  from?: string;
  to?: string;
  status?: string;
  total?: number;
  received?: number;
  received_at?: string;
  boxes?: RawTransferBox[];
};

export type RawTransferReply = { message?: { status?: string; message?: string; sent?: number } };

export const karenBoxTransferApi = {
  async fetch(deliveryDate: string): Promise<{ message?: RawTransferData }> {
    return api({
      method: 'GET',
      url: '/api/method/upande_packhouse.mobile.api.getBoxTransferData',
      params: { delivery_date: deliveryDate, ...(await stationParams()) },
    });
  },
  async load(boxLabel: string, vehicle: string): Promise<RawTransferReply> {
    return api({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.loadBoxForTransfer',
      data: { box_label: boxLabel, vehicle, ...(await stationParams()) },
    });
  },
  async send(vehicle: string): Promise<RawTransferReply> {
    return api({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.sendBoxTransfer',
      data: { vehicle, ...(await stationParams()) },
    });
  },
  /** Every box of a trip received at once, on the count taken off the truck. */
  async receiveTrip(vehicle: string, sentAt: string, count: number): Promise<RawTransferReply> {
    return api({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.receiveTransferTrip',
      data: { vehicle, sent_at: sentAt, count, ...(await stationParams()) },
    });
  },
  async receive(boxLabel: string): Promise<RawTransferReply> {
    return api({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.receiveTransferBox',
      data: { box_label: boxLabel, ...(await stationParams()) },
    });
  },
};
