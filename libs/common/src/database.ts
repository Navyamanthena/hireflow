import type { DataSourceOptions } from 'typeorm';
import { Candidate } from './entities/candidate.entity';
import { Job } from './entities/job.entity';
import { StageEvent } from './entities/stage-event.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { Organization } from './entities/organization.entity';
import { User } from './entities/user.entity';
import { InitialSchema1760000000000 } from './migrations/1760000000000-InitialSchema';
import { ReliableScoring1791920662003 } from './migrations/1791920662003-ReliableScoring';
import { ScoringAttemptToken1791921413773 } from './migrations/1791921413773-ScoringAttemptToken';
import { AuthAndOrgs1791922578069 } from './migrations/1791922578069-AuthAndOrgs';

export const ENTITIES = [Organization, User, Job, Candidate, StageEvent, OutboxEvent];
export const MIGRATIONS = [
  InitialSchema1760000000000,
  ReliableScoring1791920662003,
  ScoringAttemptToken1791921413773,
  AuthAndOrgs1791922578069,
];

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
