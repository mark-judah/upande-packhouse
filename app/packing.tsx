import { useTenant } from '@/src/core/tenant/tenant-context';
import { PendingScreen } from '@/src/core/ui/PendingScreen';
import { KarenPackingScreen } from '@/src/tenants/karen/features/packing/PackingScreen';

export default function PackingRoute() {
  const { tenant } = useTenant();
  if (tenant !== 'Karen' && tenant !== 'Demo') {
    return <PendingScreen feature="Packing" tenant={tenant} />;
  }
  return <KarenPackingScreen />;
}
