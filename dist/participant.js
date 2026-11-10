// Participant self-serve page: no researcher, no extension, no local data views.
// Answers + recording are sent to the research team's Google Apps Script (see apps-script/).
import { searchExperiences, barriers, formats, MAX_CHANNELS, channels, infoWantedOptions, studyStages, scenarios, postTaskItems } from "./questions.js?v=6dbd050a6e";
import { SUBMIT_URL, MINUTES } from "./participant-config.js?v=2e05481b71";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const form = $("#p-form");
const DRAFT_KEY = "pathways-participant-draft-v1";
const CHUNK_MS = 30000;          // one upload piece every 30 s
const VIDEO_BPS = 800000;        // ~6 MB per minute; readable screen text
const MAX_PICKS = 3;

const MODES = {
  survey: { label: "Survey only", text: "Answer a few questions about how you look for opportunities.", screens: ["welcome", "profile", "survey", "sending", "done"], prefix: "S" },
  observation: { label: "Search task only", text: "Search for one real opportunity while your screen is recorded, then answer two questions.", screens: ["welcome", "profile", "task", "sending", "done"], prefix: "O" },
  both: { label: "Survey + search task", text: "Do both: the short survey, then the recorded search task.", screens: ["welcome", "profile", "survey", "task", "sending", "done"], prefix: "P" }
};

let state = freshState();
let screen = "welcome";
let recorder = null;
let stream = null;
let timer = null;
let recordStartedAt = 0;
let parts = [];                  // Blobs of the current recording attempt (kept for the backup file)
const queue = [];                // pending uploads: { attempt, index, blob }
let pumping = false;
let uploadFailed = false;

function freshState() {
  return {
    sessionId: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    participantId: "",
    startedAt: new Date().toISOString(),
    mode: "",
    attempt: 0,
    partCount: 0,
    uploaded: [],                // "attempt:index" keys confirmed by the server
    recordingDone: false,
    recordingMs: 0,
    recordingBytes: 0,
    recordingSurface: ""
  };
}

// ---------------------------------------------------------------- helpers
function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 3200);
}
function formatTime(ms = 0) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function makeId(prefix) {
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = crypto.getRandomValues(new Uint32Array(4));
  return `${prefix}-${date}-${[...random].map(n => alphabet[n % alphabet.length]).join("")}`;
}
const checked = name => $$(`input[name="${name}"]:checked`).map(input => input.value);
const mode = () => MODES[state.mode];
const hasSurvey = () => state.mode === "survey" || state.mode === "both";
const hasTask = () => state.mode === "observation" || state.mode === "both";

// ---------------------------------------------------------------- rendering
function render() {
  $("#p-modes").innerHTML = Object.entries(MODES).map(([key, item]) => `<label class="p-mode"><input type="radio" name="mode" value="${key}" /><strong>${item.label}</strong><span>${item.text}</span><em class="p-min">≈ ${MINUTES[key]} min</em></label>`).join("");
  $('select[name="academicStage"]').innerHTML = `<option value="">Select one</option>${studyStages.map(stage => `<option>${escapeHtml(stage)}</option>`).join("")}`;
  const group = (name, items, type = "checkbox") => {
    $(`[data-group="${name}"]`).innerHTML = items.map(item => `<label class="choice"><input type="${type}" name="${name}" value="${escapeHtml(item)}" /><span>${escapeHtml(item)}</span></label>`).join("");
  };
  group("searchExperience", searchExperiences, "radio");
  group("barriers", barriers);
  group("formats", formats);
  group("infoWanted", infoWantedOptions);
  $("#p-channels").innerHTML = channels.map(channel => `<div class="channel-row" data-channel="${channel.name}"><label class="channel-pick"><input type="checkbox" name="channelsUsed" value="${escapeHtml(channel.label)}" /><span>${escapeHtml(channel.label)}</span></label><div class="channel-rating" hidden><span class="channel-rating-label">How helpful?</span><div class="channel-options" role="radiogroup" aria-label="How helpful: ${escapeHtml(channel.label)}">${[1, 2, 3, 4, 5].map(value => `<label class="channel-option" title="${value === 1 ? "Not helpful at all" : value === 5 ? "Very helpful" : value}"><input type="radio" name="${channel.name}" value="${value}" /><span>${value}</span></label>`).join("")}</div><span class="channel-ends"><span>Not helpful</span><span>Very helpful</span></span></div></div>`).join("");
  $("#p-scenarios").innerHTML = scenarios.map(scenario => `<label class="scenario-card"><input type="radio" name="scenarioId" value="${scenario.id}" /><span class="scenario-number">${scenario.number}</span><strong>${escapeHtml(scenario.title)}</strong><p>${escapeHtml(scenario.prompt)}</p></label>`).join("");
  $("#p-post-items").innerHTML = postTaskItems.map(item => `<div class="scale-block"><div><legend>${escapeHtml(item.label)}</legend><output data-output="${item.name}">3</output></div><input type="range" name="${item.name}" min="1" max="5" value="3" /><div class="scale-labels"><span>Strongly disagree</span><span>Strongly agree</span></div></div>`).join("");
  $$('input[type="range"]', form).forEach(addTicks);
}

