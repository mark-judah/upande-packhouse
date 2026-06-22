import type { Tenant } from '@/src/core/tenant/instance-mapper';
import { stationApi } from './api';

export type Farm = { name: string; farmName: string };

export const stationRepository = {
  async fetchFarms(): Promise<Farm[]> {
    const raw = await stationApi.fetchFarms();
    return (raw.data ?? []).map((f) => ({
      name: f.name,
      farmName: f.farm_name ?? f.name,
    }));
  },

  /**
   * Returns the names of all greenhouse-class warehouses (those starting with
   * "GHSE" or containing "GH"). Per-tenant filtering by farm is applied on top
   * by `filterGreenhousesForFarm` once a farm is picked.
   */
  async fetchGreenhouseWarehouses(): Promise<string[]> {
    const raw = await stationApi.fetchWarehouses();
    const all = raw.data ?? [];
    return all
      .map((w) => w.name)
      .filter((name) => name.startsWith('GHSE') || name.includes('GH'));
  },

  /**
   * Per-tenant secondary filter applied after a farm is chosen. Mirrors the
   * Flutter `getFilteredStations()` logic verbatim.
   *   • Karen / Demo / Mona → warehouse name starts with the farm name
   *   • Kikwetu Main       → warehouses NOT containing "EX"
   *   • Kikwetu EX-LEWA    → warehouses containing "EX"
   *   • Anything else      → no filter (fall back to full list)
   */
  filterGreenhousesForFarm(
    tenant: Tenant | null,
    farm: string,
    greenhouses: string[],
  ): string[] {
    if (!farm || !tenant) return [];
    if (tenant === 'Karen' || tenant === 'Demo' || tenant === 'Mona') {
      return greenhouses.filter((g) => g.startsWith(farm));
    }
    if (tenant === 'Kikwetu') {
      if (farm === 'Main') return greenhouses.filter((g) => !g.includes('EX'));
      if (farm === 'EX-LEWA') return greenhouses.filter((g) => g.includes('EX'));
      return greenhouses;
    }
    return greenhouses;
  },
};
