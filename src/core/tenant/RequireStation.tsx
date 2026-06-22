import { Redirect } from 'expo-router';
import { Screen } from '@/src/core/ui/Screen';
import { useUserStation, type UserStation } from './user-station';

type Props = {
  /** The route the user is on, so configure-station can return them here on save. */
  next: string;
  /**
   * Render the gated content with the resolved station. Children only render
   * after the user has saved a station; otherwise the user is redirected to
   * `/configure-station?next=<next>`.
   */
  children: (station: UserStation) => React.ReactNode;
};

/**
 * Gate any screen on the device-wide farm + greenhouse configuration.
 *
 *   <RequireStation next="/qc">
 *     {(station) => <KarenQcScreen userFarm={station.userFarm} … />}
 *   </RequireStation>
 *
 * The configured station is the single source of truth for *every* page that
 * needs farm/greenhouse — set once via `/configure-station`, used everywhere.
 */
export function RequireStation({ next, children }: Props) {
  const { station, loaded } = useUserStation();

  if (!loaded) {
    return <Screen title="Loading…">{null}</Screen>;
  }

  if (!station) {
    return <Redirect href={{ pathname: '/configure-station', params: { next } }} />;
  }

  return <>{children(station)}</>;
}