function addTicks(range) {
  const ticks = document.createElement("div");
  ticks.className = "scale-ticks";
  for (let value = 1; value <= 5; value++) {
    const tick = document.createElement("button");
    tick.type = "button";
    tick.textContent = value;
    tick.setAttribute("aria-label", `Set to ${value}`);
    tick.addEventListener("click", () => { range.value = value; range.dispatchEvent(new Event("input", { bubbles: true })); });
    ticks.append(tick);
  }
  range.insertAdjacentElement("afterend", ticks);
  range.addEventListener("input", () => syncRange(range));
  syncRange(range);
}
function syncRange(range) {
  $(`[data-output="${range.name}"]`).textContent = range.value;
  range.style.setProperty("--fill", `${((range.value - 1) / 4) * 100}%`);
  $$("button", range.nextElementSibling).forEach(tick => tick.classList.toggle("on", Number(tick.textContent) === Number(range.value)));
}

// Cap "choose up to 3" groups by disabling the rest; show channel ratings only for picked channels.
function syncLimits() {
  for (const name of ["barriers", "formats", "infoWanted", "channelsUsed"]) {
    const boxes = $$(`input[name="${name}"]`);
    const full = boxes.filter(box => box.checked).length >= MAX_PICKS;
    boxes.forEach(box => {
      box.disabled = !box.checked && full;
      box.closest(".choice, .channel-row")?.classList.toggle("locked", box.disabled);
    });
  }
  const picked = checked("channelsUsed");
  channels.forEach(channel => {
    const row = $(`.channel-row[data-channel="${channel.name}"]`);
    const isPicked = picked.includes(channel.label);
    row.classList.toggle("picked", isPicked);
    $(".channel-rating", row).hidden = !isPicked;
    if (!isPicked) $$(`input[name="${channel.name}"]`, row).forEach(input => { input.checked = false; });
  });
}

// ---------------------------------------------------------------- navigation
function showScreen(name) {
  screen = name;
  $$(".p-screen").forEach(el => el.classList.toggle("active", el.dataset.screen === name));
  const steps = mode() ? mode().screens.filter(item => item !== "done") : ["welcome"];
  const position = steps.indexOf(name);
  $("#p-progress").innerHTML = steps.map((_, index) => `<li class="${index < position ? "done" : index === position ? "current" : ""}"></li>`).join("");
  if (name === "task") $("#p-after-task").hidden = !state.recordingDone;
  window.scrollTo({ top: 0, behavior: "smooth" });
  saveDraft();
}

function next() {
  if (!validate(screen)) return;
  if (screen === "welcome") {
    const chosen = form.elements.mode.value;
    if (state.mode !== chosen || !state.participantId) {
      state.mode = chosen;
      state.participantId = makeId(MODES[chosen].prefix);
    }
    $("#p-id").textContent = state.participantId;
  }
  const screens = mode().screens;
  const following = screens[screens.indexOf(screen) + 1];
  if (following === "sending") return submitAll();
  showScreen(following);
}

function back() {
  const screens = mode()?.screens || ["welcome"];
  const position = screens.indexOf(screen);
  if (position > 0) showScreen(screens[position - 1]);
}

