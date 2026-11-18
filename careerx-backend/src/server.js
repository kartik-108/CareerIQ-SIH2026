import app from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 CareerX backend running on port ${env.PORT} [${env.NODE_ENV}]`);
  logger.info(`   API base path: ${env.API_BASE_PATH}`);
  logger.info(`   Health check:  http://localhost:${env.PORT}/health`);
  logger.info('   AI Provider: Ollama');
  logger.info(`   Embedding Model: ${env.OLLAMA_EMBED_MODEL}`);
  logger.info(`   Chat Model: ${env.OLLAMA_CHAT_MODEL}`);
});

function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  // Force-exit if graceful shutdown hangs.
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'Uncaught exception — exiting');
  process.exit(1);
});
