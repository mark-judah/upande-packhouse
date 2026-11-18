import { api } from "@/src/core/api/client";
import { stationParams } from "@/src/core/tenant/user-station";
import type { RawStagingResponse } from "./karen-staging-api";

export type PrecoolingAction = "in" | "out";

export type PrecoolingCounts = {
  packed: number;
  awaiting: number;
  in_precooling: number;
  precooled: number;
  staged: number;
};

export type PrecoolingOrder = PrecoolingCounts & {
  sales_order: string;
  customer: string;
  /** Sales Order `custom_delivery_point`; null/absent on older servers. */
  delivery_point?: string | null;
};

export type PrecoolingSummary = {
  delivery_date: string;
  totals: PrecoolingCounts;
  orders: PrecoolingOrder[];
};

export const karenPrecoolingApi = {
  /** Box counts per Sales Order for one delivery date: packed vs in precooling vs precooled, for the
   *  boxes at this device's sales farm (every box when no station is set). */
  async fetchPrecoolingSummary(
    deliveryDate: string,
  ): Promise<PrecoolingSummary> {
    const res = await api<{ message: PrecoolingSummary }>({
      method: "GET",
      url: "/api/method/upande_packhouse.mobile.api.fetchPrecoolingSummary",
      params: { delivery_date: deliveryDate, ...(await stationParams()) },
    });
    return res.message;
  },

  /** `in`: a packed box enters precooling. `out`: it leaves precooled, ready to stage. */
  createPrecoolingEntry(
    boxLabel: string,
    action: PrecoolingAction,
  ): Promise<RawStagingResponse> {
    return api<RawStagingResponse>({
      method: "POST",
      url: "/api/method/upande_packhouse.mobile.api.createPrecoolingEntry",
      data: { box_label: boxLabel, action },
    });
  },
};