function fail(message, element) {
  toast(message);
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("p-invalid");
    setTimeout(() => element.classList.remove("p-invalid"), 2200);
  }
  return false;
}

function validate(name) {
  if (name === "welcome") {
    if (!form.elements.mode.value) return fail("Choose what you would like to do.", $("#p-modes"));
    if (!form.elements.consent.checked) return fail("Please confirm that you agree to take part.", $(".p-check"));
  }
  if (name === "profile") {
    if (!form.elements.academicStage.value) return fail("Select your academic stage.", form.elements.academicStage);
    if (!form.elements.major.value.trim()) return fail("Enter your major or program.", form.elements.major);
  }
  if (name === "survey") {
    if (!form.elements.searchExperience.value) return fail("Answer the first question.", $('[data-group="searchExperience"]'));
    for (const [group, label] of [["barriers", "barriers"], ["formats", "formats"]]) {
      if (!checked(group).length) return fail(`Choose at least one of the ${label}.`, $(`[data-group="${group}"]`));
    }
    const picked = channels.filter(channel => checked("channelsUsed").includes(channel.label));
    if (!picked.length) return fail("Choose at least one channel you usually use.", $("#p-channels"));
    const unrated = picked.find(channel => !$(`input[name="${channel.name}"]:checked`));
    if (unrated) return fail(`Rate how helpful “${unrated.label}” has been (1–5).`, $(`.channel-row[data-channel="${unrated.name}"]`));
    if (!checked("infoWanted").length) return fail("Choose at least one kind of information.", $('[data-group="infoWanted"]'));
  }
  if (name === "task") {
    if (recorder?.state === "recording") return fail("Click “Stop recording” when you have finished searching.", $(".p-recorder"));
    if (!state.recordingDone) return fail("Record your search first: choose a card, then click “Start recording”.", $(".p-recorder"));
  }
  return true;
}

// ---------------------------------------------------------------- recording
function selectedScenario() {
  return scenarios.find(item => item.id === form.elements.scenarioId.value);
}

async function startRecording() {
  if (!selectedScenario()) return fail("First choose the kind of opportunity you want to search for.", $("#p-scenarios"));
  if (!navigator.mediaDevices?.getDisplayMedia) return toast("Screen recording needs Google Chrome or Edge on a computer.");
  // Ask for the screen picker synchronously inside the click, before anything else can take focus.
  const options = { video: { frameRate: { ideal: 10, max: 12 }, displaySurface: "monitor" }, audio: false, selfBrowserSurface: "exclude", surfaceSwitching: "include", monitorTypeSurfaces: "include" };
  let request;
  try { request = navigator.mediaDevices.getDisplayMedia(options); } catch (error) { request = Promise.reject(error); }
  $("#p-start").disabled = true;
  $("#p-record-label").textContent = "Waiting for screen selection…";
  try {
    stream = await request;
  } catch (error) {
    $("#p-start").disabled = false;
    $("#p-record-label").textContent = "Ready to record";
    if (error?.name === "NotAllowedError" && /system/i.test(error.message || "")) return toast("Your computer is blocking screen recording for the browser. On a Mac: System Settings → Privacy & Security → Screen & System Audio Recording → turn on your browser, restart it, and try again.");
    if (error?.name === "NotAllowedError") return toast("Screen sharing was cancelled. Click “Start recording” and choose Entire Screen.");
    return toast(`Could not start recording (${error?.name || "error"}). Close other pop-up tabs and try again.`);
  }
  state.attempt += 1;
  state.partCount = 0;
  state.recordingDone = false;
  parts = [];
  const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(type => MediaRecorder.isTypeSupported(type));
  recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: VIDEO_BPS } : { videoBitsPerSecond: VIDEO_BPS });
  const attempt = state.attempt;
  recorder.ondataavailable = event => {
    if (!event.data.size) return;
    const index = state.partCount++;
    parts[index] = event.data;
    enqueue({ attempt, index, blob: event.data });
  };
  recorder.onstop = finishRecording;
  const track = stream.getVideoTracks()[0];
  state.recordingSurface = track.getSettings?.().displaySurface || "unknown";
  track.onended = () => stopRecording();
  recordStartedAt = Date.now();
  recorder.start(CHUNK_MS);
  $("#p-preview").srcObject = stream;
  $("#p-preview").classList.add("visible");
  $("#p-preview-empty").style.display = "none";
  $("#p-dot").classList.add("live");
  $("#p-record-label").textContent = "Recording…";
  $("#p-stop").disabled = false;
  $("#p-open-task").hidden = false;
  $("#p-open-task").focus();
  $("#p-after-task").hidden = true;
  timer = setInterval(() => { $("#p-record-time").textContent = formatTime(Date.now() - recordStartedAt); }, 500);
  toast("Recording started — now click “Open task tab” to begin searching.");
  saveDraft();
}

