import {
  Analysis,
  Candidate,
  decideNextStage,
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

  async score(candidateId: string, version: number): Promise<ScoreOutcome> {
    // Atomic claim: only the job for the CURRENT version may run. A job for a
    // superseded version (the recruiter clicked rescore again) exits here.
    // PROCESSING is allowed so BullMQ retries/stalled-job recovery can resume.
    const [claimed] = await this.dataSource.query(
      `UPDATE candidates SET scoring_status = 'PROCESSING', updated_at = now()
        WHERE id = $1 AND scoring_version = $2 AND scoring_status IN ('PENDING', 'PROCESSING')
      RETURNING id`,
      [candidateId, version],
    );
    if (!claimed.length) {
      return { kind: 'skipped', reason: 'superseded, deleted or already finished' };
    }

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
        version,
        provider: this.llm.label,
        score: analysis.score,
        unverifiedEvidence: analysis.unverifiedEvidence,
        ms: Date.now() - started,
      }),
    );

    return this.applyResult(candidateId, version, analysis);
  }

  /**
   * Persist the score and run workflow automation in one transaction.
   * The row lock serialises us against a recruiter moving the same card, and
   * the version check drops results that a newer rescore has superseded.
   */
  private applyResult(candidateId: string, version: number, analysis: Analysis): Promise<ScoreOutcome> {
    return this.dataSource.transaction(async (tx) => {
      const candidate = await tx.findOne(Candidate, {
        where: { id: candidateId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!candidate) return { kind: 'skipped', reason: 'candidate no longer exists' };
      if (candidate.scoringVersion !== version) {
        return { kind: 'skipped', reason: `stale result v${version}, current v${candidate.scoringVersion}` };
      }
      // Re-read thresholds inside the transaction so a recruiter's latest edit applies.
      const job = await tx.findOneByOrFail(Job, { id: candidate.jobId });

      const decision = decideNextStage(analysis, job, candidate, job.title);

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

  /** Only marks FAILED if no newer scoring request has started since. */
  async markFailed(candidateId: string, version: number, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await this.dataSource.query(
      `UPDATE candidates SET scoring_status = 'FAILED', scoring_error = $3, updated_at = now()
        WHERE id = $1 AND scoring_version = $2`,
      [candidateId, version, message.slice(0, 500)],
    );
  }

  static isPermanent(error: unknown): boolean {
    return error instanceof PermanentLlmError;
  }
}
