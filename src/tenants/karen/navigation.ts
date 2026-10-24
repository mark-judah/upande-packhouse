import type { DrawerItem } from '@/src/core/tenant/types';

export const karenDrawer: DrawerItem[] = [
  { label: 'Home', route: 'home', icon: 'home-outline' },
  { label: 'Scheduler', route: 'scheduler', icon: 'list-outline' },
  { label: 'Bucket Logistics', route: 'bucket-logistics', icon: 'navigate-outline' },
  { label: 'Issuing',  route: 'issuing',  icon: 'send-outline' },
  { label: 'Packing',  route: 'packing',  icon: 'cube-outline' },
  { label: 'Bunch Handover', route: 'bunch-handover', icon: 'swap-horizontal-outline' },
  // Names swapped on purpose: the "staging" screen is what the packhouse calls Precooling,
  // and the "precooling" screen is Staging.
  { label: 'Staging', route: 'precooling', icon: 'layers-outline' },
  { label: 'Precooling', route: 'staging', icon: 'snow-outline' },
  { label: 'Loading',  route: 'loading',  icon: 'car-outline' },
  { label: 'Dispatch', route: 'dispatch', icon: 'paper-plane-outline' },
];
