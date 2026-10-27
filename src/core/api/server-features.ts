import { create } from 'zustand';

/** Methods every screen shares (version, device register): a site without them says nothing about a screen. */
const APP_WIDE = [/^frappe\./, /^upande_quality\.mobile\.mobile_app\./];

/** What Frappe answers for a method the site does not have. */
const NO_SUCH_METHOD = /Failed to get method for command/i;

type ServerFeaturesState = {
  /** The screen on show: the requests it makes are its own. */
  focused: string | null;
  /** Screens the signed-in site lacks a method for, with that method. */
  missing: Record<string, string>;
  focus: (feature: string) => void;
  reset: () => void;
};

export const useServerFeatures = create<ServerFeaturesState>((set, get) => ({
  focused: null,
  missing: {},
  focus: (feature) => {
    if (get().focused !== feature) set({ focused: feature });
  },
  reset: () => set({ focused: null, missing: {} }),
}));

/** The screen a request is made for, stamped on its config when it goes out. */
export function stampFeature<T extends object>(config: T): T {
  return Object.assign(config, { appFeature: useServerFeatures.getState().focused });
}

/** A request the site has no method for: its screen shows Coming soon instead. */
export function noteMissingMethod(config: { url?: string } | undefined, body: unknown): void {
  const feature = (config as { appFeature?: string | null } | undefined)?.appFeature;
  if (!feature || !body || !NO_SUCH_METHOD.test(JSON.stringify(body))) return;
  const method = config?.url?.match(/\/api\/method\/([^?/]+)/)?.[1];
  if (!method || APP_WIDE.some((re) => re.test(method))) return;
  const { missing } = useServerFeatures.getState();
  if (!missing[feature]) useServerFeatures.setState({ missing: { ...missing, [feature]: method } });
}
