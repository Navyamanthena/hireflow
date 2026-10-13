import { FormEvent, useState } from 'react';
import { api, Job } from './api';

export function NewJobForm(props: {
  canCancel: boolean;
  onCancel: () => void;
  onCreated: (job: Job) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      props.onCreated(await api.createJob({ title: title.trim(), description: description.trim() }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="new-job" onSubmit={submit}>
      <h1>Open a role</h1>
      <p className="lede">
        Paste the job description. Every resume you add is scored against it, and candidates move
        through the pipeline automatically.
      </p>
      <label className="field">
        <span>Role title</span>
        <input
          required
          minLength={2}
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Software Engineer, New Grad"
        />
      </label>
      <label className="field">
        <span>Job description</span>
        <textarea
          required
          minLength={20}
          rows={14}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Responsibilities, required skills, nice-to-haves…"
        />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="row">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Opening role…' : 'Open role'}
        </button>
        {props.canCancel && (
          <button type="button" className="btn btn-ghost" onClick={props.onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
