import { useTenant } from '@/src/core/tenant/tenant-context';
import { PendingScreen } from '@/src/core/ui/PendingScreen';
import { KarenBucketLogisticsScreen } from '@/src/tenants/karen/features/bucket-logistics/BucketLogisticsScreen';

export default function BucketLogisticsRoute() {
  const { tenant } = useTenant();
  if (tenant !== 'Karen' && tenant !== 'Demo') {
    return <PendingScreen feature="Bucket Logistics" tenant={tenant} />;
  }
  return <KarenBucketLogisticsScreen />;
}
