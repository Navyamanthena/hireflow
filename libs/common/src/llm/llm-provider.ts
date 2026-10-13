import { Analysis, parseAnalysis } from './analysis.schema';
import { buildUserPrompt, SYSTEM_PROMPT } from './prompt';
import { HeuristicProvider } from './heuristic.provider';

export interface LlmProvider {
  readonly name: string;
  analyze(jobDescription: string, resumeText: string): Promise<Analysis>;
}

/** Error types the worker uses to decide whether a retry can help. */
export class RetryableLlmError extends Error {}
export class PermanentLlmError extends Error {}

const TIMEOUT_MS = 30_000;

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (res.status === 429 || res.status >= 500) {
    throw new RetryableLlmError(`LLM API ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new PermanentLlmError(`LLM API ${res.status}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async analyze(jobDescription: string, resumeText: string): Promise<Analysis> {
    const data = await postJson(
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      {
        model: this.model,
        max_tokens: 1024,
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
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

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

/**
 * Picks a provider from env. Falls back to the offline heuristic provider
 * when no API key is set, so the app and tests run with zero cost.
 */
export function createLlmProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  const choice = (env.LLM_PROVIDER ?? '').toLowerCase();
  if (choice === 'anthropic' && env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider(env.ANTHROPIC_API_KEY, env.LLM_MODEL || 'claude-haiku-5-5');
  }
  if (choice === 'openai' && env.OPENAI_API_KEY) {
    return new OpenAiProvider(env.OPENAI_API_KEY, env.LLM_MODEL || 'gpt-4o-mini');
  }
  return new HeuristicProvider();
}
