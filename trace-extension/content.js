(() => {
  // Pages allowed to start/stop a trace and receive its results. Keep this list exact:
  // any origin listed here can read the click trace of a session it starts.
  const controllerOrigins = new Set([
    "http://127.0.0.1:4318",                                   // local server (npm start)
    "http://localhost:4318",                                   // local server via localhost
    "https://xz1987.github.io",                                // GitHub Pages
    "https://pathways-research-trace.zxyyy1987.chatgpt.site"   // earlier hosted copy
  ]);
  const isController = controllerOrigins.has(location.origin);
  const pageId = crypto.randomUUID();
  const pageStartedAt = Date.now();

  function emitToPage(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function send(message, callback) {
    try {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) return;
        callback?.(response);
      });
    } catch {}
  }

  if (isController) {
    document.addEventListener("PATHWAYS_TRACE_PING", () => {
      send({ kind: "controller_ping" }, response => emitToPage("PATHWAYS_TRACE_STATUS", { connected: Boolean(response?.ok), version: chrome.runtime.getManifest().version }));
    });
    document.addEventListener("PATHWAYS_TRACE_START", event => {
      send({ kind: "trace_start", payload: event.detail }, response => emitToPage("PATHWAYS_TRACE_STARTED", response || { ok: false }));
    });
    document.addEventListener("PATHWAYS_TRACE_STOP", event => {
      send({ kind: "trace_stop", payload: event.detail }, response => emitToPage("PATHWAYS_TRACE_RESULT", response || { ok: false, sessionId: event.detail?.sessionId }));
    });
    document.addEventListener("PATHWAYS_TRACE_CANCEL", event => send({ kind: "trace_cancel", payload: event.detail }));
    emitToPage("PATHWAYS_TRACE_STATUS", { connected: true, version: chrome.runtime.getManifest().version });
    return;
  }

  function baseEvent(type) {
    return {
      kind: "trace_event",
      event: {
        type,
        pageId,
        url: location.href,
        title: document.title || "",
        timestamp: new Date().toISOString(),
        pageElapsedMs: Date.now() - pageStartedAt,
        viewport: { width: innerWidth, height: innerHeight }
      }
    };
  }

  function safeLabel(element) {
    if (!element) return "";
    const interactive = element.closest?.("a,button,input,select,textarea,[role]") || element;
    const tag = interactive.tagName?.toLowerCase();
    if (["input", "textarea", "select"].includes(tag)) {
      return (interactive.getAttribute("aria-label") || interactive.getAttribute("placeholder") || interactive.getAttribute("name") || tag).slice(0, 120);
    }
    return (interactive.getAttribute?.("aria-label") || interactive.getAttribute?.("title") || interactive.innerText || tag || "element").replace(/\s+/g, " ").trim().slice(0, 120);
  }

  function safeSelector(element) {
    if (!element?.tagName) return "";
    const target = element.closest?.("a,button,input,select,textarea,[role]") || element;
    if (target.id) return `#${CSS.escape(target.id)}`;
    const parts = [];
    let node = target;
    while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 4) {
      let part = node.tagName.toLowerCase();
      const classes = [...node.classList].filter(name => !/active|selected|hover|focus/i.test(name)).slice(0, 2);
      if (classes.length) part += `.${classes.map(name => CSS.escape(name)).join(".")}`;
      const siblings = node.parentElement ? [...node.parentElement.children].filter(child => child.tagName === node.tagName) : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(" > ").slice(0, 300);
  }

  function sendEvent(event) { send({ ...baseEvent(event.type), event: { ...baseEvent(event.type).event, ...event } }); }

  sendEvent({ type: "page_enter", referrer: document.referrer || "", navigationType: performance.getEntriesByType("navigation")[0]?.type || "navigate" });

  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    const interactive = target?.closest?.("a,button,input,select,textarea,[role]") || target;
    sendEvent({
      type: "click",
      label: safeLabel(interactive),
      role: interactive?.getAttribute?.("role") || interactive?.tagName?.toLowerCase() || "",
      selector: safeSelector(interactive),
      href: interactive?.closest?.("a")?.href || "",
      x: Math.round(event.clientX),
      y: Math.round(event.clientY),
      button: event.button
    });
  }, true);

  document.addEventListener("visibilitychange", () => sendEvent({ type: "visibility", state: document.visibilityState }));
  window.addEventListener("pagehide", () => sendEvent({ type: "page_exit" }));
})();
