/**
 * Tests for useConnectionStore — online/offline status
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

import { useConnectionStore, setOnlineStatus } from '../store/useConnectionStore';

describe('useConnectionStore', () => {
  beforeEach(() => {
    useConnectionStore.setState({ isOnline: true });
  });

  test('starts online', () => {
    expect(useConnectionStore.getState().isOnline).toBe(true);
  });

  test('setOnlineStatus(false) goes offline', () => {
    setOnlineStatus(false);
    expect(useConnectionStore.getState().isOnline).toBe(false);
  });

  test('setOnlineStatus(true) goes online after being offline', () => {
    setOnlineStatus(false);
    expect(useConnectionStore.getState().isOnline).toBe(false);
    setOnlineStatus(true);
    expect(useConnectionStore.getState().isOnline).toBe(true);
  });

  test('setOnline method on store works directly', () => {
    useConnectionStore.getState().setOnline(false);
    expect(useConnectionStore.getState().isOnline).toBe(false);
    useConnectionStore.getState().setOnline(true);
    expect(useConnectionStore.getState().isOnline).toBe(true);
  });
});
