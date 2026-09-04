import type { DrawerItem } from '@/src/core/tenant/types';

export const karenDrawer: DrawerItem[] = [
  { label: 'Scheduler', route: 'scheduler', icon: 'list-outline' },
  { label: 'Issuing',  route: 'issuing',  icon: 'send-outline' },
  { label: 'Packing',  route: 'packing',  icon: 'cube-outline' },
  { label: 'Bunch Handover', route: 'bunch-handover', icon: 'swap-horizontal-outline' },
  { label: 'Staging',  route: 'staging',  icon: 'layers-outline' },
  { label: 'Loading',  route: 'loading',  icon: 'car-outline' },
  { label: 'Bucket Logistics', route: 'bucket-logistics', icon: 'navigate-outline' },
  { label: 'Dispatch', route: 'dispatch', icon: 'paper-plane-outline' },
];
