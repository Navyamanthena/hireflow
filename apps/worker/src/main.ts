import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ScoringService } from './scoring.service';
import { WorkerModule } from './worker.module';

/**
 * The worker is a separate deployable: no HTTP server, it only consumes
 * events from the queue. Scale it independently of the API (e.g. replicas: 3).
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks(); // finish in-flight jobs on SIGTERM
  const provider = app.get(ScoringService).providerLabel;
  Logger.log(`Scoring worker started (provider: ${provider})`, 'Bootstrap');
  if (provider === 'heuristic') {
    Logger.warn(
      'DEMO MODE: scoring uses keyword matching, not an LLM. Set LLM_PROVIDER and an API key for AI scoring.',
      'Bootstrap',
    );
  }
}

void bootstrap();
