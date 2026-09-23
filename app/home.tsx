import { useTenant } from '@/src/core/tenant/tenant-context';
import { PendingScreen } from '@/src/core/ui/PendingScreen';
import { KarenHomeScreen } from '@/src/tenants/karen/features/dashboard/HomeScreen';

export default function HomeRoute() {
  const { tenant } = useTenant();
  if (tenant !== 'Karen' && tenant !== 'Demo') {
    return <PendingScreen feature="Home" tenant={tenant} />;
  }
  return <KarenHomeScreen />;
}
