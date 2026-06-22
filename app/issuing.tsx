import { useTenant } from '@/src/core/tenant/tenant-context';
import { PendingScreen } from '@/src/core/ui/PendingScreen';
import { KarenIssuingScreen } from '@/src/tenants/karen/features/issuing/IssuingScreen';

export default function IssuingRoute() {
  const { tenant } = useTenant();
  if (tenant !== 'Karen' && tenant !== 'Demo') {
    return <PendingScreen feature="Issuing" tenant={tenant} />;
  }
  return <KarenIssuingScreen />;
}
