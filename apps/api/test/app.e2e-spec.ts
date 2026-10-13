/**
 * End-to-end: boots the real API *and* the real worker against Postgres +
 * Redis, then drives the system over HTTP exactly like the frontend does.
 * Requires DATABASE_URL to point at a disposable test database.
 */
import { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ScoringService } from '../../worker/src/scoring.service';
import { WorkerModule } from '../../worker/src/worker.module';
import { ScoringProducer } from '../src/candidates/scoring.producer';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';

process.env.DATABASE_URL ??= 'postgres://hireflow:hireflow@localhost:5432/hireflow_test';
process.env.LLM_PROVIDER = 'heuristic';
process.env.OUTBOX_RELAY_INTERVAL_MS = '200';
process.env.QUEUE_PREFIX = 'hireflow-e2e'; // isolated from any running dev worker

const JD = `Full-stack engineer. TypeScript, Node.js, NestJS, React, PostgreSQL,
REST APIs, Docker, CI/CD, AWS. Interest in AI / LLM products.`;
const STRONG = `TypeScript, Node.js, NestJS, React, PostgreSQL, REST APIs, Docker,
GitHub Actions CI/CD, AWS, built LLM features with OpenAI.`;
const WEAK = 'Retail associate experienced with cash handling, inventory and customer service.';

