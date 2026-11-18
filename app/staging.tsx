import { serverScreen } from '@/src/composition/server-screen';
import { RequireStation } from '@/src/core/tenant/RequireStation';
import { KarenStagingScreen } from '@/src/tenants/karen/features/staging/StagingScreen';

// counted per station: a device stages only once its station is set
function StationStaging() {
  return <RequireStation next="/staging">{() => <KarenStagingScreen />}</RequireStation>;
}

export default serverScreen('Precooling', StationStaging);
