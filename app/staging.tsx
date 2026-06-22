import { useTenant } from '@/src/core/tenant/tenant-context';
import { PendingScreen } from '@/src/core/ui/PendingScreen';
import { KarenStagingScreen } from '@/src/tenants/karen/features/staging/StagingScreen';

export default function StagingRoute() {
  const { tenant } = useTenant();
  if (tenant !== 'Karen' && tenant !== 'Demo') {
    return <PendingScreen feature="Staging" tenant={tenant} />;
  }
  return <KarenStagingScreen />;
}