describe('HireFlow (e2e)', () => {
  let app: INestApplication;
  let worker: INestApplicationContext;
  let http: ReturnType<typeof request>;
  let jobId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    const ds = app.get(DataSource);
    await ds.query('TRUNCATE outbox_events, stage_events, candidates, jobs CASCADE');
    worker = await NestFactory.createApplicationContext(WorkerModule, { logger: false });
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await worker?.close();
    await app?.close();
  });

  async function waitForScore(id: string) {
    for (let i = 0; i < 50; i++) {
      const res = await http.get(`/api/candidates/${id}`);
      if (['SCORED', 'FAILED'].includes(res.body.scoringStatus)) return res.body;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('candidate was never scored');
  }

  it('reports healthy dependencies and the scoring mode', async () => {
    const res = await http.get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: true, redis: true, outboxPending: 0 });
    const cfg = await http.get('/api/config').expect(200);
    expect(cfg.body.scoring).toMatchObject({ provider: 'heuristic', demoMode: true });
  });

  it('creates a job and validates input', async () => {
    await http.post('/api/jobs').send({ title: 'x', description: 'short' }).expect(400);
    await http
      .post('/api/jobs')
      .send({ title: 'SWE', description: JD, advanceThreshold: 40, reviewThreshold: 60 })
      .expect(400);
    const res = await http.post('/api/jobs').send({ title: 'SWE, New Grad', description: JD }).expect(201);
    jobId = res.body.id;
    expect(res.body).toMatchObject({ advanceThreshold: 80, reviewThreshold: 50 });
  });

  it('scores a strong resume asynchronously and auto-advances it with an outreach draft', async () => {
    const res = await http
      .post(`/api/jobs/${jobId}/candidates`)
      .send({ name: 'Alex Strong', email: 'alex@example.com', resumeText: STRONG })
      .expect(201);
    expect(res.body.stage).toBe('APPLIED'); // API returns before scoring happens

    const scored = await waitForScore(res.body.id);
    expect(scored.score).toBeGreaterThanOrEqual(80);
    expect(scored.stage).toBe('PHONE_SCREEN');
    expect(scored.outreachDraft).toContain('Hi Alex');
    expect(scored.scoredBy).toBe('heuristic');
    expect(scored.analysis.evidence.length).toBeGreaterThan(0);
    expect(scored.events.map((e: any) => [e.toStage, e.actor])).toEqual([
      ['APPLIED', 'user'],
      ['PHONE_SCREEN', 'system'],
    ]);
  });

  it('routes a weak resume to human review instead of rejecting it', async () => {
    const res = await http
      .post(`/api/jobs/${jobId}/candidates`)
      .send({ name: 'Sam Weak', resumeText: WEAK })
      .expect(201);
    const scored = await waitForScore(res.body.id);
    expect(scored.stage).toBe('NEEDS_REVIEW');
  });

  it('accepts text file uploads and rejects unsupported types', async () => {
    await http
      .post(`/api/jobs/${jobId}/candidates/upload`)
      .field('name', 'Bad File')
      .attach('file', Buffer.from('MZ binary'), 'resume.exe')
      .expect(400);
    const res = await http
      .post(`/api/jobs/${jobId}/candidates/upload`)
      .field('name', 'Txt Upload')
      .attach('file', Buffer.from(STRONG), 'resume.txt')
      .expect(201);
    expect((await waitForScore(res.body.id)).scoringStatus).toBe('SCORED');
  });

  it('never lets automation override a recruiter decision', async () => {
    const res = await http
      .post(`/api/jobs/${jobId}/candidates`)
      .send({ name: 'Riley Human', resumeText: WEAK })
      .expect(201);
    await waitForScore(res.body.id);

    await http
      .patch(`/api/candidates/${res.body.id}/stage`)
      .send({ stage: 'INTERVIEW', reason: 'Referral' })
      .expect(200);
    await http.post(`/api/candidates/${res.body.id}/rescore`).expect(201);
    await new Promise((r) => setTimeout(r, 300));
    const after = await waitForScore(res.body.id);
    expect(after.stage).toBe('INTERVIEW');
  });

  it('lists candidates ranked by score and filters by stage', async () => {
    const all = await http.get(`/api/jobs/${jobId}/candidates`).expect(200);
    const scores = all.body.map((c: any) => c.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(all.body[0]).not.toHaveProperty('resumeText'); // list view stays lean

    const review = await http.get(`/api/jobs/${jobId}/candidates?stage=NEEDS_REVIEW`).expect(200);
    expect(review.body.every((c: any) => c.stage === 'NEEDS_REVIEW')).toBe(true);
    await http.get(`/api/jobs/${jobId}/candidates?stage=BOGUS`).expect(400);
  });

  it('computes pipeline metrics in SQL', async () => {
    const res = await http.get(`/api/jobs/${jobId}/metrics`).expect(200);
    expect(res.body.total).toBe(4);
    expect(res.body.byStage.PHONE_SCREEN).toBe(2);
    expect(res.body.byStage.NEEDS_REVIEW).toBe(1);
    expect(res.body.byStage.INTERVIEW).toBe(1);
    expect(res.body.scoredCount).toBe(4);
    expect(res.body.avgSecondsToScreen).not.toBeNull();
  });

  it('returns 404s for unknown ids', async () => {
    await http.get('/api/candidates/00000000-0000-4000-8000-000000000000').expect(404);
    await http.get('/api/jobs/not-a-uuid').expect(400);
  });

  describe('reliability', () => {
    let job2: string;
    const waitUntil = async (id: string, pred: (c: any) => boolean) => {
      for (let i = 0; i < 60; i++) {
        const c = (await http.get(`/api/candidates/${id}`)).body;
        if (pred(c)) return c;
        await new Promise((r) => setTimeout(r, 150));
      }
      throw new Error('condition never met');
    };

    beforeAll(async () => {
      const res = await http
        .post('/api/jobs')
        .send({ title: 'Frontend', description: 'Must have React and TypeScript experience.' })
        .expect(201);
      job2 = res.body.id;
    });

    it('does not lose the scoring event when publishing to Redis fails', async () => {
      const producer = app.get(ScoringProducer);
      const spy = jest
        .spyOn(producer, 'publish')
        .mockRejectedValueOnce(new Error('Redis down'))
        .mockRejectedValueOnce(new Error('Redis still down'));

      const res = await http
        .post(`/api/jobs/${job2}/candidates`)
        .send({ name: 'Outage Olivia', resumeText: 'React and TypeScript engineer, five years.' })
        .expect(201); // the request succeeds even though Redis is "down"

      const scored = await waitUntil(res.body.id, (c) => c.scoringStatus === 'SCORED');
      expect(scored.score).toBe(100);
      expect(spy.mock.calls.length).toBeGreaterThanOrEqual(3);
      spy.mockRestore();

      const [row] = await app
        .get(DataSource)
        .query(`SELECT attempts, published_at, last_error FROM outbox_events WHERE payload->>'candidateId' = $1`, [
          res.body.id,
        ]);
      expect(row.attempts).toBe(3);
      expect(row.published_at).not.toBeNull();
      expect(row.last_error).toContain('Redis still down');
    });

    it('allows exactly one of several concurrent rescores', async () => {
      const res = await http
        .post(`/api/jobs/${job2}/candidates`)
        .send({ name: 'Double Click', resumeText: 'React and TypeScript engineer, five years.' })
        .expect(201);
      await waitUntil(res.body.id, (c) => c.scoringStatus === 'SCORED');

      const statuses = (
        await Promise.all(Array.from({ length: 6 }, () => http.post(`/api/candidates/${res.body.id}/rescore`)))
      ).map((r) => r.status);
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(5);

      const after = await waitUntil(res.body.id, (c) => c.scoringStatus === 'SCORED');
      expect(after.scoringVersion).toBe(2);
    });

    it('discards a result for a superseded scoring version', async () => {
      const res = await http
        .post(`/api/jobs/${job2}/candidates`)
        .send({ name: 'Stale Sam', resumeText: 'React and TypeScript engineer, five years.' })
        .expect(201);
      await waitUntil(res.body.id, (c) => c.scoringStatus === 'SCORED');
      await http.post(`/api/candidates/${res.body.id}/rescore`).expect(201);
      const current = await waitUntil(res.body.id, (c) => c.scoringStatus === 'SCORED');

      // A slow job for version 1 finishing late must not overwrite version 2.
      const outcome = await worker.get(ScoringService).score(res.body.id, 1);
      expect(outcome.kind).toBe('skipped');
      const after = (await http.get(`/api/candidates/${res.body.id}`)).body;
      expect(after.scoringVersion).toBe(2);
      expect(after.updatedAt).toBe(current.updatedAt);
    });

    it('rescore 404s for unknown candidates', async () => {
      await http.post('/api/candidates/00000000-0000-4000-8000-000000000000/rescore').expect(404);
    });

    it('keeps the outreach draft in sync with the latest analysis', async () => {
      const res = await http
        .post(`/api/jobs/${job2}/candidates`)
        .send({ name: 'Draft Dana', resumeText: 'React, TypeScript and Python developer with five years.' })
        .expect(201);
      const first = await waitUntil(res.body.id, (c) => c.scoringStatus === 'SCORED');
      expect(first.stage).toBe('PHONE_SCREEN');
      expect(first.outreachDraft).toContain('React');

      // Same stage after rescoring, but different matched skills: the draft must follow.
      await http.patch(`/api/jobs/${job2}`).send({ description: 'Must have strong Python experience.' }).expect(200);
      await http.post(`/api/candidates/${res.body.id}/rescore`).expect(201);
      const second = await waitUntil(res.body.id, (c) => c.scoringStatus === 'SCORED' && c.scoringVersion === 2);
      expect(second.stage).toBe('PHONE_SCREEN');
      expect(second.analysis.matchedSkills).toEqual(['Python']);
      expect(second.outreachDraft).toContain('Python');
      expect(second.outreachDraft).not.toContain('React');

      // Score no longer qualifies: the draft is cleared, not left behind.
      await http.patch(`/api/jobs/${job2}`).send({ description: 'Must have Go and Kafka experience.' }).expect(200);
      await http.post(`/api/candidates/${res.body.id}/rescore`).expect(201);
      const third = await waitUntil(res.body.id, (c) => c.scoringStatus === 'SCORED' && c.scoringVersion === 3);
      expect(third.stage).toBe('NEEDS_REVIEW');
      expect(third.outreachDraft).toBeNull();
    });
  });
});
