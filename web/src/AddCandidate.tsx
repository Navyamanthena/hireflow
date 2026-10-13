import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from './api';

export function AddCandidate(props: { jobId: string; onClose: () => void; onAdded: () => void }) {
  const [mode, setMode] = useState<'upload' | 'paste'>('upload');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'upload') {
        if (!file) throw new Error('Choose a resume file to upload.');
        const form = new FormData();
        form.set('name', name.trim());
        if (email.trim()) form.set('email', email.trim());
        form.set('file', file);
        await api.uploadCandidate(props.jobId, form);
      } else {
        await api.addCandidate(props.jobId, {
          name: name.trim(),
          email: email.trim() || undefined,
          resumeText: text,
        });
      }
      props.onAdded();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} className="dialog" onClose={props.onClose} aria-labelledby="add-title">
      <form onSubmit={submit}>
        <h2 id="add-title">Add candidate</h2>
        <div className="row two">
          <label className="field">
            <span>Full name</span>
            <input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label className="field">
            <span>Email (optional)</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        </div>

        <div className="segmented" role="tablist" aria-label="Resume source">
          <button type="button" role="tab" aria-selected={mode === 'upload'} onClick={() => setMode('upload')}>
            Upload file
          </button>
          <button type="button" role="tab" aria-selected={mode === 'paste'} onClick={() => setMode('paste')}>
            Paste text
          </button>
        </div>

        {mode === 'upload' ? (
          <label className="drop">
            <input
              type="file"
              accept=".pdf,.txt,.md,application/pdf,text/plain"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <strong>{file ? file.name : 'Choose a resume'}</strong>
            <span>PDF, TXT or Markdown, up to 5 MB</span>
          </label>
        ) : (
          <label className="field">
            <span>Resume text</span>
            <textarea required minLength={30} rows={10} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="row end">
          <button type="button" className="btn btn-ghost" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Adding…' : 'Add and score'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
