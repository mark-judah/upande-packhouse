import Constants from 'expo-constants';

const PRIVATE_IP = /^(10\.\d+|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+$/;

/** In development, a server saved as a LAN IP follows the dev machine: when the
 *  laptop's IP changes (DHCP), the saved one goes dead with "Network Error" while
 *  Metro, on the new IP, still works. Swap in Metro's host, keep scheme and port.
 *  Release builds and named servers are untouched. */
export function followDevHost(baseUrl: string): string {
  if (!__DEV__) return baseUrl;
  const metroHost = (Constants.expoConfig?.hostUri ?? '').split(':')[0];
  if (!PRIVATE_IP.test(metroHost)) return baseUrl;
  const m = /^(https?:\/\/)([^/:]+)(.*)$/i.exec(baseUrl);
  if (!m || !PRIVATE_IP.test(m[2]) || m[2] === metroHost) return baseUrl;
  return `${m[1]}${metroHost}${m[3]}`;
}
