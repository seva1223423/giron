import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  // Prevent actual DB/server connections in tests
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
  // expo-server-sdk ships as ES modules which ts-jest can't process.
  // In tests we never actually send push notifications, so mock the whole package.
  moduleNameMapper: {
    '^expo-server-sdk$': '<rootDir>/src/__tests__/__mocks__/expo-server-sdk.ts',
    '^otpauth$': '<rootDir>/src/__tests__/__mocks__/otpauth.ts',
  },
  // Force Jest to exit cleanly after all tests complete even when the express
  // server's TCP socket leaves an open libuv handle. Without this flag the
  // supertest-managed server (PORT=0, bound by index.ts on import) keeps the
  // worker alive and triggers the "worker force-exited" warning.
  forceExit: true,
};

export default config;
