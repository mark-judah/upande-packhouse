import type { DrawerItem } from '@/src/core/tenant/types';
import type { Tenant } from '@/src/core/tenant/instance-mapper';
import { karenDrawer } from '@/src/tenants/karen/navigation';
import { kikwetuDrawer } from '@/src/tenants/kikwetu/navigation';
import { xfloraDrawer } from '@/src/tenants/xflora/navigation';
import { monaDrawer } from '@/src/tenants/mona/navigation';
import { tambuziDrawer } from '@/src/tenants/tambuzi/navigation';

const DRAWERS: Record<Tenant, DrawerItem[]> = {
  Karen:   karenDrawer,
  Demo:    karenDrawer,
  Kikwetu: kikwetuDrawer,
  Xflora:  xfloraDrawer,
  Mona:    monaDrawer,
  Tambuzi: tambuziDrawer,
};

export function getDrawerFor(tenant: Tenant | null): DrawerItem[] {
  if (!tenant) return [];
  return DRAWERS[tenant];
}
