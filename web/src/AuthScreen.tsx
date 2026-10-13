import { FormEvent, useState } from 'react';
import { api, Session } from './api';

export function AuthScreen(props: { onSignedIn: (s: Session) => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s =
        mode === 'signin'
          ? await api.login({ email: email.trim(), password })
          : await api.register({ orgName: orgName.trim(), name: name.trim(), email: email.trim(), password });
      props.onSignedIn(s);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const signup = mode === 'signup';
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="brand auth-brand">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path d="M4 6h10M4 12h16M4 18h7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </span>
          HireFlow
        </div>
        <h1>{signup ? 'Set up your hiring team' : 'Sign in'}</h1>
        <p className="lede">
          {signup
            ? 'You will be the admin. You can add recruiters once you are in.'
            : 'Score resumes against your open roles and move candidates through your pipeline.'}
        </p>
        <form onSubmit={submit}>
          {signup && (
            <>
              <label className="field">
                <span>Team or company name</span>
                <input required minLength={2} maxLength={200} value={orgName} onChange={(e) => setOrgName(e.target.value)} autoFocus />
              </label>
              <label className="field">
                <span>Your name</span>
                <input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
            </>
          )}
          <label className="field">
            <span>Work email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus={!signup}
            />
          </label>
          <label className="field">
            <span>Password{signup ? ' (at least 10 characters)' : ''}</span>
            <input
              type="password"
              required
              minLength={signup ? 10 : 1}
              maxLength={128}
              autoComplete={signup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary wide" disabled={busy}>
            {busy ? (signup ? 'Creating team…' : 'Signing in…') : signup ? 'Create team' : 'Sign in'}
          </button>
        </form>
        <p className="auth-switch">
          {signup ? 'Already have an account?' : 'New to HireFlow?'}{' '}
          <button
            className="link"
            onClick={() => {
              setMode(signup ? 'signin' : 'signup');
              setError(null);
            }}
          >
            {signup ? 'Sign in' : 'Set up a team'}
          </button>
        </p>
      </div>
    </main>
  );
}
