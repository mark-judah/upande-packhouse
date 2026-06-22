import { useTenant } from '@/src/core/tenant/tenant-context';
import { PendingScreen } from '@/src/core/ui/PendingScreen';
import { KarenBunchHandoverScreen } from '@/src/tenants/karen/features/bunch-handover/BunchHandoverScreen';

export default function BunchHandoverRoute() {
  const { tenant } = useTenant();
  if (tenant !== 'Karen' && tenant !== 'Demo') {
    return <PendingScreen feature="Bunch Handover" tenant={tenant} />;
  }
  return <KarenBunchHandoverScreen />;
}
