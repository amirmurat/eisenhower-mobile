require('react-native-gesture-handler/jestSetup');

jest.mock('expo-font', () => ({
  useFonts: () => [true],
}));

jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');

  Reanimated.default.call = () => {};
  return Reanimated;
});

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('react-native-keyboard-controller', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    KeyboardProvider: ({ children }) => <>{children}</>,
    KeyboardStickyView: ({ children, ...props }) => <View {...props}>{children}</View>,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    SafeAreaProvider: ({ children }) => <>{children}</>,
    SafeAreaView: ({ children, ...props }) => <View {...props}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});
