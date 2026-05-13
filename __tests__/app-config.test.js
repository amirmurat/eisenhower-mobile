const appConfig = require('../app.json');

describe('app keyboard config', () => {
  test('uses Android resize mode so the native window does not pan the whole UI', () => {
    expect(appConfig.expo.android.softwareKeyboardLayoutMode).toBe('resize');
  });
});
