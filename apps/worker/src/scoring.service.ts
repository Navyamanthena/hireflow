import {
  Analysis,
  Candidate,
  decideNextStage,
  evidenceProblem,
  Job,
  LlmProvider,
  PermanentLlmError,
  ScoringStatus,
  Stage,
  StageEvent,
  verifyEvidence,
} from '@app/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export type ScoreOutcome =
  | { kind: 'skipped'; reason: string }
  | { kind: 'scored'; score: number; stage: Stage; automated: boolean };

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  get providerLabel() {
    return this.llm.label;
  }

  /**
   * Claim the right to score `version`. Returns an ownership token, or null if
   * the version was superseded, the candidate deleted, or scoring finished.
   * PROCESSING is claimable so BullMQ retries / stalled-job recovery can take
   * over; the fresh token means the previous holder can no longer write.
   */
  async claim(candidateId: string, version: number): Promise<string | null> {
    const [rows] = await this.dataSource.query(
      `UPDATE candidates
          SET scoring_status = 'PROCESSING', scoring_attempt = gen_random_uuid(), updated_at = now()
        WHERE id = $1 AND scoring_version = $2 AND scoring_status IN ('PENDING', 'PROCESSING')
      RETURNING scoring_attempt`,
      [candidateId, version],
    );
    return rows[0]?.scoring_attempt ?? null;
  }

  /** Run the LLM and write the result, but only while `token` still owns the run. */
  async run(candidateId: string, token: string): Promise<ScoreOutcome> {
    const candidate = await this.dataSource.getRepository(Candidate).findOne({
      where: { id: candidateId },
      relations: { job: true },
    });
    if (!candidate) return { kind: 'skipped', reason: 'candidate no longer exists' };

    const started = Date.now();
    const raw = await this.llm.analyze(candidate.job.description, candidate.resumeText);
    const analysis = verifyEvidence(raw, candidate.resumeText);
    this.logger.log(
      JSON.stringify({
        event: 'llm.analyzed',
        candidateId,
        provider: this.llm.label,
        score: analysis.score,
        verifiedEvidence: analysis.evidence.length,
        unverifiedEvidence: analysis.unverifiedEvidence,
        ms: Date.now() - started,
      }),
    );

    return this.applyResult(candidateId, token, analysis);
  }

  /** Claim + run in one call (used by tests and scripts). */
  async score(candidateId: string, version: number): Promise<ScoreOutcome> {
    const token = await this.claim(candidateId, version);
    if (!token) return { kind: 'skipped', reason: 'superseded, deleted or already finished' };
    return this.run(candidateId, token);
  }

  /**
   * Persist the score and run workflow automation in one transaction.
   * The row lock serialises us against a recruiter moving the same card and
   * against other workers. The token check rejects any result whose run was
   * superseded: by a newer version (rescore) or by another worker taking over
   * the same version. The status check rejects writing over a finished run.
   */
  private applyResult(candidateId: string, token: string, analysis: Analysis): Promise<ScoreOutcome> {
    return this.dataSource.transaction(async (tx) => {
      const candidate = await tx.findOne(Candidate, {
        where: { id: candidateId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!candidate) return { kind: 'skipped', reason: 'candidate no longer exists' };
      if (candidate.scoringAttempt !== token || candidate.scoringStatus !== ScoringStatus.PROCESSING) {
        this.logger.warn(JSON.stringify({ event: 'scoring.result.discarded', candidateId, reason: 'lost ownership' }));
        return { kind: 'skipped', reason: 'run no longer owns this candidate (superseded or already finished)' };
      }
      // Re-read thresholds inside the transaction so a recruiter's latest edit applies.
      const job = await tx.findOneByOrFail(Job, { id: candidate.jobId });

      const decision = decideNextStage(analysis, job, candidate, job.title);
      const problem = evidenceProblem(analysis);
      if (problem) analysis.reviewReason = problem;

      // Automation never overrides a human: if the last move was by a user
      // (other than the initial application event), keep their decision.
      const lastEvent = await tx.findOne(StageEvent, {
        where: { candidateId },
        order: { createdAt: 'DESC' },
      });
      const humanDecided = !!lastEvent && lastEvent.actor === 'user' && lastEvent.fromStage !== null;
      const automated = !humanDecided && decision.toStage !== candidate.stage;

      const from = candidate.stage;
      candidate.score = analysis.score;
      candidate.analysis = analysis;
      candidate.scoredBy = this.llm.label;
      candidate.scoringStatus = ScoringStatus.SCORED;
      candidate.scoringError = null;
      candidate.scoringAttempt = null; // run complete; no token can write again
      // The draft always reflects the latest analysis: regenerated when the
      // score qualifies, cleared when it no longer does. Never left stale.
      candidate.outreachDraft = decision.outreachDraft;
      if (automated) candidate.stage = decision.toStage;
      await tx.save(candidate);

      if (automated) {
        await tx.save(
          tx.create(StageEvent, {
            candidateId,
            fromStage: from,
            toStage: decision.toStage,
            actor: 'system',
            reason: decision.reason,
          }),
        );
      }
      return { kind: 'scored', score: analysis.score, stage: candidate.stage, automated };
    });
  }

  /** Marks FAILED only if this run still owns the candidate. */
  async markFailed(candidateId: string, token: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await this.dataSource.query(
      `UPDATE candidates
          SET scoring_status = 'FAILED', scoring_error = $3, scoring_attempt = NULL, updated_at = now()
        WHERE id = $1 AND scoring_attempt = $2 AND scoring_status = 'PROCESSING'`,
      [candidateId, token, message.slice(0, 500)],
    );
  }

  static isPermanent(error: unknown): boolean {
    return error instanceof PermanentLlmError;
  }
}
