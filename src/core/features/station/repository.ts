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
   * The chosen farm's greenhouses, from the names alone (whatever the instance):
   *   • named after the farm → the warehouses starting with the farm name
   *   • farm "Main"          → warehouses NOT containing "EX"
   *   • farm "EX-LEWA"       → warehouses containing "EX"
   *   • otherwise            → the full list
   */
  filterGreenhousesForFarm(farm: string, greenhouses: string[]): string[] {
    if (!farm) return [];
    const named = greenhouses.filter((g) => g.startsWith(farm));
    if (named.length) return named;
    if (farm === 'Main') return greenhouses.filter((g) => !g.includes('EX'));
    if (farm === 'EX-LEWA') return greenhouses.filter((g) => g.includes('EX'));
    return greenhouses;
  },
};
