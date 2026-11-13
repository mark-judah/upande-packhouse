export type DrawerItem = {
  label: string;
  /** matches a route file under app/ */
  route:
    | 'home'
    | 'scheduler'
    | 'issuing'
    | 'packing'
    | 'box-labels'
    | 'bunch-handover'
    | 'precooling'
    | 'staging'
    | 'loading'
    | 'box-transfer'
    | 'bucket-logistics'
    | 'sea-freight'
    | 'dispatch';
  icon: string; // Ionicons name
  /** Show in the drawer but render a "Coming soon" state and ignore taps. */
  comingSoon?: boolean;
};
