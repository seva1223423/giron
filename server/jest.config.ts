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
};

export default config;
