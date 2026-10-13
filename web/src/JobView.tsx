import { useCallback, useEffect, useRef, useState } from 'react';
import { AddCandidate } from './AddCandidate';
import { api, CandidateSummary, Job, Metrics, Stage, STAGES } from './api';
import { CandidatePanel } from './CandidatePanel';
import { ScoreCard } from './ScoreCard';

export function JobView(props: { job: Job; onJobChange: (j: Job) => void; onDeleted: () => void }) {
  const { job } = props;
  const [candidates, setCandidates] = useState<CandidateSummary[] | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<Stage | null>(null);
  const [showJd, setShowJd] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [c, m] = await Promise.all([api.listCandidates(job.id), api.metrics(job.id)]);
      setCandidates(c);
      setMetrics(m);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [job.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll only while the worker still has resumes to score.
  const scoring = candidates?.some((c) => c.scoringStatus === 'PENDING' || c.scoringStatus === 'PROCESSING');
  useEffect(() => {
    if (!scoring) return;
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [scoring, refresh]);

  async function move(id: string, stage: Stage) {
    const prev = candidates;
    setCandidates((cs) => cs?.map((c) => (c.id === id ? { ...c, stage } : c)) ?? null);
    try {
      await api.moveStage(id, stage, 'Moved on board');
      void refresh();
    } catch (e) {
      setCandidates(prev);
      setError((e as Error).message);
    }
  }

  return (
    <div className="job-view">
      <header className="job-header">
        <div className="job-title-row">
          <h1>{job.title}</h1>
          <div className="row">
            <button className="btn btn-ghost" onClick={() => setShowJd((v) => !v)} aria-expanded={showJd}>
              {showJd ? 'Hide description' : 'Job description'}
            </button>
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              Add candidate
            </button>
          </div>
        </div>
        {showJd && <pre className="jd">{job.description}</pre>}

        <RuleSentence job={job} onChange={props.onJobChange} onError={setError} />

        {metrics && metrics.total > 0 && (
          <dl className="metrics">
            <div>
              <dt>Candidates</dt>
              <dd>{metrics.total}</dd>
            </div>
            <div>
              <dt>Average fit</dt>
              <dd>{metrics.averageScore ?? '–'}</dd>
            </div>
            <div>
              <dt>Advanced</dt>
              <dd>{metrics.byStage.PHONE_SCREEN + metrics.byStage.INTERVIEW + metrics.byStage.OFFER + metrics.byStage.HIRED}</dd>
            </div>
            <div>
              <dt>Time to screen</dt>
              <dd>{formatSeconds(metrics.avgSecondsToScreen)}</dd>
            </div>
            {metrics.failedCount > 0 && (
              <div className="metric-warn">
                <dt>Scoring failed</dt>
                <dd>{metrics.failedCount}</dd>
              </div>
            )}
          </dl>
        )}
      </header>

      {error && <div className="banner banner-error" role="alert">{error}</div>}

      {candidates?.length === 0 && (
        <div className="empty">
          <h2>No candidates yet</h2>
          <p>Add a resume and it will be scored against this role within seconds.</p>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            Add the first candidate
          </button>
        </div>
      )}

      {candidates && candidates.length > 0 && (
        <div className="board" role="list" aria-label="Pipeline">
          {STAGES.map((s) => {
            const items = candidates.filter((c) => c.stage === s.id);
            return (
              <section
                key={s.id}
                role="listitem"
                aria-label={`${s.label}, ${items.length} candidates`}
                className={`lane lane-${s.id.toLowerCase()} ${dragOver === s.id ? 'is-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(s.id);
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const id = e.dataTransfer.getData('text/candidate');
                  const c = candidates.find((x) => x.id === id);
                  if (c && c.stage !== s.id) void move(id, s.id);
                }}
              >
                <header className="lane-head">
                  <h2>{s.label}</h2>
                  <span className="count">{items.length}</span>
                </header>
                {s.hint && <p className="lane-hint">{s.hint}</p>}
                <ul className="lane-cards">
                  {items.map((c) => (
                    <li key={c.id}>
                      <ScoreCard
                        candidate={c}
                        job={job}
                        active={openId === c.id}
                        onOpen={() => setOpenId(c.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {adding && (
        <AddCandidate
          jobId={job.id}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            void refresh();
          }}
        />
      )}

      {openId && (
        <CandidatePanel
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
          onDeleted={() => {
            setOpenId(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

/** The workflow rules, written as the sentence they enforce, with editable numbers. */
function RuleSentence(props: { job: Job; onChange: (j: Job) => void; onError: (m: string) => void }) {
  const { job } = props;
  const [advance, setAdvance] = useState(String(job.advanceThreshold));
  const [review, setReview] = useState(String(job.reviewThreshold));
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  async function save() {
    const a = Number(advance);
    const r = Number(review);
    if (a === job.advanceThreshold && r === job.reviewThreshold) return;
    try {
      const updated = await api.updateJob(job.id, { advanceThreshold: a, reviewThreshold: r });
      props.onChange(updated);
      setSaved(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      props.onError((e as Error).message);
      setAdvance(String(job.advanceThreshold));
      setReview(String(job.reviewThreshold));
    }
  }

  const num = (value: string, set: (v: string) => void, label: string) => (
    <input
      className="rule-num"
      type="number"
      min={0}
      max={100}
      aria-label={label}
      value={value}
      onChange={(e) => set(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );

  return (
    <p className="rule">
      Candidates who score {num(advance, setAdvance, 'Advance threshold')} or higher move to phone screen
      with an outreach email drafted. Below {num(review, setReview, 'Review threshold')}, a person
      reviews them. The system never rejects anyone on its own.
      <span className={`saved ${saved ? 'show' : ''}`} aria-live="polite">
        {saved ? 'Rules saved' : ''}
      </span>
    </p>
  );
}

function formatSeconds(s: number | null) {
  if (s === null) return '–';
  if (s < 1) return 'under 1s';
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}
