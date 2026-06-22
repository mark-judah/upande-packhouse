import { useTenant } from '@/src/core/tenant/tenant-context';
import { PendingScreen } from '@/src/core/ui/PendingScreen';
import { KarenDispatchScreen } from '@/src/tenants/karen/features/dispatch/DispatchScreen';

export default function DispatchRoute() {
  const { tenant } = useTenant();
  if (tenant !== 'Karen' && tenant !== 'Demo') {
    return <PendingScreen feature="Dispatch" tenant={tenant} />;
  }
  return <KarenDispatchScreen />;
}
