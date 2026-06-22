/** Thrown when the Ollama server can't be reached at all. */
export class OllamaUnavailableError extends Error {
  constructor(host: string) {
    super(`Ollama not reachable at ${host} — is it running? Try: ollama serve`);
    this.name = "OllamaUnavailableError";
  }
}

/** Thrown when the requested model isn't available on the server. */
export class OllamaModelError extends Error {
  constructor(model: string) {
    super(`Model "${model}" not found in Ollama. Pull it first: ollama pull ${model}`);
    this.name = "OllamaModelError";
  }
}

/** Thrown when a request exceeds the timeout (server stuck or model loading). */
export class OllamaTimeoutError extends Error {
  constructor(ms: number) {
    super(
      `Generation timed out after ${Math.round(ms / 1000)}s — the model may be loading or the server is stuck. Try again.`,
    );
    this.name = "OllamaTimeoutError";
  }
}

export interface GenerateOptions {
  temperature?: number;
  /** Sampling seed; randomize to get different output for the same prompt. */
  seed?: number;
  top_p?: number;
}

export interface GenerateParams {
  host: string;
  model: string;
  prompt: string;
  system?: string;
  options?: GenerateOptions;
  /** Abort the request after this many ms (default 120000). */
  timeoutMs?: number;
}

interface OllamaGenerateResponse {
  response?: string;
}

/** Non-streaming completion via Ollama's `/api/generate`. */
export async function generate(params: GenerateParams): Promise<string> {
  const url = `${params.host.replace(/\/+$/, "")}/api/generate`;
  const timeoutMs = params.timeoutMs ?? 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: params.model,
        prompt: params.prompt,
        system: params.system,
        stream: false,
        options: params.options,
      }),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    // Aborted by our timeout vs. connection refused / DNS / server down.
    if (controller.signal.aborted) throw new OllamaTimeoutError(timeoutMs);
    throw new OllamaUnavailableError(params.host);
  }

  try {
    if (!res.ok) {
      if (res.status === 404) throw new OllamaModelError(params.model);
      const body = await res.text().catch(() => "");
      throw new Error(`Ollama request failed (${res.status}): ${body}`.trim());
    }
    const data = (await res.json()) as OllamaGenerateResponse;
    return (data.response ?? "").trim();
  } catch (err) {
    // A timeout firing while we read the body surfaces here too.
    if (controller.signal.aborted) throw new OllamaTimeoutError(timeoutMs);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
