import { CandidateSummary, Job } from './api';

export function scoreBand(score: number, job: Pick<Job, 'advanceThreshold' | 'reviewThreshold'>) {
  if (score >= job.advanceThreshold) return 'high';
  if (score < job.reviewThreshold) return 'low';
  return 'mid';
}

export function ScoreCard(props: {
  candidate: CandidateSummary;
  job: Job;
  active: boolean;
  onOpen: () => void;
}) {
  const { candidate: c, job } = props;
  const pending = c.scoringStatus === 'PENDING' || c.scoringStatus === 'PROCESSING';
  const failed = c.scoringStatus === 'FAILED';
  const band = c.score === null ? 'none' : scoreBand(c.score, job);

  return (
    <button
      className={`card band-${band} ${props.active ? 'is-active' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/candidate', c.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={props.onOpen}
      aria-label={`${c.name}, ${c.score === null ? statusText(c.scoringStatus) : `fit ${c.score} of 100`}`}
    >
      <span className="card-name">{c.name}</span>
      <span className="card-score" aria-hidden>
        {c.score ?? (failed ? '!' : '··')}
      </span>
      <span className="fit" aria-hidden>
        <span className="fit-fill" style={{ width: `${c.score ?? 0}%` }} />
        <span className="fit-tick" style={{ left: `${job.reviewThreshold}%` }} />
        <span className="fit-tick" style={{ left: `${job.advanceThreshold}%` }} />
      </span>
      <span className={`card-status ${pending ? 'is-pending' : ''} ${failed ? 'is-failed' : ''}`}>
        {pending ? statusText(c.scoringStatus) : failed ? 'Scoring failed' : c.email ?? 'No email'}
      </span>
    </button>
  );
}

function statusText(s: CandidateSummary['scoringStatus']) {
  return s === 'PROCESSING' ? 'Scoring…' : s === 'PENDING' ? 'Queued for scoring' : s === 'FAILED' ? 'Scoring failed' : '';
}
