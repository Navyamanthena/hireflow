import type { DataSourceOptions } from 'typeorm';
import { Candidate } from './entities/candidate.entity';
import { Job } from './entities/job.entity';
import { StageEvent } from './entities/stage-event.entity';
import { InitialSchema1760000000000 } from './migrations/1760000000000-InitialSchema';

export const ENTITIES = [Job, Candidate, StageEvent];
export const MIGRATIONS = [InitialSchema1760000000000];

/** One place for DB config. Schema changes go through migrations, never synchronize. */
export function databaseOptions(env: NodeJS.ProcessEnv = process.env): DataSourceOptions {
  return {
    type: 'postgres',
    url: env.DATABASE_URL ?? 'postgres://hireflow:hireflow@localhost:5432/hireflow',
    entities: ENTITIES,
    migrations: MIGRATIONS,
    synchronize: false,
    // gen_random_uuid() is built into Postgres 13+, so no extension is required.
    uuidExtension: 'pgcrypto',
    installExtensions: false,
  };
}
