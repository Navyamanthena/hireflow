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
import { WorkerModule } from '../../worker/src/worker.module';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';

process.env.DATABASE_URL ??= 'postgres://hireflow:hireflow@localhost:5432/hireflow_test';
process.env.LLM_PROVIDER = 'heuristic';

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
    await ds.query('TRUNCATE stage_events, candidates, jobs CASCADE');
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

  it('reports healthy dependencies', async () => {
    const res = await http.get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: true, redis: true });
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
});
