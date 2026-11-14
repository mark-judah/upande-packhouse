import { useEffect, useState } from 'react';
import { stationApi } from '@/src/core/features/station/api';
import { useUserStation } from '@/src/core/tenant/user-station';

let cached: { senders: string[] } | null = null;

/** True when this station is a sales farm that sends its boxes to the main sales farm: it stages them for
 *  the internal transfer and does not precool (the main sales farm does). */
export function useSendsBoxesToMain(): boolean {
  const { station } = useUserStation();
  const farm = station?.userFarm ?? '';
  const [info, setInfo] = useState(cached);

  useEffect(() => {
    if (!farm || cached) return;
    let live = true;
    stationApi
      .fetchSalesFarms()
      .then((res) => {
        const m = res?.message;
        if (!m?.success) return;
        cached = { senders: m.senders ?? [] };
        if (live) setInfo(cached);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [farm]);

  return !!(farm && info?.senders.includes(farm));
}