function openTaskTab() {
  const scenario = selectedScenario();
  const tab = window.open(scenario?.startUrl || "https://www.google.com/", "pathways-task");
  if (!tab) toast("Your browser blocked the new tab. Allow pop-ups for this page, or open a new tab yourself and start searching.");
}

function stopRecording() {
  if (!recorder || recorder.state === "inactive") return;
  recorder.stop();
  stream?.getTracks().forEach(track => track.stop());
}

function finishRecording() {
  clearInterval(timer);
  state.recordingMs = Date.now() - recordStartedAt;
  state.recordingBytes = parts.reduce((sum, blob) => sum + (blob?.size || 0), 0);
  state.recordingDone = state.recordingBytes > 1024;
  $("#p-dot").classList.remove("live");
  $("#p-preview").classList.remove("visible");
  $("#p-preview").srcObject = null;
  $("#p-preview-empty").style.display = "";
  $("#p-open-task").hidden = true;
  $("#p-stop").disabled = true;
  $("#p-start").disabled = false;
  $("#p-start").textContent = "↺ Record again";
  $("#p-record-label").textContent = state.recordingDone ? `Recording saved (${formatTime(state.recordingMs)})` : "Recording was empty — please record again";
  $("#p-after-task").hidden = !state.recordingDone;
  if (state.recordingDone) $("#p-after-task").scrollIntoView({ behavior: "smooth", block: "start" });
  saveDraft();
}

// ---------------------------------------------------------------- uploading
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function post(payload) {
  if (!SUBMIT_URL) throw new Error("This study link is not set up yet (no upload address).");
  const response = await fetch(SUBMIT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // simple request: no CORS preflight for Apps Script
    body: JSON.stringify({ app: "pathways", sessionId: state.sessionId, participantId: state.participantId, ...payload })
  });
  const result = await response.json().catch(() => ({ ok: false, error: `Unexpected response (${response.status})` }));
  if (!result.ok) throw new Error(result.error || "Upload was not accepted.");
  return result;
}

async function postWithRetry(payload, tries = 5) {
  let lastError;
  for (let attempt = 0; attempt < tries; attempt++) {
    try { return await post(payload); } catch (error) {
      lastError = error;
      if (!SUBMIT_URL) break;
      await new Promise(resolve => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 15000)));
    }
  }
  throw lastError;
}

function enqueue(item) {
  queue.push(item);
  pump();
}

async function pump() {
  if (pumping) return;
  pumping = true;
  uploadFailed = false;
  while (queue.length) {
    const item = queue[0];
    const key = `${item.attempt}:${item.index}`;
    if (!state.uploaded.includes(key)) {
      try {
        await postWithRetry({ action: "chunk", attempt: item.attempt, index: item.index, data: await blobToBase64(item.blob) });
        state.uploaded.push(key);
        saveDraft();
      } catch (error) {
        console.warn("Upload paused:", error);
        uploadFailed = true;
        break;
      }
    }
    queue.shift();
    updateUploadStatus();
  }
  pumping = false;
  updateUploadStatus();
}

function uploadedForCurrentAttempt() {
  return state.uploaded.filter(key => key.startsWith(`${state.attempt}:`)).length;
}

function updateUploadStatus() {
  const total = state.partCount;
  const done = uploadedForCurrentAttempt();
  $("#p-upload-status").textContent = !SUBMIT_URL ? "Uploads are not set up for this link." :
    uploadFailed ? "Upload paused (connection problem) — it will retry when you finish." :
    total ? `Uploaded ${done} of ${total} recording pieces.` : "Recording uploads automatically in the background.";
}

