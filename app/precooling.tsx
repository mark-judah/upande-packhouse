import { serverScreen } from '@/src/composition/server-screen';
import { RequireStation } from '@/src/core/tenant/RequireStation';
import { KarenPrecoolingScreen } from '@/src/tenants/karen/features/precooling/PrecoolingScreen';

// counted per station: a device stages only once its station is set
function StationPrecooling() {
  return <RequireStation next="/precooling">{() => <KarenPrecoolingScreen />}</RequireStation>;
}

export default serverScreen('Staging', StationPrecooling);
