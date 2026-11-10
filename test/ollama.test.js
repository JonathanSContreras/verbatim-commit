import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { generate } from "../dist/lib/ollama.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Replace fetch with a stub that records the request body and replies OK. */
function captureRequest() {
  const seen = {};
  globalThis.fetch = async (url, init) => {
    seen.url = url;
    seen.body = JSON.parse(init.body);
    return new Response(JSON.stringify({ response: "  fix: a thing  " }), { status: 200 });
  };
  return seen;
}

test("generate turns thinking off so thinking models answer directly", async () => {
  const seen = captureRequest();
  const out = await generate({ host: "http://localhost:11434/", model: "m", prompt: "p" });
  assert.equal(seen.url, "http://localhost:11434/api/generate");
  assert.equal(seen.body.think, false);
  assert.equal(seen.body.stream, false);
  assert.equal(out, "fix: a thing");
});

test("generate leaves num_ctx to Ollama when no context window is given", async () => {
  const seen = captureRequest();
  await generate({ host: "h", model: "m", prompt: "p", options: { temperature: 0 } });
  assert.deepEqual(seen.body.options, { temperature: 0 });
});

test("generate sizes num_ctx to the prompt and keeps other options", async () => {
  const seen = captureRequest();
  await generate({ host: "h", model: "m", system: "s", prompt: "p", contextWindow: 32768, options: { seed: 7 } });
  assert.deepEqual(seen.body.options, { seed: 7, num_ctx: 8192 });

  // ~20k estimated tokens needs 26k with headroom, so the next size up.
  await generate({ host: "h", model: "m", prompt: "x".repeat(80_000), contextWindow: 131072 });
  assert.equal(seen.body.options.num_ctx, 32768);
});
