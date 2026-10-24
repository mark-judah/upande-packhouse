// app.json stays the source of truth (version scripts, OTA publishing and CI read it).
// APP_VARIANT=development turns it into the dev build: its own package, name and scheme,
// so it installs next to Expo Go and the production app instead of replacing either.
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'development') return config;
  return {
    ...config,
    name: `${config.name} (Dev)`,
    scheme: `${config.scheme}dev`,
    android: { ...config.android, package: `${config.android.package}.dev` },
    ios: { ...config.ios, bundleIdentifier: config.ios?.bundleIdentifier && `${config.ios.bundleIdentifier}.dev` },
    // The dev build loads from Metro, never from the production OTA feed.
    updates: { ...config.updates, enabled: false },
  };
};
