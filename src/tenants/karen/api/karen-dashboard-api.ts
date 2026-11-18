import { api } from '@/src/core/api/client';
import { stationParams } from '@/src/core/tenant/user-station';

/**
 * Packhouse home dashboard — boxes required vs boxes packed for one delivery
 * date (defaults to tomorrow, same as Packing Entry's own default). Backed
 * by upande_packhouse.mobile.api.getPackhouseDashboardData.
 */

export type RawDashboardOrder = {
  sales_order?: string;
  order_name?: string;
  customer?: string;
  delivery_point?: string;
  farm?: string;
  team?: string;
  boxes_required?: number;
  boxes_packed?: number;
};

export type RawDashboardVariety = { item_code?: string; stems?: number };

export type RawDashboardTeam = {
  team?: string;
  boxes_required?: number;
  boxes_packed?: number;
  stems_expected?: number;
  stems_packed?: number;
  orders_total?: number;
  orders_done?: number;
};

export type RawDashboardPacker = {
  user?: string;
  name?: string;
  stems?: number;
  bunches?: number;
};

export type RawDashboardData = {
  delivery_date?: string;
  /** The farm shown: a sales farm, or "" for every farm. */
  farm?: string;
  /** The home screen's farm picker: every sales farm (plus All farms when all_farms). */
  sales_farms?: string[];
  all_farms?: boolean;
  kpi?: {
    boxes_required?: number;
    boxes_packed?: number;
    stems_expected?: number;
    stems_packed?: number;
    orders_total?: number;
    orders_done?: number;
    bypass_issues?: number;
    underpack_issues?: number;
    underpack_percentage?: number;
    farms?: number;
  };
  orders?: RawDashboardOrder[];
  top_varieties?: RawDashboardVariety[];
  teams?: RawDashboardTeam[];
  top_packers?: RawDashboardPacker[];
  bottom_packers?: RawDashboardPacker[];
  error?: string;
};

export type RawDashboardResponse = {
  message?: RawDashboardData;
};

export const karenDashboardApi = {
  /** `farm`: a sales farm, "" for every farm, null/undefined for the station's own. */
  async fetch(date?: string, farm?: string | null): Promise<RawDashboardResponse> {
    return api<RawDashboardResponse>({
      method: 'GET',
      url: '/api/method/upande_packhouse.mobile.api.getPackhouseDashboardData',
      params: {
        ...(date ? { date } : {}),
        ...(await stationParams()),
        ...(farm !== null && farm !== undefined ? { farm } : {}),
      },
    });
  },
};
