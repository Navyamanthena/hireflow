import { useCallback, useEffect, useState } from 'react';
import { api, Candidate, Stage, STAGES, stageLabel } from './api';

export function CandidatePanel(props: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [c, setC] = useState<Candidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showResume, setShowResume] = useState(false);

  const load = useCallback(async () => {
    try {
      setC(await api.getCandidate(props.id));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [props.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = c?.scoringStatus === 'PENDING' || c?.scoringStatus === 'PROCESSING';
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [pending, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      await load();
      props.onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <aside className="panel" aria-label="Candidate details">
      <div className="panel-top">
        <button className="btn btn-ghost" onClick={props.onClose}>
          Close
        </button>
      </div>
      {error && <div className="banner banner-error" role="alert">{error}</div>}
      {!c && !error && <p className="muted">Loading…</p>}
      {c && (
        <>
          <div className="panel-head">
            <div>
              <h2>{c.name}</h2>
              {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
            </div>
            <div className="panel-score" aria-label={c.score === null ? 'Not scored' : `Fit ${c.score} of 100`}>
              {c.score ?? '–'}
            </div>
          </div>

          <label className="field inline">
            <span>Stage</span>
            <select value={c.stage} onChange={(e) => act(() => api.moveStage(c.id, e.target.value as Stage))}>
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          {pending && <p className="pending-note">Scoring this resume against the role…</p>}
          {c.scoringStatus === 'FAILED' && (
            <div className="banner banner-error">
              Scoring failed: {c.scoringError ?? 'unknown error'}.{' '}
              <button className="link" onClick={() => act(() => api.rescore(c.id))}>
                Try again
              </button>
            </div>
          )}

          {c.analysis && (
            <section className="panel-section">
              <p className="summary">{c.analysis.summary}</p>
              <h3>Matches the role</h3>
              <ul className="chips">
                {c.analysis.matchedSkills.length ? (
                  c.analysis.matchedSkills.map((s) => <li key={s} className="chip chip-match">{s}</li>)
                ) : (
                  <li className="muted">None found</li>
                )}
              </ul>
              <h3>Missing from resume</h3>
              <ul className="chips">
                {c.analysis.missingSkills.length ? (
                  c.analysis.missingSkills.map((s) => <li key={s} className="chip chip-miss">{s}</li>)
                ) : (
                  <li className="muted">Nothing missing</li>
                )}
              </ul>
              {!!c.analysis.evidence?.length && (
                <>
                  <h3>From the resume</h3>
                  <ul className="evidence">
                    {c.analysis.evidence.map((e, i) => (
                      <li key={i}>
                        <span className="chip chip-match">{e.skill}</span>
                        <q>{e.quote}</q>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {!!c.analysis.unverifiedEvidence && (
                <p className="fine">
                  {c.analysis.unverifiedEvidence} quote{c.analysis.unverifiedEvidence === 1 ? '' : 's'} from the
                  model did not appear in the resume and {c.analysis.unverifiedEvidence === 1 ? 'was' : 'were'} removed.
                </p>
              )}
              <h3>Why this score</h3>
              <ul className="reasons">
                {c.analysis.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              <p className="fine">
                Scored by {describeScorer(c.scoredBy)}
                {c.scoringVersion > 1 ? `, run ${c.scoringVersion}` : ''}.
              </p>
            </section>
          )}

          {c.outreachDraft && (
            <section className="panel-section">
              <div className="row between">
                <h3>Outreach draft</h3>
                <button
                  className="btn btn-ghost small"
                  onClick={async () => {
                    await navigator.clipboard.writeText(c.outreachDraft!);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? 'Copied' : 'Copy email'}
                </button>
              </div>
              <pre className="draft">{c.outreachDraft}</pre>
            </section>
          )}

          <section className="panel-section">
            <h3>History</h3>
            <ol className="timeline">
              {c.events.map((e) => (
                <li key={e.id} className={`tl-${e.actor}`}>
                  <span className="tl-what">
                    {e.fromStage ? `${stageLabel(e.fromStage)} to ${stageLabel(e.toStage)}` : stageLabel(e.toStage)}
                  </span>
                  <span className="tl-meta">
                    {e.actor === 'system' ? 'Automated' : 'Recruiter'}, {new Date(e.createdAt).toLocaleString()}
                  </span>
                  {e.reason && <span className="tl-reason">{e.reason}</span>}
                </li>
              ))}
            </ol>
          </section>

          <section className="panel-section">
            <button className="link" onClick={() => setShowResume((v) => !v)} aria-expanded={showResume}>
              {showResume ? 'Hide resume text' : 'Show resume text'}
            </button>
            {showResume && <pre className="resume">{c.resumeText}</pre>}
          </section>

          <div className="row panel-actions">
            <button className="btn btn-ghost" disabled={pending} onClick={() => act(() => api.rescore(c.id))}>
              Score again
            </button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                try {
                  await api.deleteCandidate(c.id);
                  props.onDeleted();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Delete candidate
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

function describeScorer(scoredBy: string | null) {
  if (!scoredBy) return 'an unknown scorer';
  if (scoredBy === 'heuristic') return 'keyword matching (demo mode, not AI)';
  const [provider, model] = scoredBy.split(':');
  const name = provider === 'anthropic' ? 'Anthropic' : provider === 'openai' ? 'OpenAI' : provider;
  return `${name} ${model ?? ''}`.trim();
}
