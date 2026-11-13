import { api } from '@/src/core/api/client';

export type RawFarm = { name: string; farm_name?: string };
export type RawWarehouse = { name: string; disabled?: 0 | 1 };

export type RawList<T> = { data?: T[] };

export const stationApi = {
  fetchFarms(): Promise<RawList<RawFarm>> {
    return api<RawList<RawFarm>>({
      method: 'GET',
      url: '/api/resource/Farm',
      params: { fields: '["*"]', limit: 1000 },
    });
  },
  /** The sales farms (Production Settings > Shelf Locations, Sales Shelf): the farms a packhouse can be. */
  fetchSalesFarms(): Promise<{ message?: { success?: boolean; farms?: string[]; main?: string; senders?: string[] } }> {
    return api({ method: 'GET', url: '/api/method/upande_packhouse.mobile.api.getSalesFarms' });
  },
  fetchWarehouses(): Promise<RawList<RawWarehouse>> {
    return api<RawList<RawWarehouse>>({
      method: 'GET',
      url: '/api/resource/Warehouse',
      params: {
        fields: '["*"]',
        filters: '[["disabled","=","0"]]',
        limit: 5000,
      },
    });
  },
};
