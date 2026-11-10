import assert from "node:assert/strict";

let listener;
const sessionData = {};
globalThis.chrome = {
  storage: {
    session: {
      async get(key) { return { [key]: sessionData[key] }; },
      async set(values) { Object.assign(sessionData, values); }
    }
  },
  runtime: { onMessage: { addListener(fn) { listener = fn; } } }
};

await import("./background.js");

function send(message, sender = {}) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out: ${message.kind}`)), 1000);
    listener(message, sender, response => { clearTimeout(timeout); resolve(response); });
  });
}

const startedAt = "2026-11-10T15:00:00.000Z";
await send({ kind: "trace_start", payload: { sessionId: "test-session", scenario: { id: "research" }, startedAt } });
await send({ kind: "trace_event", event: { type: "page_enter", pageId: "page-1", url: "https://example.edu/", title: "Example", timestamp: "2026-11-10T15:00:01.000Z" } }, { tab: { id: 10 }, frameId: 0 });
await send({ kind: "trace_event", event: { type: "click", pageId: "page-1", url: "https://example.edu/", title: "Example", label: "Opportunities", timestamp: "2026-11-10T15:00:03.000Z" } }, { tab: { id: 10 }, frameId: 0 });
await send({ kind: "trace_event", event: { type: "click", pageId: "unrelated", url: "https://private.example/", title: "Ignored", label: "Ignore me", timestamp: "2026-11-10T15:00:04.000Z" } }, { tab: { id: 99 }, frameId: 0 });
const result = await send({ kind: "trace_stop", payload: { sessionId: "test-session", stoppedAt: "2026-11-10T15:00:06.000Z" } });

assert.equal(result.ok, true);
assert.equal(result.sessionId, "test-session");
assert.equal(result.events.length, 2);
assert.equal(result.events.filter(event => event.type === "click").length, 1);
assert.equal(result.pages.length, 1);
assert.equal(result.pages[0].clickCount, 1);
assert.equal(result.pages[0].activeDwellMs, 5000);
assert.equal(result.events.some(event => event.url === "https://private.example/"), false);

console.log("Trace background test passed: scoped clicks and dwell time are correct.");