function buildRecord() {
  const record = {
    source: "participant-link",
    mode: state.mode,
    mode_label: mode().label,
    started_at: state.startedAt,
    submitted_at: new Date().toISOString(),
    total_ms: Date.now() - new Date(state.startedAt).getTime(),
    academic_stage: form.elements.academicStage.value,
    major: form.elements.major.value.trim()
  };
  if (hasSurvey()) {
    record.searchExperience = form.elements.searchExperience.value;
    record.barriers = checked("barriers");
    record.formats = checked("formats");
    record.channelsUsed = checked("channelsUsed");
    channels.forEach(channel => { record[channel.name] = Number($(`input[name="${channel.name}"]:checked`)?.value || 0) || ""; });
    record.infoWanted = checked("infoWanted");
  }
  if (hasTask()) {
    const scenario = selectedScenario();
    record.scenario_id = scenario?.id || "";
    record.scenario_title = scenario?.title || "";
    record.found_url = form.elements.foundUrl.value.trim();
    postTaskItems.forEach(item => { record[item.name] = Number(form.elements[item.name].value); });
    record.recording_ms = state.recordingMs;
    record.recording_bytes = state.recordingBytes;
    record.recording_surface = state.recordingSurface;
    record.recording_attempt = state.attempt;
  }
  return record;
}

async function submitAll() {
  showScreen("sending");
  $("#p-send-error").hidden = true;
  $("#p-send-title").textContent = "Sending your answers…";
  $("#p-send-text").textContent = "Please keep this page open until it finishes.";
  const setBar = fraction => { $("#p-bar-fill").style.width = `${Math.round(fraction * 100)}%`; };
  // Expected wait: answers alone ≈ 1 min; with a recording ≈ 3–5 min (upload + saving in Drive).
  $("#p-eta").hidden = false;
  $("#p-eta-time").textContent = hasTask() ? "Usually takes 3–5 minutes" : "Usually takes about 1 minute";
  const sendStarted = Date.now();
  clearInterval(submitAll.elapsedTimer);
  submitAll.elapsedTimer = setInterval(() => { $("#p-eta-elapsed").textContent = formatTime(Date.now() - sendStarted).replace(/^0/, ""); }, 1000);
  const stopElapsed = () => clearInterval(submitAll.elapsedTimer);
  try {
    if (!SUBMIT_URL) throw new Error("This study link is not set up yet, so your answers cannot be sent automatically.");
    if (hasTask()) {
      // Re-queue any pieces of this attempt that have not been confirmed yet.
      for (let index = 0; index < state.partCount; index++) {
        const key = `${state.attempt}:${index}`;
        if (!state.uploaded.includes(key) && parts[index] && !queue.some(item => item.attempt === state.attempt && item.index === index)) queue.push({ attempt: state.attempt, index, blob: parts[index] });
      }
      if (state.partCount && uploadedForCurrentAttempt() < state.partCount && !parts.length) throw new Error("Part of your recording was lost when the page reloaded. Please go back and record the task again.");
      pump();
      while (pumping || queue.length) {
        setBar(state.partCount ? uploadedForCurrentAttempt() / (state.partCount + 1) : 0.5);
        $("#p-send-text").textContent = `Uploading your recording… ${uploadedForCurrentAttempt()} of ${state.partCount} pieces`;
        if (uploadFailed && !pumping) throw new Error("Your internet connection seems to be interrupted.");
        await new Promise(resolve => setTimeout(resolve, 400));
      }
      if (uploadedForCurrentAttempt() < state.partCount) throw new Error("Some recording pieces could not be uploaded.");
    }
    setBar(0.92);
    $("#p-send-text").textContent = "Saving your answers…";
    await postWithRetry({ action: "submit", attempt: hasTask() ? state.attempt : 0, partCount: hasTask() ? state.partCount : 0, record: buildRecord() }, 4);
    setBar(1);
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    $("#p-done-id").textContent = state.participantId;
    state.finished = true;
    stopElapsed();
    showScreen("done");
  } catch (error) {
    console.error(error);
    stopElapsed();
    $("#p-eta").hidden = true;
    $("#p-send-title").textContent = "We couldn't send everything yet";
    $("#p-send-text").textContent = "Nothing is lost — your answers are still on this page.";
    $("#p-send-error-text").textContent = /failed to fetch|networkerror|load failed/i.test(error.message || "")
      ? "We could not reach the study server. Check your internet connection, then click “Try again”."
      : error.message;
    $("#p-send-error").hidden = false;
  }
}

