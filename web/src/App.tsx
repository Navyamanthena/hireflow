import { useCallback, useEffect, useState } from 'react';
import { api, Job } from './api';
import { JobView } from './JobView';
import { NewJobForm } from './NewJobForm';

export function App() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api.listJobs();
      setJobs(list);
      setError(null);
      setSelectedId((cur) => (cur && list.some((j) => j.id === cur) ? cur : list[0]?.id ?? null));
    } catch (e) {
      setError((e as Error).message);
      setJobs([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = jobs?.find((j) => j.id === selectedId) ?? null;
  const showForm = creating || (jobs !== null && jobs.length === 0 && !error);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path d="M4 6h10M4 12h16M4 18h7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </span>
          HireFlow
        </div>

        <nav aria-label="Open roles" className="job-nav">
          <h2 className="nav-heading">Open roles</h2>
          {jobs?.map((j) => (
            <button
              key={j.id}
              className="job-link"
              aria-current={j.id === selectedId && !creating ? 'page' : undefined}
              onClick={() => {
                setSelectedId(j.id);
                setCreating(false);
              }}
            >
              {j.title}
            </button>
          ))}
          {jobs?.length === 0 && <p className="nav-empty">No roles yet.</p>}
        </nav>

        <button className="btn btn-ghost new-role" onClick={() => setCreating(true)}>
          + New role
        </button>

        <select
          className="job-select"
          aria-label="Choose role"
          value={creating ? '__new' : selectedId ?? ''}
          onChange={(e) => {
            if (e.target.value === '__new') setCreating(true);
            else {
              setSelectedId(e.target.value);
              setCreating(false);
            }
          }}
        >
          {jobs?.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
          <option value="__new">+ New role</option>
        </select>
      </aside>

      <main className="main">
        {error && <div className="banner banner-error" role="alert">{error}</div>}
        {jobs === null && <p className="muted pad">Loading roles…</p>}
        {showForm && (
          <NewJobForm
            canCancel={!!jobs?.length}
            onCancel={() => setCreating(false)}
            onCreated={async (job) => {
              setCreating(false);
              await load();
              setSelectedId(job.id);
            }}
          />
        )}
        {!showForm && selected && (
          <JobView
            key={selected.id}
            job={selected}
            onJobChange={(j) => setJobs((prev) => prev?.map((x) => (x.id === j.id ? j : x)) ?? null)}
            onDeleted={load}
          />
        )}
      </main>
    </div>
  );
}
