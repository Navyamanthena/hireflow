export type Stage =
  | 'APPLIED'
  | 'NEEDS_REVIEW'
  | 'SCREENED'
  | 'PHONE_SCREEN'
  | 'INTERVIEW'
  | 'OFFER'
  | 'HIRED'
  | 'REJECTED';

export type ScoringStatus = 'PENDING' | 'PROCESSING' | 'SCORED' | 'FAILED';

export const STAGES: { id: Stage; label: string; hint: string }[] = [
  { id: 'APPLIED', label: 'Applied', hint: 'Waiting for scoring' },
  { id: 'NEEDS_REVIEW', label: 'Needs review', hint: 'Low score, a person decides' },
  { id: 'SCREENED', label: 'Screened', hint: 'Scored between thresholds' },
  { id: 'PHONE_SCREEN', label: 'Phone screen', hint: 'Advanced, outreach drafted' },
  { id: 'INTERVIEW', label: 'Interview', hint: '' },
  { id: 'OFFER', label: 'Offer', hint: '' },
  { id: 'HIRED', label: 'Hired', hint: '' },
  { id: 'REJECTED', label: 'Rejected', hint: '' },
];

export const stageLabel = (s: Stage) => STAGES.find((x) => x.id === s)?.label ?? s;

export interface Job {
  id: string;
  title: string;
  description: string;
  advanceThreshold: number;
  reviewThreshold: number;
  createdAt: string;
}

export interface Analysis {
  score: number;
  summary: string;
  matchedSkills: string[];
  missingSkills: string[];
  reasons: string[];
  evidence?: { skill: string; quote: string }[];
  unverifiedEvidence?: number;
  unsupportedSkills?: string[];
  reviewReason?: string;
}

export interface ScoringConfig {
  provider: 'anthropic' | 'openai' | 'heuristic';
  model: string | null;
  demoMode: boolean;
  error?: string;
}

export interface StageEvent {
  id: string;
  fromStage: Stage | null;
  toStage: Stage;
  actor: 'system' | 'user';
  reason: string | null;
  createdAt: string;
}

export interface CandidateSummary {
  id: string;
  jobId: string;
  name: string;
  email: string | null;
  stage: Stage;
  scoringStatus: ScoringStatus;
  score: number | null;
  createdAt: string;
}

export interface Candidate extends CandidateSummary {
  resumeText: string;
  analysis: Analysis | null;
  outreachDraft: string | null;
  scoringError: string | null;
  scoringVersion: number;
  scoredBy: string | null;
  events: StageEvent[];
}

export interface Metrics {
  total: number;
  byStage: Record<Stage, number>;
  averageScore: number | null;
  scoredCount: number;
  failedCount: number;
  avgSecondsToScreen: number | null;
}

const BASE = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
  }
}

export type Role = 'admin' | 'recruiter';
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  org: { id: string; name: string };
}
export interface Session {
  token: string;
  user: User;
}

/*
 * Session token, kept in localStorage so a reload stays signed in.
 * Trade-off (noted in the README): an httpOnly cookie would keep the token
 * away from page scripts, at the cost of CSRF handling.
 */
const TOKEN_KEY = 'hireflow.token';
let token: string | null = (() => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
})();

export const session = {
  token: () => token,
  set(next: string | null) {
    token = next;
    try {
      if (next) localStorage.setItem(TOKEN_KEY, next);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable: session lasts until reload */
    }
  },
};

/** Fired when the API rejects the token, so the app can return to sign-in. */
export const SIGNED_OUT_EVENT = 'hireflow:signed-out';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  if (!isForm && init?.body) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('Can’t reach the API. Check that it is running on port 3000.');
  }
  if (res.status === 401 && token && !path.startsWith('/auth/')) {
    session.set(null);
    window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(body.message) ? body.message.join('. ') : body.message;
    throw new ApiError(msg ?? `Request failed (${res.status})`, res.status);
  }
  return body as T;
}

export const api = {
  register: (data: { orgName: string; name: string; email: string; password: string }) =>
    call<Session>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    call<Session>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => call<User>('/auth/me'),
  listTeam: () => call<User[]>('/team'),
  addMember: (data: { name: string; email: string; password: string; role: Role }) =>
    call<User>('/team', { method: 'POST', body: JSON.stringify(data) }),
  removeMember: (id: string) => call<void>(`/team/${id}`, { method: 'DELETE' }),
  config: () => call<{ scoring: ScoringConfig }>('/config'),
  listJobs: () => call<Job[]>('/jobs'),
  createJob: (data: { title: string; description: string }) =>
    call<Job>('/jobs', { method: 'POST', body: JSON.stringify(data) }),
  updateJob: (id: string, data: Partial<Pick<Job, 'advanceThreshold' | 'reviewThreshold'>>) =>
    call<Job>(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteJob: (id: string) => call<void>(`/jobs/${id}`, { method: 'DELETE' }),
  metrics: (id: string) => call<Metrics>(`/jobs/${id}/metrics`),
  listCandidates: (jobId: string) => call<CandidateSummary[]>(`/jobs/${jobId}/candidates`),
  addCandidate: (jobId: string, data: { name: string; email?: string; resumeText: string }) =>
    call<Candidate>(`/jobs/${jobId}/candidates`, { method: 'POST', body: JSON.stringify(data) }),
  uploadCandidate: (jobId: string, form: FormData) =>
    call<Candidate>(`/jobs/${jobId}/candidates/upload`, { method: 'POST', body: form }),
  getCandidate: (id: string) => call<Candidate>(`/candidates/${id}`),
  moveStage: (id: string, stage: Stage, reason?: string) =>
    call<Candidate>(`/candidates/${id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage, reason }) }),
  rescore: (id: string) => call<Candidate>(`/candidates/${id}/rescore`, { method: 'POST' }),
  deleteCandidate: (id: string) => call<void>(`/candidates/${id}`, { method: 'DELETE' }),
};
