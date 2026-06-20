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

export interface GenerateParams {
  host: string;
  model: string;
  prompt: string;
  system?: string;
}

interface OllamaGenerateResponse {
  response?: string;
}

/** Non-streaming completion via Ollama's `/api/generate`. */
export async function generate(params: GenerateParams): Promise<string> {
  const url = `${params.host.replace(/\/+$/, "")}/api/generate`;

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
      }),
    });
  } catch {
    // Connection refused / DNS / network — the server isn't up.
    throw new OllamaUnavailableError(params.host);
  }

  if (!res.ok) {
    if (res.status === 404) throw new OllamaModelError(params.model);
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama request failed (${res.status}): ${body}`.trim());
  }

  const data = (await res.json()) as OllamaGenerateResponse;
  return (data.response ?? "").trim();
}
