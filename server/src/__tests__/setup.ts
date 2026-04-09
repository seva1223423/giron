// Set environment variables before any imports
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-testing';
process.env.REVENUECAT_WEBHOOK_SECRET = 'rc-test-secret';
process.env.YUKASSA_WEBHOOK_SECRET = 'yukassa-test-secret';
process.env.WEBHOOK_SECRET = 'generic-test-secret';
process.env.PORT = '0'; // random port for tests
