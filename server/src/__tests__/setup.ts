// Set environment variables before any imports.
// This file runs as a Jest setupFile (before test framework is loaded),
// so Jest globals (test, expect) are NOT available here — only plain JS.
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-32ch';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-testing-32ch';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/giron_test';
process.env.YUKASSA_WEBHOOK_SECRET = 'yukassa-test-secret';
process.env.WEBHOOK_SECRET = 'generic-test-secret';
process.env.PORT = '0'; // random port — OS assigns a free port
