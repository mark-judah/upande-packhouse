module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // @react-native-async-storage/async-storage's native module has no JS-side
    // implementation under plain jest-expo; without this, anything that
    // transitively imports src/core/storage (e.g. the API client) fails to
    // load in tests. The package's own jest/async-storage-mock.js exports a
    // plain mock object (not a self-registering jest.mock() call), so it has
    // to be wired in via moduleNameMapper rather than setupFiles.
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/node_modules/@react-native-async-storage/async-storage/jest/async-storage-mock.js',
  },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)"
  ]
};
