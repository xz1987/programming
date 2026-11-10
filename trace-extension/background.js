let state = { active: false, sessionId: null, scenario: null, startedAt: null, events: [], taskTabIds: [] };
let queue = Promise.resolve();

async function loadState() {
  const stored = await chrome.storage.session.get("pathwaysTraceState");
  if (stored.pathwaysTraceState) state = { ...state, ...stored.pathwaysTraceState, taskTabIds: stored.pathwaysTraceState.taskTabIds || [] };
}

async function saveState() {
  await chrome.storage.session.set({ pathwaysTraceState: state });
}

function enrich(event, sender) {
  const start = state.startedAt ? new Date(state.startedAt).getTime() : Date.now();
  return {
    ...event,
    tabId: sender.tab?.id ?? null,
    frameId: sender.frameId ?? 0,
    elapsedMs: Math.max(0, new Date(event.timestamp).getTime() - start)
  };
}

function summarizePages(events, stoppedAt) {
  const groups = new Map();
  for (const event of events) {
    if (!event.pageId) continue;
    if (!groups.has(event.pageId)) groups.set(event.pageId, { pageId: event.pageId, tabId: event.tabId, url: event.url, title: event.title, enteredAt: event.timestamp, exitedAt: null, activeDwellMs: 0, clickCount: 0, visibleSince: new Date(event.timestamp).getTime() });
    const page = groups.get(event.pageId);
    const time = new Date(event.timestamp).getTime();
    page.url = event.url || page.url;
    page.title = event.title || page.title;
    if (event.type === "click") page.clickCount += 1;
    if (event.type === "visibility" && event.state === "hidden" && page.visibleSince) { page.activeDwellMs += Math.max(0, time - page.visibleSince); page.visibleSince = null; }
    if (event.type === "visibility" && event.state === "visible" && !page.visibleSince) page.visibleSince = time;
    if (event.type === "page_exit") { if (page.visibleSince) page.activeDwellMs += Math.max(0, time - page.visibleSince); page.visibleSince = null; page.exitedAt = event.timestamp; }
  }
  const stop = new Date(stoppedAt).getTime();
  return [...groups.values()].map(page => {
    if (page.visibleSince) page.activeDwellMs += Math.max(0, stop - page.visibleSince);
    delete page.visibleSince;
    page.exitedAt ||= stoppedAt;
    return page;
  }).sort((a, b) => new Date(a.enteredAt) - new Date(b.enteredAt));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  queue = queue.then(async () => {
    await loadState();
    if (message.kind === "controller_ping") return sendResponse({ ok: true });
    if (message.kind === "trace_start") {
      state = { active: true, sessionId: message.payload.sessionId, scenario: message.payload.scenario, startedAt: message.payload.startedAt || new Date().toISOString(), events: [], taskTabIds: [] };
      await saveState();
      return sendResponse({ ok: true, sessionId: state.sessionId });
    }
    if (message.kind === "trace_cancel") {
      state = { active: false, sessionId: null, scenario: null, startedAt: null, events: [], taskTabIds: [] };
      await saveState();
      return sendResponse({ ok: true });
    }
    if (message.kind === "trace_event") {
      if (!state.active) return sendResponse({ ok: false, ignored: true });
      const tabId = sender.tab?.id;
      const openerTabId = sender.tab?.openerTabId;
      if (!state.taskTabIds.length && message.event.type === "page_enter" && tabId != null) state.taskTabIds.push(tabId);
      if (!state.taskTabIds.includes(tabId) && state.taskTabIds.includes(openerTabId) && message.event.type === "page_enter") state.taskTabIds.push(tabId);
      if (!state.taskTabIds.includes(tabId)) return sendResponse({ ok: false, ignored: true });
      state.events.push(enrich(message.event, sender));
      await saveState();
      return sendResponse({ ok: true });
    }
    if (message.kind === "trace_stop") {
      const stoppedAt = message.payload?.stoppedAt || new Date().toISOString();
      const result = { ok: true, sessionId: state.sessionId, scenario: state.scenario, startedAt: state.startedAt, stoppedAt, events: state.events, pages: summarizePages(state.events, stoppedAt) };
      state = { active: false, sessionId: null, scenario: null, startedAt: null, events: [], taskTabIds: [] };
      await saveState();
      return sendResponse(result);
    }
    sendResponse({ ok: false });
  }).catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});

loadState();
