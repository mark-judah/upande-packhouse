import { useTenant } from '@/src/core/tenant/tenant-context';
import { PendingScreen } from '@/src/core/ui/PendingScreen';
import { KarenPrecoolingScreen } from '@/src/tenants/karen/features/precooling/PrecoolingScreen';

export default function PrecoolingRoute() {
  const { tenant } = useTenant();
  if (tenant !== 'Karen' && tenant !== 'Demo') {
    return <PendingScreen feature="Precooling" tenant={tenant} />;
  }
  return <KarenPrecoolingScreen />;
}
