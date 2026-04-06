const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'production' ? 'warn' : 'debug');

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] <= LOG_LEVELS[currentLevel];
}

function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  error: (...args: unknown[]) => {
    if (shouldLog('error')) console.error(`[${timestamp()}] [ERROR]`, ...args);
  },
  warn: (...args: unknown[]) => {
    if (shouldLog('warn')) console.warn(`[${timestamp()}] [WARN]`, ...args);
  },
  info: (...args: unknown[]) => {
    if (shouldLog('info')) console.log(`[${timestamp()}] [INFO]`, ...args);
  },
  debug: (...args: unknown[]) => {
    if (shouldLog('debug')) console.log(`[${timestamp()}] [DEBUG]`, ...args);
  },
};
