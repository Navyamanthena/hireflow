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

export class ApiError extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: isForm || !init?.body ? init?.headers : { 'content-type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError('Can’t reach the API. Check that it is running on port 3000.');
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(body.message) ? body.message.join('. ') : body.message;
    throw new ApiError(msg ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
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
