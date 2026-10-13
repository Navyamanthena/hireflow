import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api, Role, User } from './api';

export function TeamDialog(props: { me: User; onClose: () => void }) {
  const isAdmin = props.me.role === 'admin';
  const [members, setMembers] = useState<User[] | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('recruiter');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const load = useCallback(async () => {
    try {
      setMembers(await api.listTeam());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    dialog.current?.showModal();
    void load();
  }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const m = await api.addMember({ name: name.trim(), email: email.trim(), password, role });
      setNotice(`Added ${m.name}. Share the temporary password with them directly.`);
      setName('');
      setEmail('');
      setPassword('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(m: User) {
    setError(null);
    try {
      await api.removeMember(m.id);
      setNotice(`Removed ${m.name}. They were signed out right away.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <dialog ref={dialog} className="dialog" onClose={props.onClose} aria-labelledby="team-title">
      <h2 id="team-title">{props.me.org.name} team</h2>
      <ul className="team">
        {members?.map((m) => (
          <li key={m.id}>
            <span>
              <strong>{m.name}</strong>
              {m.id === props.me.id && ' (you)'}
              <span className="muted"> {m.email}</span>
            </span>
            <span className="row">
              <span className={`role role-${m.role}`}>{m.role === 'admin' ? 'Admin' : 'Recruiter'}</span>
              {isAdmin && m.id !== props.me.id && (
                <button className="btn btn-ghost small" onClick={() => remove(m)}>
                  Remove
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {notice && <p className="fine">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      {isAdmin ? (
        <form onSubmit={add} className="team-add">
          <h3>Add a team member</h3>
          <div className="row two">
            <label className="field">
              <span>Name</span>
              <input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          </div>
          <div className="row two">
            <label className="field">
              <span>Temporary password</span>
              <input
                type="password"
                required
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Role</span>
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="recruiter">Recruiter</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>
          <div className="row end">
            <button type="button" className="btn btn-ghost" onClick={() => dialog.current?.close()}>
              Close
            </button>
            <button className="btn btn-primary">Add member</button>
          </div>
        </form>
      ) : (
        <div className="row end">
          <p className="fine">Only admins can add or remove team members.</p>
          <button className="btn btn-ghost" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </div>
      )}
    </dialog>
  );
}
