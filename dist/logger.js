import DailyRotateFile from "winston-daily-rotate-file";
import winston from "winston";
const defaultLoggingConfig = {
    transport: "console",
    level: "debug"
};
/**
 * Creates the process logger used by the mock server.
 */
export function createLogger(logging) {
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
function configureWinstonLogger(logger, logging) {
    const activeLevel = logging?.level ?? defaultLoggingConfig.level;
    const transportConfigs = resolveTransportConfigs(logging);
    const transports = transportConfigs.map((transportConfig) => {
        const transport = createTransport(transportConfig);
        transport.on("error", (error) => {
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
function resolveTransportConfigs(logging) {
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
        case "https":
            return [{ transport: "https", http: logging.http }];
    }
}
function createTransport(logging) {
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
            return createHttpTransport(logging.http, logging.http.ssl);
        case "https":
            return createHttpTransport(logging.http, true);
    }
}
function createHttpTransport(logging, ssl) {
    return new winston.transports.Http({
        host: logging.host,
        port: logging.port,
        path: logging.path,
        ssl,
        headers: logging.headers,
        ...(logging.username
            ? { auth: { username: logging.username, password: logging.password } }
            : logging.bearer
                ? { auth: { bearer: logging.bearer } }
                : {})
    });
}
function createLogFormat() {
    return winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json());
}
/**
 * Writes a structured log entry through the active Winston transport.
 */
function writeLog(logger, level, message, context) {
    logger.log({
        level,
        message,
        ...(context ? { context } : {})
    });
}
