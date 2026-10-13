import { PermanentLlmError, RetryableLlmError } from '@app/common';
import { UnrecoverableError } from 'bullmq';
import { ScoringProcessor } from './scoring.processor';
import { ScoringService } from './scoring.service';

function makeJob(attemptsMade: number, attempts = 4) {
  return { name: 'resume.uploaded', data: { candidateId: 'c1', version: 3 }, attemptsMade, opts: { attempts } } as any;
}

describe('ScoringProcessor retry policy', () => {
  let scoring: { claim: jest.Mock; run: jest.Mock; markFailed: jest.Mock; markFailedUnclaimed: jest.Mock };
  let processor: ScoringProcessor;

  beforeEach(() => {
    scoring = {
      claim: jest.fn().mockResolvedValue('tok-1'),
      run: jest.fn(),
      markFailed: jest.fn(),
      markFailedUnclaimed: jest.fn().mockResolvedValue(undefined),
    };
    processor = new ScoringProcessor(scoring as unknown as ScoringService);
    jest.spyOn((processor as any).logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn((processor as any).logger, 'log').mockImplementation(() => undefined);
  });

  it('rethrows retryable errors without marking failed before the last attempt', async () => {
    scoring.run.mockRejectedValue(new RetryableLlmError('429'));
    await expect(processor.process(makeJob(0))).rejects.toThrow('429');
    expect(scoring.markFailed).not.toHaveBeenCalled();
  });

  it('marks the candidate failed on the final attempt', async () => {
    scoring.run.mockRejectedValue(new RetryableLlmError('503'));
    await expect(processor.process(makeJob(3))).rejects.toThrow('503');
    expect(scoring.markFailed).toHaveBeenCalledWith('c1', 'tok-1', expect.any(RetryableLlmError));
  });

  it('fails fast on permanent errors so retries are not wasted', async () => {
    scoring.run.mockRejectedValue(new PermanentLlmError('401 bad key'));
    await expect(processor.process(makeJob(0))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(scoring.markFailed).toHaveBeenCalled();
  });

  it('claims the job version and runs with the issued token', async () => {
    scoring.run.mockResolvedValue({ kind: 'scored', score: 1, stage: 'APPLIED', automated: false });
    await processor.process(makeJob(0));
    expect(scoring.claim).toHaveBeenCalledWith('c1', 3);
    expect(scoring.run).toHaveBeenCalledWith('c1', 'tok-1');
  });

  it('skips without calling the LLM when the claim fails', async () => {
    scoring.claim.mockResolvedValue(null);
    await expect(processor.process(makeJob(0))).resolves.toMatchObject({ kind: 'skipped' });
    expect(scoring.run).not.toHaveBeenCalled();
  });

  it('retries a failed claim without marking anything before the last attempt', async () => {
    scoring.claim.mockRejectedValue(new Error('ECONNREFUSED postgres'));
    await expect(processor.process(makeJob(1))).rejects.toThrow('ECONNREFUSED');
    expect(scoring.markFailedUnclaimed).not.toHaveBeenCalled();
    expect(scoring.run).not.toHaveBeenCalled();
  });

  it('marks the candidate failed when the claim fails on the final attempt', async () => {
    scoring.claim.mockRejectedValue(new Error('ECONNREFUSED postgres'));
    await expect(processor.process(makeJob(3))).rejects.toThrow('ECONNREFUSED');
    expect(scoring.markFailedUnclaimed).toHaveBeenCalledWith('c1', 3, expect.any(Error));
  });

  it('still fails the job (for the watchdog) if marking failed also errors', async () => {
    scoring.claim.mockRejectedValue(new Error('db down'));
    scoring.markFailedUnclaimed.mockRejectedValue(new Error('db still down'));
    jest.spyOn((processor as any).logger, 'error').mockImplementation(() => undefined);
    await expect(processor.process(makeJob(3))).rejects.toThrow('db down');
  });

  it('returns the outcome on success', async () => {
    scoring.run.mockResolvedValue({ kind: 'scored', score: 90, stage: 'PHONE_SCREEN', automated: true });
    await expect(processor.process(makeJob(0))).resolves.toMatchObject({ score: 90 });
  });
});
