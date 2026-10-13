import { Analysis, parseAnalysis } from './analysis.schema';
import { buildUserPrompt, SYSTEM_PROMPT } from './prompt';
import { HeuristicProvider } from './heuristic.provider';

export interface LlmProvider {
  readonly name: string;
  /** Stored on each candidate as provenance, e.g. "anthropic:claude-haiku-5-5". */
  readonly label: string;
  analyze(jobDescription: string, resumeText: string): Promise<Analysis>;
}

/** Error types the worker uses to decide whether a retry can help. */
export class RetryableLlmError extends Error {}
export class PermanentLlmError extends Error {}

const TIMEOUT_MS = 30_000;

export const DEFAULT_MODELS = {
  anthropic: 'claude-haiku-5-5',
  openai: 'gpt-4o-mini',
} as const;

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // Network failure or timeout: worth retrying.
    throw new RetryableLlmError(`LLM API unreachable: ${(err as Error).message}`);
  }
  const text = await res.text();
  if (res.status === 429 || res.status >= 500) {
    throw new RetryableLlmError(`LLM API ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new PermanentLlmError(`LLM API ${res.status}: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new RetryableLlmError('LLM API returned a non-JSON body');
  }
}

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  readonly label: string;
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    this.label = `anthropic:${model}`;
  }

  async analyze(jobDescription: string, resumeText: string): Promise<Analysis> {
    const data = await postJson(
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      {
        model: this.model,
        max_tokens: 1500,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(jobDescription, resumeText) }],
      },
    );
    const text = (data.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');
    return parseAnalysis(text);
  }
}

export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai';
  readonly label: string;
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    this.label = `openai:${model}`;
  }

  async analyze(jobDescription: string, resumeText: string): Promise<Analysis> {
    const data = await postJson(
      'https://api.openai.com/v1/chat/completions',
      { authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(jobDescription, resumeText) },
        ],
      },
    );
    return parseAnalysis(data.choices?.[0]?.message?.content ?? '');
  }
}

export interface LlmConfig {
  provider: 'anthropic' | 'openai' | 'heuristic';
  model: string | null;
  /** True when scoring is keyword matching, not an LLM. */
  demoMode: boolean;
  /** Set when the env is inconsistent (e.g. provider chosen but key missing). */
  error?: string;
}

/**
 * Resolve scoring config from env without throwing. Demo mode is only ever
 * chosen explicitly (LLM_PROVIDER unset or "heuristic"); asking for a real
 * provider without its key is a configuration error, never a silent fallback.
 */
export function describeLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const choice = (env.LLM_PROVIDER ?? 'heuristic').trim().toLowerCase() || 'heuristic';
  if (choice === 'heuristic') return { provider: 'heuristic', model: null, demoMode: true };
  if (choice === 'anthropic' || choice === 'openai') {
    const keyVar = choice === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    const model = env.LLM_MODEL || DEFAULT_MODELS[choice];
    if (!env[keyVar]) {
      return { provider: choice, model, demoMode: false, error: `LLM_PROVIDER=${choice} but ${keyVar} is not set` };
    }
    return { provider: choice, model, demoMode: false };
  }
  return {
    provider: 'heuristic',
    model: null,
    demoMode: true,
    error: `Unknown LLM_PROVIDER "${env.LLM_PROVIDER}". Use anthropic, openai or heuristic.`,
  };
}

/** Build the provider, or fail fast at startup on a bad configuration. */
export function createLlmProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  const cfg = describeLlmConfig(env);
  if (cfg.error) throw new Error(cfg.error);
  if (cfg.provider === 'anthropic') return new AnthropicProvider(env.ANTHROPIC_API_KEY!, cfg.model!);
  if (cfg.provider === 'openai') return new OpenAiProvider(env.OPENAI_API_KEY!, cfg.model!);
  return new HeuristicProvider();
}
