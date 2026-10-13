import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

/**
 * The worker is a separate deployable: no HTTP server, it only consumes
 * events from the queue. Scale it independently of the API (e.g. replicas: 3).
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks(); // finish in-flight jobs on SIGTERM
  Logger.log('Scoring worker started', 'Bootstrap');
}

void bootstrap();
