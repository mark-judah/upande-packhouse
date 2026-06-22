export type DrawerItem = {
  label: string;
  /** matches a route file under app/ */
  route:
    | 'scheduler'
    | 'issuing'
    | 'packing'
    | 'bunch-handover'
    | 'staging'
    | 'loading'
    | 'dispatch';
  icon: string; // Ionicons name
  /** Show in the drawer but render a "Coming soon" state and ignore taps. */
  comingSoon?: boolean;
};
