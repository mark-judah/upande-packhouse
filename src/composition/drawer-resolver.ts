import type { DrawerItem } from '@/src/core/tenant/types';
import { karenDrawer } from '@/src/tenants/karen/navigation';

/** Every instance gets the same screens, whatever its URL. */
export function getDrawer(): DrawerItem[] {
  return karenDrawer;
}
