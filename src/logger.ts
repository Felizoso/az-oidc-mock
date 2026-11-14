import DailyRotateFile from "winston-daily-rotate-file";
import winston from "winston";
import type { AppConfig, LoggingConfig, LoggingTransportConfig } from "./config.js";

export type Logger = {
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
  verbose: (config: AppConfig, message: string, context?: Record<string, unknown>) => void;
  configure?: (logging?: LoggingConfig) => void;
};

const defaultLoggingConfig: LoggingConfig = {
  transport: "console",
  level: "debug"
};

/**
 * Creates the process logger used by the mock server.
 */
export function createLogger(logging?: LoggingConfig): Logger {
  const instance = winston.createLogger({
    level: "debug",
    format: createLogFormat(),
    transports: []
  });

  configureWinstonLogger(instance, logging);

  return {
    info: (message, context) => writeLog(instance, "info", message, context),
    warn: (message, context) => writeLog(instance, "warn", message, context),
    error: (message, context) => writeLog(instance, "error", message, context),
    verbose: (config, message, context) => {
      if (config.verbose) {
        writeLog(instance, "debug", message, context);
      }
    },
    configure: (nextLogging) => configureWinstonLogger(instance, nextLogging)
  };
}

function configureWinstonLogger(logger: winston.Logger, logging?: LoggingConfig): void {
  const activeLevel = logging?.level ?? defaultLoggingConfig.level;
  const transportConfigs = resolveTransportConfigs(logging);
  const transports = transportConfigs.map((transportConfig) => {
    const transport = createTransport(transportConfig);
    transport.on("error", (error: Error) => {
      // Report transport failures directly to stderr so they do not recurse through the failed sink.
      process.stderr.write(`${JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        message: "logging transport failed",
        context: {
          transport: transportConfig.transport,
          error: error.message
        }
      })}\n`);
    });
    return transport;
  });

  logger.configure({
    level: activeLevel,
    format: createLogFormat(),
    transports
  });
}

function resolveTransportConfigs(logging?: LoggingConfig): LoggingTransportConfig[] {
  if (!logging) {
    return [{ transport: "console" }];
  }
  if ("transports" in logging) {
    return logging.transports;
  }

  switch (logging.transport) {
    case "console":
      return [{ transport: "console" }];
    case "file":
      return [{ transport: "file", file: logging.file }];
    case "http":
      return [{ transport: "http", http: logging.http }];
  }
}

function createTransport(logging: LoggingTransportConfig) {
  switch (logging.transport) {
    case "console":
      return new winston.transports.Console({ stderrLevels: ["error", "warn"] });
    case "file":
      return new DailyRotateFile({
        filename: logging.file.filename,
        datePattern: logging.file.datePattern,
        maxSize: logging.file.maxSize,
        maxFiles: logging.file.maxFiles,
        zippedArchive: logging.file.zippedArchive
      });
    case "http":
      return new winston.transports.Http({
        host: logging.http.host,
        port: logging.http.port,
        path: logging.http.path,
        ssl: logging.http.ssl,
        headers: logging.http.headers,
        ...(logging.http.username
          ? { auth: { username: logging.http.username, password: logging.http.password } }
          : logging.http.bearer
            ? { auth: { bearer: logging.http.bearer } }
            : {})
      });
  }
}

function createLogFormat(): winston.Logform.Format {
  return winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  );
}

/**
 * Writes a structured log entry through the active Winston transport.
 */
function writeLog(
  logger: winston.Logger,
  level: "debug" | "error" | "info" | "warn",
  message: string,
  context?: Record<string, unknown>
): void {
  logger.log({
    level,
    message,
    ...(context ? { context } : {})
  });
}
