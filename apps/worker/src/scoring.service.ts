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

  async score(candidateId: string): Promise<ScoreOutcome> {
    const candidate = await this.dataSource.getRepository(Candidate).findOne({
      where: { id: candidateId },
      relations: { job: true },
    });
    if (!candidate) {
      // Deleted between upload and processing: acknowledge and move on.
      return { kind: 'skipped', reason: 'candidate no longer exists' };
    }

    await this.dataSource
      .getRepository(Candidate)
      .update(candidateId, { scoringStatus: ScoringStatus.PROCESSING });

    const started = Date.now();
    const analysis = await this.llm.analyze(candidate.job.description, candidate.resumeText);
    this.logger.log(
      JSON.stringify({
        event: 'llm.analyzed',
        candidateId,
        provider: this.llm.name,
        score: analysis.score,
        ms: Date.now() - started,
      }),
    );

    return this.applyResult(candidateId, analysis);
  }

  /**
   * Persist the score and run workflow automation in one transaction.
   * The row lock serialises us against a recruiter moving the same card.
   */
  private applyResult(candidateId: string, analysis: Analysis): Promise<ScoreOutcome> {
    return this.dataSource.transaction(async (tx) => {
      const candidate = await tx.findOne(Candidate, {
        where: { id: candidateId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!candidate) return { kind: 'skipped', reason: 'candidate no longer exists' };
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
      candidate.scoringStatus = ScoringStatus.SCORED;
      candidate.scoringError = null;
      if (automated) {
        candidate.stage = decision.toStage;
        candidate.outreachDraft = decision.outreachDraft;
      }
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

  async markFailed(candidateId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await this.dataSource
      .getRepository(Candidate)
      .update(candidateId, { scoringStatus: ScoringStatus.FAILED, scoringError: message.slice(0, 500) });
  }

  static isPermanent(error: unknown): boolean {
    return error instanceof PermanentLlmError;
  }
}
