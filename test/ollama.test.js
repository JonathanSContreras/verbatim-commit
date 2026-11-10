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
