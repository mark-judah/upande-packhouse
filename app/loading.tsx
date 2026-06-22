import { useTenant } from '@/src/core/tenant/tenant-context';
import { PendingScreen } from '@/src/core/ui/PendingScreen';
import { KarenLoadingScreen } from '@/src/tenants/karen/features/loading/LoadingScreen';

export default function LoadingRoute() {
  const { tenant } = useTenant();
  if (tenant !== 'Karen' && tenant !== 'Demo') {
    return <PendingScreen feature="Loading" tenant={tenant} />;
  }
  return <KarenLoadingScreen />;
}