function downloadBackup() {
  const save = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const record = { ...buildRecord(), session_id: state.sessionId, participant_id: state.participantId, backup: true };
  save(new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }), `${state.participantId}-answers.json`);
  if (hasTask() && parts.length) save(new Blob(parts, { type: parts[0]?.type || "video/webm" }), `${state.participantId}-screen-recording.webm`);
  toast("Backup downloaded. Please send the file(s) to the research team.");
}

// ---------------------------------------------------------------- draft (survives an accidental reload)
function formValues() {
  const values = {};
  for (const element of form.elements) {
    if (!element.name || element.type === "button") continue;
    if (element.type === "checkbox") { if (element.checked) (values[element.name] ||= []).push(element.value); }
    else if (element.type === "radio") { if (element.checked) values[element.name] = element.value; }
    else values[element.name] = element.value;
  }
  return values;
}

function saveDraft() {
  if (state.finished) return;
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ state, screen, values: formValues() })); } catch {}
}

function restoreDraft() {
  let draft;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { draft = null; }
  if (!draft?.state?.participantId || !MODES[draft.state.mode]) return;
  state = { ...freshState(), ...draft.state };
  for (const element of form.elements) {
    if (!element.name || !(element.name in draft.values)) continue;
    const value = draft.values[element.name];
    if (element.type === "checkbox") element.checked = Array.isArray(value) ? value.includes(element.value) : Boolean(value);
    else if (element.type === "radio") element.checked = element.value === value;
    else element.value = value;
  }
  $$('input[type="range"]', form).forEach(syncRange);
  syncLimits();
  // A recording only survives a reload if every piece already reached the server.
  if (state.recordingDone && uploadedForCurrentAttempt() < state.partCount) state.recordingDone = false;
  if (state.recordingDone) $("#p-start").textContent = "↺ Record again";
  $("#p-id").textContent = state.participantId;
  const target = ["sending", "done"].includes(draft.screen) ? "welcome" : draft.screen;
  showScreen(MODES[state.mode].screens.includes(target) ? target : "welcome");
  updateUploadStatus();
  toast("Welcome back — your earlier answers were restored.");
}

// ---------------------------------------------------------------- events
function bind() {
  form.addEventListener("click", event => {
    if (event.target.closest("[data-next]")) next();
    if (event.target.closest("[data-back]")) back();
  });
  form.addEventListener("submit", event => event.preventDefault());
  form.addEventListener("change", () => { syncLimits(); saveDraft(); });
  form.addEventListener("input", () => saveDraft());
  // Tap a selected 1–5 rating again to clear it.
  $("#p-channels").addEventListener("pointerdown", event => {
    const input = event.target.closest(".channel-option")?.querySelector("input");
    if (input) input.dataset.wasChecked = String(input.checked);
  });
  $("#p-channels").addEventListener("click", event => {
    const input = event.target.closest(".channel-option input");
    if (!input || input.dataset.wasChecked !== "true") return;
    input.dataset.wasChecked = "false";
    input.checked = false;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  $("#p-start").addEventListener("click", startRecording);
  $("#p-open-task").addEventListener("click", openTaskTab);
  $("#p-stop").addEventListener("click", stopRecording);
  $("#p-retry").addEventListener("click", submitAll);
  $("#p-backup").addEventListener("click", downloadBackup);
  window.addEventListener("beforeunload", event => {
    if (recorder?.state === "recording" || (screen === "sending" && !state.finished)) { event.preventDefault(); event.returnValue = ""; }
  });
}

render();
bind();
syncLimits();
showScreen("welcome");
restoreDraft();
updateUploadStatus();
