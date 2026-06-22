import { useTenant } from '@/src/core/tenant/tenant-context';
import { PendingScreen } from '@/src/core/ui/PendingScreen';
import { KarenSchedulerScreen } from '@/src/tenants/karen/features/scheduler/SchedulerScreen';

export default function SchedulerRoute() {
  const { tenant } = useTenant();
  if (tenant !== 'Karen' && tenant !== 'Demo') {
    return <PendingScreen feature="Scheduler" tenant={tenant} />;
  }
  return <KarenSchedulerScreen />;
}
