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
    const activeConfig = logging ?? defaultLoggingConfig;
    const transport = createTransport(activeConfig);
    transport.on("error", (error) => {
        // Report transport failures directly to stderr so they do not recurse through the failed sink.
        process.stderr.write(`${JSON.stringify({
            timestamp: new Date().toISOString(),
            level: "error",
            message: "logging transport failed",
            context: {
                transport: activeConfig.transport,
                error: error.message
            }
        })}\n`);
    });
    logger.configure({
        level: activeConfig.level,
        format: createLogFormat(),
        transports: [transport]
    });
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
