import { searchExperiences, barriers, formats, MAX_CHANNELS, channels, infoWantedOptions, scenarios } from "./questions.js";

const pickedChannels = () => channels.filter(channel => $(`input[name="channelsUsed"][value="${channel.label}"]`)?.checked);

// Show the 1–5 rating only for picked channels; cap picks at 3 by disabling the rest.
function syncChannelRows() {
  const picked = pickedChannels();
  channels.forEach(channel => {
    const row = $(`.channel-row[data-channel="${channel.name}"]`);
    if (!row) return;
    const isPicked = picked.includes(channel);
    row.classList.toggle("picked", isPicked);
    $(".channel-rating", row).hidden = !isPicked;
    if (!isPicked) $$(`input[name="${channel.name}"]`, row).forEach(input => { input.checked = false; });
    const pick = $('input[name="channelsUsed"]', row);
    pick.disabled = !isPicked && picked.length >= MAX_CHANNELS;
    row.classList.toggle("locked", pick.disabled);
  });
}
const RESEARCHERS = ["Cora", "Jerry", "Hayden", "Ivie"];
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const form = $("#study-form");
let currentStep = 0;
let currentSession = null;
let mediaRecorder = null;
let recordingStream = null;
let recordingChunks = [];
let timerHandle = null;
let observationStart = null;
let extensionConnected = false;
let taskWindow = null;
let stopping = false;
let autosaveTimer = null;
let traceCaptureActive = false;
let traceFallbackTimer = null;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
}

function renderChoices() {
  const checkboxGroup = (selector, items, name) => {
    $(selector).innerHTML = items.map((item, index) => `<label class="choice"><input type="checkbox" name="${name}" value="${escapeHtml(item)}" id="${name}-${index}" /><span>${escapeHtml(item)}</span></label>`).join("");
  };
  const radioGroup = (selector, items, name) => {
    $(selector).innerHTML = items.map((item, index) => `<label class="choice"><input type="radio" name="${name}" value="${escapeHtml(item)}" id="${name}-${index}" ${index === 0 ? "required" : ""} /><span>${escapeHtml(item)}</span></label>`).join("");
  };
  radioGroup('[data-name="searchExperience"]', searchExperiences, "searchExperience");
  checkboxGroup('[data-name="barriers"]', barriers, "barriers");
  checkboxGroup('[data-name="formats"]', formats, "formats");
  checkboxGroup('[data-name="infoWanted"]', infoWantedOptions, "infoWanted");
  $('[data-name="channels"]').innerHTML = channels.map(channel => `<div class="channel-row" data-channel="${channel.name}"><label class="channel-pick"><input type="checkbox" name="channelsUsed" value="${escapeHtml(channel.label)}" /><span>${escapeHtml(channel.label)}</span></label><div class="channel-rating" hidden><span class="channel-rating-label">How helpful?</span><div class="channel-options" role="radiogroup" aria-label="How helpful: ${escapeHtml(channel.label)}">${[1, 2, 3, 4, 5].map(value => `<label class="channel-option" title="${value === 1 ? "Not helpful at all" : value === 5 ? "Very helpful" : value}"><input type="radio" name="${channel.name}" value="${value}" /><span>${value}</span></label>`).join("")}</div><span class="channel-ends"><span>Not helpful</span><span>Very helpful</span></span></div></div>`).join("");
  $("#scenario-grid").innerHTML = scenarios.map((scenario, index) => `<label class="scenario-card"><input type="radio" name="scenarioId" value="${scenario.id}" ${index === 0 ? "checked" : ""} /><span class="scenario-number">${scenario.number}</span><strong>${scenario.title}</strong><p>${scenario.prompt}</p></label>`).join("");
}

function renderModuleSetup() {
  const step = $('.form-step[data-form-step="0"]');
  step.innerHTML = `
    <article class="panel form-panel">
      <span class="eyebrow dark">STUDY SETUP</span><h2>Choose the research modules</h2>
      <p>Run either module independently, or connect both modules in one study session.</p>
      <div class="module-grid">
        <label class="module-card"><input type="radio" name="studyMode" value="survey" required /><span>01</span><strong>Survey only</strong><small>Baseline questions and preferences</small></label>
        <label class="module-card"><input type="radio" name="studyMode" value="observation" /><span>02</span><strong>Observation only</strong><small>Screen recording, click trace, and post-task scales</small></label>
        <label class="module-card"><input type="radio" name="studyMode" value="both" checked /><span>03</span><strong>Survey + observation</strong><small>Run both modules as one linked session</small></label>
      </div>
      <div id="participant-arrangement" class="arrangement-row">
        <span>Who completes the two modules?</span>
        <label><input type="radio" name="participantArrangement" value="same" checked /> Same participant</label>
        <label><input type="radio" name="participantArrangement" value="different" /> Two different participants</label>
      </div>
      <label class="researcher-field"><span>Researcher</span><select name="researcher"><option value="">Select researcher</option>${RESEARCHERS.map(name => `<option>${name}</option>`).join("")}</select></label>
    </article>
    <div class="profile-grid">
      <article id="survey-profile" class="panel participant-profile survey-profile">
        <span class="module-kicker">SURVEY PARTICIPANT</span><h3>Survey profile</h3>
        <label><span>Anonymous participant ID *</span><input name="surveyParticipantId" data-required readonly aria-label="Survey anonymous participant ID" /></label>
        <label><span>Academic stage *</span><select name="surveyStudyStage" data-required><option value="">Select one</option><option>Undergraduate — First year</option><option>Undergraduate — Second year</option><option>Undergraduate — Third year</option><option>Undergraduate — Fourth year</option><option>Master’s — First year</option><option>Master’s — Second year</option><option>PhD</option><option>Other</option></select></label>
        <label><span>Major / program *</span><input name="surveyMajor" data-required value="DEA" /></label>
      </article>
      <article id="observation-profile" class="panel participant-profile observation-profile">
        <span class="module-kicker">OBSERVATION PARTICIPANT</span><h3>Observation profile</h3>
        <label><span>Anonymous participant ID *</span><input name="observationParticipantId" data-required readonly aria-label="Observation anonymous participant ID" /></label>
        <label><span>Academic stage *</span><select name="observationStudyStage" data-required><option value="">Select one</option><option>Undergraduate — First year</option><option>Undergraduate — Second year</option><option>Undergraduate — Third year</option><option>Undergraduate — Fourth year</option><option>Master’s — First year</option><option>Master’s — Second year</option><option>PhD</option><option>Other</option></select></label>
        <label><span>Major / program *</span><input name="observationMajor" data-required value="DEA" /></label>
      </article>
      <article id="linked-profile-note" class="panel linked-profile-note"><span>↗</span><div><strong>Observation will use the survey participant</strong><p>The same anonymous ID and profile will link both modules.</p></div></article>
    </div>
    <div class="id-tools"><span>IDs are generated locally and contain no personal information.</span><button type="button" id="regenerate-ids" class="button secondary">↻ Regenerate IDs</button></div>
    <div class="privacy-note setup-privacy"><b>Never captured</b><span>Typed text, passwords, unrelated tabs, unshared windows, camera, microphone, or system audio.</span></div>`;
  const stepNames = ["Setup", "Survey", "Observation", "Post-task"];
  $$(".step span").forEach((label, index) => label.textContent = stepNames[index]);
}

function selectedMode() {
  return form.elements.studyMode?.value || currentSession?.responses?.studyMode || "both";
}

function makeParticipantId(prefix) {
  const now = new Date();
  const date = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const code = [...bytes].map(value => alphabet[value % alphabet.length]).join("");
  return `${prefix}-${date}-${code}`;
}

function ensureParticipantIds(force = false) {
  const mode = selectedMode();
  const arrangement = form.elements.participantArrangement?.value || "same";
  const surveyField = form.elements.surveyParticipantId;
  const observationField = form.elements.observationParticipantId;
  const autoPattern = /^[PSO]-\d{6}-[A-Z2-9]{4}$/;
  const setForPrefix = (field, prefix) => {
    if (!field) return;
    const isAuto = autoPattern.test(field.value);
    if (force || !field.value || (isAuto && !field.value.startsWith(`${prefix}-`))) field.value = makeParticipantId(prefix);
  };
  if (mode === "survey") setForPrefix(surveyField, "S");
  if (mode === "observation") setForPrefix(observationField, "O");
  if (mode === "both" && arrangement === "same") {
    setForPrefix(surveyField, "P");
    observationField.value = surveyField.value;
  }
  if (mode === "both" && arrangement === "different") {
    setForPrefix(surveyField, "S");
    setForPrefix(observationField, "O");
  }
}

function includedSteps() {
  const mode = selectedMode();
  if (mode === "survey") return [0, 1];
  if (mode === "observation") return [0, 2, 3];
  return [0, 1, 2, 3];
}

function toggleSection(section, enabled) {
  if (!section) return;
  section.hidden = !enabled;
  $$('input,select,textarea', section).forEach(field => {
    field.disabled = !enabled;
    if (field.matches('[data-required]')) field.required = enabled;
  });
}

function updateStudyMode() {
  syncChannelRows();
  const mode = selectedMode();
  const arrangement = form.elements.participantArrangement?.value || "same";
  const hasSurvey = mode === "survey" || mode === "both";
  const hasObservation = mode === "observation" || mode === "both";
  const different = mode === "both" && arrangement === "different";
  $("#participant-arrangement").hidden = mode !== "both";
  toggleSection($("#survey-profile"), hasSurvey);
  toggleSection($("#observation-profile"), mode === "observation" || different);
  $("#linked-profile-note").hidden = !(mode === "both" && !different);
  toggleSection($('.form-step[data-form-step="1"]'), hasSurvey);
  toggleSection($('.form-step[data-form-step="2"]'), hasObservation);
  toggleSection($('.form-step[data-form-step="3"]'), hasObservation);
  ensureParticipantIds();
  updateStepUi();
}

function updateStepUi() {
  const steps = includedSteps();
  $$(".step").forEach((el, index) => el.classList.toggle("skipped", !steps.includes(index)));
  const position = steps.indexOf(currentStep);
  $("#prev-step").disabled = position <= 0;
  const last = position === steps.length - 1;
  $("#next-step").style.visibility = currentStep === 3 ? "hidden" : "visible";
  if (currentStep === 1 && selectedMode() === "both") {
    $("#next-step").textContent = "Save survey & continue →";
  } else {
    $("#next-step").textContent = last ? (selectedMode() === "survey" ? "Save survey" : "Save session") : "Next →";
  }
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 2800);
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("pathways-research-kit", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id" });
      if (!db.objectStoreNames.contains("recordings")) db.createObjectStore("recordings", { keyPath: "sessionId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbRequest(storeName, mode, operation) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = operation(tx.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}
const getSessions = () => dbRequest("sessions", "readonly", store => store.getAll());
const getSession = id => dbRequest("sessions", "readonly", store => store.get(id));
const putSession = session => dbRequest("sessions", "readwrite", store => store.put(session));
const deleteSessionRecord = id => dbRequest("sessions", "readwrite", store => store.delete(id));
const putRecording = (sessionId, blob) => dbRequest("recordings", "readwrite", store => store.put({ sessionId, blob, size: blob.size, type: blob.type }));
const getRecording = id => dbRequest("recordings", "readonly", store => store.get(id));
const deleteRecording = id => dbRequest("recordings", "readwrite", store => store.delete(id));

function routeTo(route) {
  // Opening the setup view always needs a session behind it (sidebar "New session" included).
  if (route === "setup" && !currentSession) return newSession();
  $$(".view").forEach(view => view.classList.toggle("active", view.id === route));
  $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.route === route));
  const titles = { dashboard: "Study overview", setup: "New research session", sessions: "Local data", guide: "Study guide" };
  $("#page-title").textContent = titles[route] || "Pathways";
  history.replaceState(null, "", `#${route}`);
  if (route === "dashboard") refreshDashboard();
  if (route === "sessions") renderSessions();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function newSession() {
  if (mediaRecorder?.state === "recording") return toast("Stop the current recording before starting a new session.");
  form.reset();
  if (form.elements.surveyMajor) form.elements.surveyMajor.value = "DEA";
  if (form.elements.observationMajor) form.elements.observationMajor.value = "DEA";
  $$('input[type="range"]', form).forEach(range => range.dispatchEvent(new Event("input")));
  observationStart = null;
  resetTraceUi();
  updateStudyMode();
  createSessionRecord();
  showStep(0);
  routeTo("setup");
}

// Creates the draft record immediately so it shows in Local data and can be resumed.
function createSessionRecord() {
  const now = new Date().toISOString();
  currentSession = {
    id: `session-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    currentStep: 0,
    traceEvents: [],
    tracePages: [],
    traceComplete: false,
    hasRecording: false,
    recordingDurationMs: 0,
    responses: collectValues()
  };
  $("#autosave-status").textContent = "Creating session…";
  return putSession(currentSession)
    .then(() => { $("#autosave-status").textContent = "Draft saved — resume anytime from Local data"; })
    .catch(error => { console.error(error); toast("Could not save the session locally."); });
}

function showStep(step) {
  const steps = includedSteps();
  currentStep = steps.includes(step) ? step : steps[0];
  $$(".form-step").forEach(el => el.classList.toggle("active", Number(el.dataset.formStep) === currentStep));
  $$(".step").forEach((el, i) => { el.classList.toggle("active", i === currentStep); el.classList.toggle("done", i < currentStep); });
  updateStepUi();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function validateStep() {
  const section = $(`.form-step[data-form-step="${currentStep}"]`);
  const invalid = $$('[required]', section).find(field => !field.checkValidity());
  if (invalid) { invalid.reportValidity(); toast("Please complete the required items."); return false; }
  if (currentStep === 1 && selectedMode() !== "observation") {
    const picked = pickedChannels();
    const unrated = picked.find(channel => !$(`input[name="${channel.name}"]:checked`));
    if (!picked.length || unrated) {
      $(".channel-question")?.scrollIntoView({ behavior: "smooth", block: "center" });
      toast(!picked.length ? "Choose at least one channel you usually use." : `Rate how helpful “${unrated.label}” has been (1–5).`);
      return false;
    }
    for (const name of ["barriers", "formats"]) {
      const count = $$(`input[name="${name}"]:checked`).length;
      if (!count || count > 3) { toast(`Select 1–3 ${name}.`); return false; }
    }
  }
  if (currentStep === 2) {
    if (mediaRecorder?.state === "recording") { toast("Stop and archive the recording first."); return false; }
    if (!currentSession?.hasRecording || !currentSession?.traceComplete) { toast("Complete and archive the behavior task before continuing."); return false; }
  }
  return true;
}

function collectValues() {
  const data = Object.fromEntries(new FormData(form).entries());
  const mode = data.studyMode || selectedMode();
  const hasSurvey = mode === "survey" || mode === "both";
  const hasObservation = mode === "observation" || mode === "both";
  if (hasSurvey) ["barriers", "formats", "infoWanted"].forEach(name => data[name] = $$(`input[name="${name}"]:checked`).map(input => input.value));
  if (hasSurvey) {
    data.channelsUsed = $$('input[name="channelsUsed"]:checked').map(input => input.value);
    channels.forEach(({ name, label }) => data[name] = data.channelsUsed.includes(label) && data[name] ? Number(data[name]) : "");
  }
  if (hasObservation) ["resultSatisfaction", "decisionInfo"].forEach(name => data[name] = Number(data[name] || 0));
  if (mode === "both" && (data.participantArrangement || "same") === "same") {
    data.observationParticipantId = data.surveyParticipantId;
    data.observationStudyStage = data.surveyStudyStage;
    data.observationMajor = data.surveyMajor;
  }
  if (hasObservation) {
    const scenario = scenarios.find(item => item.id === data.scenarioId);
    data.scenarioTitle = scenario?.title || "";
    data.scenarioPrompt = scenario?.prompt || "";
  }
  return data;
}

function surveyIsComplete() {
  const mode = selectedMode();
  if (mode === "observation") return false;
  const response = collectValues();
  const profileComplete = Boolean(response.surveyParticipantId && response.surveyStudyStage && response.surveyMajor);
  const questionsComplete = Boolean(response.searchExperience && response.channelsUsed?.length >= 1 && response.channelsUsed.length <= MAX_CHANNELS && channels.every(({ name, label }) => !response.channelsUsed.includes(label) || response[name]) && response.barriers?.length >= 1 && response.barriers.length <= 3 && response.formats?.length >= 1 && response.formats.length <= 3);
  return profileComplete && questionsComplete;
}

function updateModuleProgress() {
  if (!currentSession) return;
  currentSession.moduleStatus ||= {};
  const surveyComplete = surveyIsComplete();
  if (surveyComplete) {
    if (currentSession.moduleStatus.survey !== "complete") currentSession.surveyCompletedAt = new Date().toISOString();
    currentSession.moduleStatus.survey = "complete";
    if (selectedMode() === "survey") {
      currentSession.status = "complete";
      currentSession.completedModules = ["survey"];
      currentSession.completedAt ||= currentSession.surveyCompletedAt;
    }
  } else if (selectedMode() !== "observation") {
    currentSession.moduleStatus.survey = "in_progress";
    if (selectedMode() === "survey") currentSession.status = "draft";
  }
}

function queueAutosave(delay = 300) {
  if (!currentSession) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => autosave().catch(error => console.error(error)), delay);
}

async function autosave() {
  if (!currentSession) return;
  currentSession.responses = collectValues();
  currentSession.currentStep = currentStep;
  updateModuleProgress();
  currentSession.updatedAt = new Date().toISOString();
  await putSession(currentSession);
  const surveyArchived = currentSession.moduleStatus?.survey === "complete";
  $("#autosave-status").textContent = `${surveyArchived ? "Survey archived" : "Saved locally"} at ${new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}`;
}

async function nextStep() {
  if (!validateStep()) return;
  if (!currentSession) await createSessionRecord(); // safety net: never lose answers to a missing session
  await autosave();
  if (currentStep === 1 && selectedMode() !== "observation") {
    currentSession.moduleStatus ||= {};
    currentSession.moduleStatus.survey = "complete";
    currentSession.surveyCompletedAt ||= new Date().toISOString();
    currentSession.responses = collectValues();
    currentSession.updatedAt = new Date().toISOString();
    await putSession(currentSession);
    $("#autosave-status").textContent = `Survey archived at ${new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}`;
    toast(selectedMode() === "survey" ? "Survey saved locally." : "Survey saved locally. Continuing to observation.");
  }
  const steps = includedSteps();
  const position = steps.indexOf(currentStep);
  if (position === steps.length - 1) return completeSession();
  showStep(steps[position + 1]);
  currentSession.currentStep = currentStep;
  await putSession(currentSession);
}

function formatTime(ms = 0) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
const elapsed = () => observationStart ? Date.now() - observationStart : 0;

function pingExtension() {
  document.dispatchEvent(new CustomEvent("PATHWAYS_TRACE_PING"));
}

function setExtensionStatus(connected) {
  extensionConnected = connected;
  $("#extension-badge").textContent = connected ? "Trace extension connected" : "Extension not detected";
  $("#extension-badge").classList.toggle("complete", connected);
  $("#metric-extension").textContent = connected ? "ON" : "OFF";
  $("#metric-extension-label").textContent = connected ? "Automatic clicks enabled" : "Video still records; clicks optional";
  $("#extension-badge").title = connected ? "" : `Not detected on ${location.host}. Install the latest extension (Study guide → Download), or click reload on it in chrome://extensions, then refresh this page.`;
  const hint = $("#extension-hint");
  if (hint) hint.hidden = connected;
}

function dispatchTraceCommand(name, detail) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

function startTraceBridge(detail) {
  return new Promise(resolve => {
    let settled = false;
    const done = result => { if (settled) return; settled = true; clearTimeout(timer); document.removeEventListener("PATHWAYS_TRACE_STARTED", handler); resolve(result); };
    const handler = event => done(Boolean(event.detail?.ok));
    const timer = setTimeout(() => done(false), 2000);
    document.addEventListener("PATHWAYS_TRACE_STARTED", handler);
    try { dispatchTraceCommand("PATHWAYS_TRACE_START", detail); } catch { done(false); }
  });
}

// Optional click/dwell trace. Never throws and never blocks or cancels the video:
// a missing, outdated, or unresponsive extension just yields a video-only session.
async function tryStartOptionalTrace(detail) {
  try {
    // Attempt the handshake even if the status ping was missed (late-loading or older extension).
    const ok = await startTraceBridge(detail);
    if (ok) return { active: true, reason: null };
    return { active: false, reason: extensionConnected ? "Extension did not acknowledge the session" : "Extension not installed or not responding" };
  } catch (error) {
    console.warn("Trace extension failed; continuing with video only.", error);
    return { active: false, reason: `Extension error: ${error?.message || error}` };
  }
}

async function startRecording() {
  const scenarioId = form.elements.scenarioId.value;
  const scenario = scenarios.find(item => item.id === scenarioId);
  if (!scenario) return toast("Choose a scenario first.");
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return toast(`Screen recording is unavailable at ${location.origin}. Open the app in Google Chrome over https:// (GitHub Pages) or at http://127.0.0.1:4318 (local server).`);
  }
  // Chrome only shows the screen picker for a direct click on a page that stays in front.
  // Opening the task tab now would steal focus (InvalidStateError), so ask for the picker
  // synchronously inside this click and open the task tab only after sharing has started.
  const displayOptions = { video: { frameRate: { ideal: 15, max: 20 }, displaySurface: "monitor" }, audio: false, selfBrowserSurface: "exclude", surfaceSwitching: "include", monitorTypeSurfaces: "include" };
  let displayRequest;
  try { displayRequest = navigator.mediaDevices.getDisplayMedia(displayOptions); } catch (error) { displayRequest = Promise.reject(error); }
  taskWindow = null;
  hideOpenTaskButton();
  $("#start-recording").disabled = true;
  $("#stop-recording").disabled = true;
  $("#record-label").textContent = "Waiting for screen selection…";
  try {
    stopping = false;
    recordingStream = await displayRequest;
    const preferred = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(type => MediaRecorder.isTypeSupported(type));
    mediaRecorder = new MediaRecorder(recordingStream, preferred ? { mimeType: preferred, videoBitsPerSecond: 1800000 } : undefined);
    recordingChunks = [];
    observationStart = Date.now();
    currentSession.traceEvents = [];
    currentSession.tracePages = [];
    currentSession.traceComplete = false;
    currentSession.hasRecording = false;
    currentSession.responses = collectValues();
    const videoTrack = recordingStream.getVideoTracks()[0];
    currentSession.recordingSurface = videoTrack.getSettings?.().displaySurface || "unknown";
    currentSession.recordingTrackLabel = videoTrack.label || "shared display";
    mediaRecorder.ondataavailable = event => { if (event.data.size) recordingChunks.push(event.data); };
    mediaRecorder.onstop = finalizeRecording;
    mediaRecorder.onerror = event => { currentSession.recordingError = event.error?.message || "MediaRecorder error"; stopRecording("recorder-error"); };
    videoTrack.onended = () => stopRecording("share-ended");
    traceCaptureActive = false;
    delete currentSession.traceUnavailableReason;
    mediaRecorder.start(1000);
    $("#screen-preview").srcObject = recordingStream;
    $("#screen-preview").classList.add("visible");
    $("#preview-empty").style.display = "none";
    $("#record-dot").classList.add("live");
    const surfaceLabel = currentSession.recordingSurface === "monitor" ? "entire screen" : "shared tab/window";
    $("#record-label").textContent = `Recording ${surfaceLabel}…`;
    $("#start-recording").disabled = true;
    $("#stop-recording").disabled = false;
    timerHandle = setInterval(() => { $("#record-time").textContent = formatTime(elapsed()); $("#trace-dwell").textContent = formatTime(elapsed()); }, 250);
  } catch (error) {
    taskWindow?.close();
    if (recordingStream) recordingStream.getTracks().forEach(track => { track.onended = null; track.stop(); });
    dispatchTraceCommand("PATHWAYS_TRACE_CANCEL", { sessionId: currentSession.id });
    traceCaptureActive = false;
    $("#start-recording").disabled = false;
    $("#stop-recording").disabled = true;
    $("#record-label").textContent = "Ready to record";
    if (error.name !== "NotAllowedError") console.error(error);
    toast(recordingErrorMessage(error));
    return;
  }

  // Video is already recording. The trace must start before the task tab navigates
  // (the extension registers the first page_enter as the task tab), but its outcome
  // only decides whether clicks are logged — it can never stop the recording.
  const sessionAtStart = currentSession;
  const trace = await tryStartOptionalTrace({ sessionId: sessionAtStart.id, scenario, startedAt: new Date().toISOString() });
  if (stopping || currentSession !== sessionAtStart) {
    // Recording ended (e.g. share stopped) during the handshake; release the extension.
    if (trace.active) dispatchTraceCommand("PATHWAYS_TRACE_CANCEL", { sessionId: sessionAtStart.id });
    return;
  }
  traceCaptureActive = trace.active;
  currentSession.traceMode = trace.active ? "extension" : "screen-recording-only";
  if (!trace.active) currentSession.traceUnavailableReason = trace.reason;
  const surfaceLabel = currentSession.recordingSurface === "monitor" ? "entire screen" : "shared tab/window";
  $("#record-label").textContent = `Recording ${surfaceLabel}${trace.active ? " + click trace" : " (video only)"}`;
  if (!trace.active) toast("Recording video only — click trace extension not responding.");
  let opened = false;
  try {
    if (taskWindow && !taskWindow.closed) { taskWindow.location.href = scenario.startUrl; opened = true; }
  } catch (error) {
    console.warn("Could not navigate the task tab; recording continues.", error);
  }
  // Pop-up blocked (or tab closed): recording keeps going; one more click opens the task.
  if (!opened) showOpenTaskButton(scenario.startUrl);
}

function recordingErrorMessage(error) {
  const detail = `${error?.name || "Error"}${error?.message ? `: ${error.message}` : ""}`;
  if (error?.name === "NotAllowedError" && /system/i.test(error.message || "")) {
    return "macOS is blocking screen recording for Chrome. Open System Settings → Privacy & Security → Screen & System Audio Recording, turn on Google Chrome, restart Chrome, and try again.";
  }
  if (error?.name === "NotAllowedError") return "Screen sharing was cancelled. Choose a screen or window to begin.";
  if (error?.name === "InvalidStateError") return "Chrome blocked the screen picker. Keep this tab in front (close other pop-up tabs) and click “Start recording” again.";
  if (error?.name === "NotReadableError") return "Chrome could not capture that screen. Close other screen-sharing apps or pick a different screen/window, then try again.";
  return `Could not start screen recording (${detail}).`;
}

function showOpenTaskButton(url) {
  let button = $("#open-task");
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.id = "open-task";
    button.className = "button primary pulse";
    button.textContent = "↗ Open task tab";
    $("#stop-recording").insertAdjacentElement("beforebegin", button);
  }
  button.hidden = false;
  button.onclick = () => {
    taskWindow = window.open(url, "pathways-opportunity-task");
    if (taskWindow) hideOpenTaskButton();
    else toast("Chrome blocked the task tab. Allow pop-ups for this site, or open the link manually.");
  };
  button.focus();
  toast("Recording started — now click “Open task tab” to begin searching.");
}

function hideOpenTaskButton() {
  const button = $("#open-task");
  if (button) button.hidden = true;
}

function stopRecording(reason = "manual") {
  if (stopping) return;
  stopping = true;
  hideOpenTaskButton();
  currentSession.recordingStopReason = typeof reason === "string" ? reason : "manual";
  clearInterval(timerHandle);
  timerHandle = null;
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  if (recordingStream) recordingStream.getTracks().forEach(track => track.stop());
  if (traceCaptureActive) {
    dispatchTraceCommand("PATHWAYS_TRACE_STOP", { sessionId: currentSession?.id, stoppedAt: new Date().toISOString() });
    clearTimeout(traceFallbackTimer);
    traceFallbackTimer = setTimeout(() => {
      if (!currentSession?.traceComplete) {
        currentSession.traceComplete = true;
        currentSession.traceUnavailableReason ||= "Extension did not return a completed trace";
        renderTraceSummary(currentSession);
        autosave().then(updateArchiveState).catch(() => {});
      }
    }, 2000);
  } else {
    currentSession.traceComplete = true;
    currentSession.traceEvents ||= [];
    currentSession.tracePages ||= [];
    renderTraceSummary(currentSession);
  }
  $("#record-dot").classList.remove("live");
  $("#record-label").textContent = "Archiving recording and trace…";
  $("#start-recording").disabled = true;
  $("#stop-recording").disabled = true;
}

async function finalizeRecording() {
  const blob = new Blob(recordingChunks, { type: mediaRecorder?.mimeType || "video/webm" });
  currentSession.recordingDurationMs = elapsed();
  currentSession.recordingBytes = blob.size;
  currentSession.recordingMimeType = blob.type;
  currentSession.hasRecording = blob.size > 1024 && currentSession.recordingDurationMs > 250;
  if (currentSession.hasRecording) await putRecording(currentSession.id, blob);
  await autosave();
  if (currentSession.hasRecording) {
    updateArchiveState();
    toast(`Raw recording archived locally (${(blob.size / 1024 / 1024).toFixed(1)} MB)${traceCaptureActive ? " with click trace" : " as video-only evidence"}.`);
  } else {
    $("#record-label").textContent = "Recording failed — please try again";
    $("#start-recording").disabled = false;
    toast("No usable video was created. Start the recording again and choose Entire Screen.");
  }
  traceCaptureActive = false;
}

function handleTraceResult(detail) {
  if (!detail || detail.sessionId !== currentSession?.id) return;
  currentSession.traceEvents = detail.events || [];
  currentSession.tracePages = detail.pages || [];
  currentSession.traceComplete = true;
  clearTimeout(traceFallbackTimer);
  currentSession.traceStartedAt = detail.startedAt;
  currentSession.traceStoppedAt = detail.stoppedAt;
  renderTraceSummary(currentSession);
  autosave();
  updateArchiveState();
}

function updateArchiveState() {
  if (currentSession?.hasRecording && currentSession?.traceComplete) {
    $("#record-label").textContent = "Recording and trace archived";
    $("#start-recording").disabled = false;
  }
}

function resetTraceUi() {
  $("#record-time").textContent = "00:00";
  $("#trace-count").textContent = "0";
  $("#trace-clicks").textContent = "0";
  $("#trace-pages").textContent = "0";
  $("#trace-dwell").textContent = "00:00";
  $("#trace-log").innerHTML = '<p class="empty-small">Trace events will appear after the task is archived.</p>';
  $("#record-label").textContent = "Ready to record";
  $("#record-dot").classList.remove("live");
  $("#start-recording").disabled = false;
  $("#stop-recording").disabled = true;
  $("#screen-preview").classList.remove("visible");
  $("#preview-empty").style.display = "grid";
}

function traceStats(session) {
  const events = session?.traceEvents || session?.events || [];
  const pages = session?.tracePages || [];
  const clicks = events.filter(event => event.type === "click").length;
  const dwell = pages.reduce((sum, page) => sum + (page.activeDwellMs || 0), 0) || session?.recordingDurationMs || 0;
  return { events, pages, clicks, dwell };
}

function renderTraceSummary(session) {
  const { events, pages, clicks, dwell } = traceStats(session);
  $("#trace-count").textContent = events.length;
  $("#trace-clicks").textContent = clicks;
  $("#trace-pages").textContent = pages.length;
  $("#trace-dwell").textContent = formatTime(dwell);
  const meaningful = events.filter(event => ["click", "page_enter", "page_exit"].includes(event.type)).slice(-10).reverse();
  $("#trace-log").innerHTML = meaningful.length ? meaningful.map(event => `<div class="event-item"><time>${formatTime(event.elapsedMs)}</time><span><b>${event.type === "click" ? "Click" : event.type === "page_enter" ? "Page" : "Exit"}</b> · ${escapeHtml(event.label || event.title || shortUrl(event.url))}</span></div>`).join("") : '<p class="empty-small">No trace events were returned.</p>';
}

function shortUrl(url = "") {
  try { const parsed = new URL(url); return `${parsed.hostname}${parsed.pathname}`.slice(0, 80); } catch { return String(url).slice(0, 80); }
}

async function finishSession(event) {
  event.preventDefault();
  return completeSession();
}

async function completeSession() {
  if (!validateStep()) return;
  if (!currentSession) await createSessionRecord();
  currentSession.responses = collectValues();
  currentSession.status = "complete";
  currentSession.completedModules = selectedMode() === "both" ? ["survey", "observation"] : [selectedMode()];
  currentSession.moduleStatus ||= {};
  if (selectedMode() !== "observation") currentSession.moduleStatus.survey = "complete";
  if (selectedMode() !== "survey") {
    currentSession.moduleStatus.observation = "complete";
    currentSession.observationCompletedAt = new Date().toISOString();
  }
  currentSession.completedAt = new Date().toISOString();
  currentSession.updatedAt = currentSession.completedAt;
  await putSession(currentSession);
  toast(selectedMode() === "survey" ? "Survey saved locally." : selectedMode() === "observation" ? "Observation saved locally." : "Linked survey and observation saved locally.");
  routeTo("sessions");
}

async function resumeSession(id) {
  if (mediaRecorder?.state === "recording") return toast("Stop the current recording before switching sessions.");
  const session = await getSession(id);
  if (!session) return toast("This local session could not be found.");
  form.reset();
  currentSession = session;
  const responses = { ...(session.responses || {}) };
  if (!responses.studyMode) {
    responses.studyMode = session.traceComplete || session.hasRecording ? "both" : "survey";
    responses.participantArrangement = "same";
    responses.surveyParticipantId = responses.participantId || "";
    responses.surveyStudyStage = responses.studyStage || "";
    responses.surveyMajor = responses.major || "DEA";
    responses.observationParticipantId = responses.participantId || "";
    responses.observationStudyStage = responses.studyStage || "";
    responses.observationMajor = responses.major || "DEA";
  }
  Object.entries(responses).forEach(([name, value]) => {
    if (Array.isArray(value)) {
      value.forEach(item => { const input = $$(`input[name="${name}"]`).find(el => el.value === item); if (input) input.checked = true; });
      return;
    }
    const field = form.elements.namedItem(name);
    if (!field || typeof field.value === "undefined") return;
    if (field.tagName === "SELECT" && value && ![...field.options].some(option => option.value === value)) field.add(new Option(value, value));
    if (field.type === "checkbox") field.checked = Boolean(value); else field.value = value ?? "";
  });
  updateStudyMode();
  $$('input[type="range"]', form).forEach(range => range.dispatchEvent(new Event("input")));
  observationStart = session.recordingDurationMs ? Date.now() - session.recordingDurationMs : null;
  resetTraceUi();
  $("#record-time").textContent = formatTime(session.recordingDurationMs);
  renderTraceSummary(session);
  updateArchiveState();
  const steps = includedSteps();
  showStep(steps.includes(session.currentStep) ? session.currentStep : steps[0]);
  routeTo("setup");
  toast(session.status === "complete" ? "Session opened for editing — changes save automatically." : "Local draft resumed.");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const safeName = value => String(value || "session").replace(/[^a-zA-Z0-9_-]+/g, "-");
function csvEscape(value) { const text = Array.isArray(value) ? value.join(" | ") : String(value ?? ""); return `"${text.replaceAll('"', '""')}"`; }
function objectToCsv(object) { const entries = Object.entries(object); return `\ufeff${entries.map(([key]) => csvEscape(key)).join(",")}\n${entries.map(([, value]) => csvEscape(value)).join(",")}\n`; }

function traceToCsv(session) {
  const columns = ["session_id", "participant_id", "elapsed_ms", "type", "tab_id", "page_id", "url", "title", "label", "role", "selector", "x", "y", "timestamp"];
  const observationId = moduleParticipants(session).observationId;
  const rows = (session.traceEvents || []).map(event => [session.id, observationId, event.elapsedMs, event.type, event.tabId, event.pageId, event.url, event.title, event.label, event.role, event.selector, event.x, event.y, event.timestamp]);
  return `\ufeff${columns.map(csvEscape).join(",")}\n${rows.map(row => row.map(csvEscape).join(",")).join("\n")}\n`;
}

function sessionMode(session) {
  return session.responses?.studyMode || (session.traceComplete || session.hasRecording ? "both" : "survey");
}

function moduleParticipants(session) {
  const response = session.responses || {};
  const legacyId = response.participantId || "";
  return {
    surveyId: response.surveyParticipantId || legacyId,
    observationId: response.observationParticipantId || legacyId,
    surveyStage: response.surveyStudyStage || response.studyStage || "",
    observationStage: response.observationStudyStage || response.studyStage || ""
  };
}

function pickFields(source, names) {
  return Object.fromEntries(names.map(name => [name, source?.[name] ?? ""]));
}

function surveyRow(session) {
  const participants = moduleParticipants(session);
  return { session_id: session.id, module: "survey", participant_id: participants.surveyId, academic_stage: participants.surveyStage, major: session.responses?.surveyMajor || session.responses?.major || "", ...pickFields(session.responses, ["searchExperience", "barriers", "formats", "channelsUsed", ...channels.map(channel => channel.name), "infoWanted"]), ...pickFields(session.responses, ["schedulePreference", "fundingPreference", "leadershipPreference", "channelStaff", "channelFaculty", "channelWebsites", "channelSocialMedia", "channelPeers", "channelOrganizations", "channelCampusClasses", "channelOnlineClasses", "channelOther"].filter(name => session.responses?.[name] !== undefined && session.responses?.[name] !== "")), survey_status: session.moduleStatus?.survey || "", completed_at: session.surveyCompletedAt || session.completedAt || "" };
}

function observationRow(session) {
  const participants = moduleParticipants(session);
  const stats = traceStats(session);
  return { session_id: session.id, module: "observation", participant_id: participants.observationId, academic_stage: participants.observationStage, major: session.responses?.observationMajor || session.responses?.major || "", scenario: session.responses?.scenarioTitle || "", duration_ms: session.recordingDurationMs || 0, has_recording: Boolean(session.hasRecording), trace_mode: session.traceMode || "", click_count: stats.clicks, page_count: stats.pages.length, active_dwell_ms: stats.dwell, ...pickFields(session.responses, ["resultSatisfaction", "decisionInfo"]), ...pickFields(session.responses, ["helpNeeded", "relevanceClarity", "informationClarity", "nextStepClarity", "confusingMoment", "oneChange"].filter(name => session.responses?.[name] !== undefined && session.responses?.[name] !== "")), completed_at: session.observationCompletedAt || session.completedAt || "" };
}

function traceJson(session) {
  return { sessionId: session.id, participantId: moduleParticipants(session).observationId, scenario: session.responses?.scenarioTitle, traceMode: session.traceMode || "", startedAt: session.traceStartedAt, stoppedAt: session.traceStoppedAt, pages: session.tracePages || [], events: session.traceEvents || [] };
}

// Multi-row CSV whose columns are the union of every row's keys (first-seen order).
function rowsToCsv(rows) {
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return `\ufeff${columns.map(csvEscape).join(",")}\n${rows.map(row => columns.map(key => csvEscape(row[key])).join(",")).join("\n")}\n`;
}

async function exportItem(id, type) {
  const session = await getSession(id);
  if (!session) return;
  const participants = moduleParticipants(session);
  const pid = safeName(participants.surveyId || participants.observationId || id);
  const observationPid = safeName(participants.observationId || id);
  if (type === "json") downloadBlob(new Blob([JSON.stringify(session, null, 2)], { type: "application/json" }), `${pid}-complete-session.json`);
  if (type === "responses") {
    const flat = { session_id: session.id, status: session.status, created_at: session.createdAt, completed_at: session.completedAt || "", duration_ms: session.recordingDurationMs || 0, trace_event_count: session.traceEvents?.length || 0, ...session.responses };
    downloadBlob(new Blob([objectToCsv(flat)], { type: "text/csv;charset=utf-8" }), `${pid}-survey-and-scales.csv`);
  }
  if (type === "survey") downloadBlob(new Blob([objectToCsv(surveyRow(session))], { type: "text/csv;charset=utf-8" }), `${safeName(participants.surveyId || id)}-survey.csv`);
  if (type === "observation") downloadBlob(new Blob([objectToCsv(observationRow(session))], { type: "text/csv;charset=utf-8" }), `${safeName(participants.observationId || id)}-observation.csv`);
  if (type === "trace") downloadBlob(new Blob([traceToCsv(session)], { type: "text/csv;charset=utf-8" }), `${observationPid}-click-trace.csv`);
  if (type === "tracejson") downloadBlob(new Blob([JSON.stringify(traceJson(session), null, 2)], { type: "application/json" }), `${observationPid}-trace.json`);
  if (type === "video") { const recording = await getRecording(id); if (!recording?.blob) return toast("This session has no recording."); downloadBlob(recording.blob, `${observationPid}-screen.webm`); }
}

// ---- Export all data as one ZIP (store-only, no compression: WebM is already compressed) ----
const CRC_TABLE = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } return table; })();
function crc32(bytes) { let crc = 0xffffffff; for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }

async function buildZip(files) {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = typeof file.data === "string" ? encoder.encode(file.data) : new Uint8Array(await file.data.arrayBuffer());
    if (offset + data.length > 0xfffffff0) throw new Error("Export is larger than 4 GB; export recordings individually instead.");
    const crc = crc32(data);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true); header.setUint16(4, 20, true); header.setUint16(6, 0x0800, true); header.setUint16(8, 0, true);
    header.setUint16(10, dosTime, true); header.setUint16(12, dosDate, true); header.setUint32(14, crc, true);
    header.setUint32(18, data.length, true); header.setUint32(22, data.length, true); header.setUint16(26, nameBytes.length, true); header.setUint16(28, 0, true);
    parts.push(header, nameBytes, data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(8, 0x0800, true); entry.setUint16(10, 0, true);
    entry.setUint16(12, dosTime, true); entry.setUint16(14, dosDate, true); entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true); entry.setUint32(24, data.length, true); entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}

async function exportAll() {
  const sessions = (await getSessions()).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (!sessions.length) return toast("There are no sessions to export.");
  const button = $("#export-all");
  const label = button?.textContent;
  if (button) { button.disabled = true; button.textContent = "Preparing export…"; }
  try {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const root = `pathways-export-${stamp}`;
    const surveySessions = sessions.filter(s => sessionMode(s) !== "observation");
    const observationSessions = sessions.filter(s => sessionMode(s) !== "survey");
    const files = [];
    const add = (name, data) => files.push({ name: `${root}/${name}`, data });

    const keys = [...new Set(sessions.flatMap(s => Object.keys(s.responses || {})))];
    add("sessions-summary.csv", rowsToCsv(sessions.map(s => ({ session_id: s.id, mode: sessionMode(s), status: s.status, created_at: s.createdAt, completed_at: s.completedAt || "", duration_ms: s.recordingDurationMs || 0, trace_events: s.traceEvents?.length || 0, pages: s.tracePages?.length || 0, has_recording: Boolean(s.hasRecording), ...Object.fromEntries(keys.map(k => [k, s.responses?.[k] ?? ""])) }))));
    if (surveySessions.length) add("survey.csv", rowsToCsv(surveySessions.map(surveyRow)));
    if (observationSessions.length) add("observation.csv", rowsToCsv(observationSessions.map(observationRow)));
    const traced = observationSessions.filter(s => s.traceEvents?.length);
    if (traced.length) add("click-trace.csv", `﻿${traceToCsv(traced[0]).split("\n")[0].replace(/^﻿/, "")}\n${traced.map(s => traceToCsv(s).split("\n").slice(1).filter(Boolean).join("\n")).join("\n")}\n`);

    let recordingCount = 0;
    let missingRecordings = 0;
    for (const session of sessions) {
      const p = moduleParticipants(session);
      const folder = `sessions/${safeName(p.surveyId || p.observationId || "session")}_${safeName(session.id)}`;
      add(`${folder}/complete-session.json`, JSON.stringify(session, null, 2));
      if (sessionMode(session) !== "survey") add(`${folder}/trace.json`, JSON.stringify(traceJson(session), null, 2));
      if (session.hasRecording) {
        const recording = await getRecording(session.id);
        if (recording?.blob) { add(`${folder}/screen-recording.webm`, recording.blob); recordingCount++; }
        else missingRecordings++;
      }
    }
    add("README.txt", [
      "Pathways Research Kit - full data export",
      `Exported: ${new Date().toString()}`,
      `Sessions: ${sessions.length} (survey: ${surveySessions.length}, observation: ${observationSessions.length})`,
      `Raw recordings: ${recordingCount}${missingRecordings ? ` (${missingRecordings} listed but not found in local storage)` : ""}`,
      "",
      "sessions-summary.csv  one row per session with every saved response",
      "survey.csv            one row per survey (all participants)",
      "observation.csv       one row per observation with trace stats and post-task scales",
      "click-trace.csv       every click/page event from all observations",
      "sessions/<participant>_<session>/",
      "  complete-session.json  full raw record",
      "  trace.json             pages + events for the observation",
      "  screen-recording.webm  raw screen recording (open in Chrome or VLC)"
    ].join("\n"));

    const zip = await buildZip(files);
    downloadBlob(zip, `${root}.zip`);
    toast(`Exported ${sessions.length} sessions and ${recordingCount} recordings (${(zip.size / 1024 / 1024).toFixed(1)} MB).`);
  } catch (error) {
    console.error(error);
    toast(`Export failed: ${error.message}`);
  } finally {
    if (button) { button.disabled = false; button.textContent = label; }
  }
}


// ---- Import a ZIP made by "Export all data" (or a single complete-session.json) ----
// Reads stored and deflated entries, so ZIPs re-compressed by Finder/Windows also work.
async function readZip(file) {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("This is not a valid ZIP file.");
  const count = view.getUint16(eocd + 10, true);
  let pointer = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(pointer, true) !== 0x02014b50) throw new Error("ZIP directory is damaged.");
    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, pointer + 46, nameLength));
    pointer += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/") || name.includes("__MACOSX/")) continue;
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const raw = new Blob([new Uint8Array(buffer, dataStart, compressedSize)]);
    entries.set(name, { method, raw });
  }
  const read = async entry => {
    if (entry.method === 0) return entry.raw;
    if (entry.method === 8) return new Response(entry.raw.stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob();
    throw new Error(`Unsupported ZIP compression (method ${entry.method}).`);
  };
  return { names: [...entries.keys()], read: async name => read(entries.get(name)) };
}

function isSessionRecord(value) {
  return value && typeof value === "object" && typeof value.id === "string" && value.id.length > 0 && typeof value.createdAt === "string";
}

async function importData(file) {
  try {
    const items = []; // { session, recording?: Blob }
    if (/\.json$/i.test(file.name)) {
      const session = JSON.parse(await file.text());
      if (!isSessionRecord(session)) throw new Error("This JSON is not a Pathways complete-session file.");
      items.push({ session });
    } else {
      const zip = await readZip(file);
      const sessionFiles = zip.names.filter(name => /(^|\/)complete-session\.json$/.test(name));
      if (!sessionFiles.length) throw new Error("No sessions found. Choose a ZIP made with “Export all data”.");
      for (const name of sessionFiles) {
        const session = JSON.parse(await (await zip.read(name)).text());
        if (!isSessionRecord(session)) continue;
        const videoName = name.replace(/complete-session\.json$/, "screen-recording.webm");
        const recording = zip.names.includes(videoName) ? await zip.read(videoName) : null;
        items.push({ session, recording: recording ? new Blob([recording], { type: session.recordingMimeType || "video/webm" }) : null });
      }
    }
    if (!items.length) throw new Error("No valid sessions found in this file.");
    const existingIds = new Set((await getSessions()).map(session => session.id));
    const replacing = items.filter(item => existingIds.has(item.session.id)).length;
    const recordings = items.filter(item => item.recording).length;
    const message = `Import ${items.length} session(s) and ${recordings} recording(s) from “${file.name}”?` +
      (replacing ? `\n\n${replacing} session(s) already exist here and will be replaced with the imported version.` : "");
    if (!confirm(message)) return;
    for (const { session, recording } of items) {
      if (recording) {
        await putRecording(session.id, recording);
        session.hasRecording = true;
        session.recordingBytes = recording.size;
      } else if (session.hasRecording && !(await getRecording(session.id))) {
        session.hasRecording = false; // the export did not include the video
      }
      session.importedAt = new Date().toISOString();
      session.importedFrom = file.name;
      await putSession(session);
    }
    toast(`Imported ${items.length} session(s) and ${recordings} recording(s).`);
    renderSessions();
    refreshDashboard();
  } catch (error) {
    console.error(error);
    toast(`Import failed: ${error.message}`);
  }
}

async function removeSession(id) {
  const session = await getSession(id);
  const participants = session ? moduleParticipants(session) : {};
  if (!confirm(`Permanently delete ${participants.surveyId || participants.observationId || "this session"}, including all selected-module data?`)) return;
  await Promise.all([deleteSessionRecord(id), deleteRecording(id)]);
  toast("Local session deleted.");
  renderSessions();
}

async function refreshDashboard() {
  const sessions = await getSessions();
  const ordered = sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  $("#metric-sessions").textContent = sessions.filter(s => ["survey", "both"].includes(sessionMode(s))).length;
  $("#metric-complete").textContent = sessions.filter(s => ["observation", "both"].includes(sessionMode(s))).length;
  $("#metric-recordings").textContent = sessions.filter(s => s.hasRecording).length;
  const recent = ordered.slice(0, 4);
  $("#recent-wrap").innerHTML = recent.length ? `<div class="panel-head"><div><span class="eyebrow dark">RECENT</span><h3>Recent sessions</h3></div><button class="text-button" style="color:#163c3a" data-route="sessions">View all →</button></div><table class="recent-table"><thead><tr><th>Participant(s)</th><th>Module</th><th>Status</th><th>Clicks</th></tr></thead><tbody>${recent.map(s => { const p = moduleParticipants(s); const mode = sessionMode(s); const label = mode === "both" && p.surveyId !== p.observationId ? `${p.surveyId || "—"} / ${p.observationId || "—"}` : p.surveyId || p.observationId || "Untitled"; return `<tr><td>${escapeHtml(label)}</td><td><span class="module-badge ${mode}">${mode === "both" ? "Survey + observation" : mode}</span></td><td><span class="status ${s.status === "complete" ? "complete" : ""}">${s.status === "complete" ? "Completed" : "Draft"}</span></td><td>${traceStats(s).clicks}</td></tr>`; }).join("")}</tbody></table>` : "";
}

async function renderSessions() {
  const sessions = (await getSessions()).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  $("#session-list").innerHTML = sessions.length ? sessions.map(s => {
    const response = s.responses || {};
    const stats = traceStats(s);
    const mode = sessionMode(s);
    const p = moduleParticipants(s);
    const participantLabel = mode === "both" && p.surveyId !== p.observationId ? `Survey: ${p.surveyId || "—"} · Observation: ${p.observationId || "—"}` : p.surveyId || p.observationId || "Untitled session";
    return `<article class="session-card"><div><h3>${escapeHtml(participantLabel)} <span class="module-badge ${mode}">${mode === "both" ? "Survey + observation" : mode}</span> <span class="status ${s.status === "complete" ? "complete" : ""}">${s.status === "complete" ? "Completed" : "Draft"}</span></h3><div class="session-meta"><span>${new Date(s.createdAt).toLocaleString()}</span>${s.moduleStatus?.survey === "complete" ? '<span class="checkpoint">Survey archived</span>' : ""}${mode !== "observation" ? `<span>Survey: ${escapeHtml(p.surveyStage || "Stage not entered")}</span>` : ""}${mode !== "survey" ? `<span>Observation: ${escapeHtml(p.observationStage || "Stage not entered")}</span><span>${escapeHtml(response.scenarioTitle || "No scenario")}</span><span>${stats.clicks} clicks</span><span>${formatTime(stats.dwell)} active</span>` : ""}</div></div><div class="session-actions"><button class="button primary" data-resume="${s.id}">${s.status === "complete" ? "Open / edit" : "Resume"}</button>${mode !== "observation" ? `<button class="button secondary" data-export="survey" data-id="${s.id}">Survey CSV</button>` : ""}${mode !== "survey" ? `<button class="button secondary" data-export="observation" data-id="${s.id}">Observation CSV</button>` : ""}${s.traceComplete ? `<button class="button secondary" data-view-trace="${s.id}">View trace</button><button class="button secondary" data-export="tracejson" data-id="${s.id}">Trace JSON</button><button class="button secondary" data-export="trace" data-id="${s.id}">Trace CSV</button>` : ""}${s.hasRecording ? `<button class="button primary" data-export="video" data-id="${s.id}">Raw WebM</button>` : ""}<button class="button secondary" data-export="json" data-id="${s.id}">Complete JSON</button><button class="button danger" data-delete="${s.id}">Delete</button></div></article>`;
  }).join("") : '<div class="empty-state"><div style="font-size:36px">◎</div><strong>No local sessions yet</strong><p>Start a study to collect a survey, automatic behavior trace, and raw recording.</p><button class="button primary" data-action="new-session">New session</button></div>';
}

async function openTraceViewer(id) {
  const session = await getSession(id);
  if (!session) return;
  const stats = traceStats(session);
  $("#trace-dialog-title").textContent = `${moduleParticipants(session).observationId || "Observation"} · ${session.responses?.scenarioTitle || "Behavior trace"}`;
  $("#trace-dialog-summary").innerHTML = `<div><strong>${stats.clicks}</strong><span>clicks</span></div><div><strong>${stats.pages.length}</strong><span>pages</span></div><div><strong>${formatTime(stats.dwell)}</strong><span>active dwell</span></div>`;
  const events = stats.events.filter(event => ["page_enter", "click", "page_exit", "visibility"].includes(event.type));
  $("#trace-dialog-body").innerHTML = events.length ? events.map(event => `<div class="timeline-item ${event.type}"><time>${formatTime(event.elapsedMs)}</time><span class="timeline-dot"></span><div><strong>${event.type === "click" ? `Clicked ${escapeHtml(event.label || event.role || "element")}` : event.type === "page_enter" ? `Opened ${escapeHtml(event.title || shortUrl(event.url))}` : event.type === "visibility" ? `Page ${escapeHtml(event.state || "visibility changed")}` : "Left page"}</strong><small>${escapeHtml(shortUrl(event.url))}${event.selector ? ` · ${escapeHtml(event.selector)}` : ""}</small></div></div>`).join("") : '<p>No trace events were recorded.</p>';
  $("#trace-dialog").showModal();
}

function bindEvents() {
  document.addEventListener("click", event => {
    const route = event.target.closest("[data-route]")?.dataset.route;
    if (route === "setup") newSession(); // "New session" always creates (and saves) a fresh draft
    else if (route) routeTo(route);
    if (event.target.closest('[data-action="new-session"]')) newSession();
    const exportButton = event.target.closest("[data-export]");
    if (exportButton) exportItem(exportButton.dataset.id, exportButton.dataset.export);
    const deleteButton = event.target.closest("[data-delete]");
    if (deleteButton) removeSession(deleteButton.dataset.delete);
    const resumeButton = event.target.closest("[data-resume]");
    if (resumeButton) resumeSession(resumeButton.dataset.resume);
    const traceButton = event.target.closest("[data-view-trace]");
    if (traceButton) openTraceViewer(traceButton.dataset.viewTrace);
  });
  $("#next-step").addEventListener("click", nextStep);
  $("#prev-step").addEventListener("click", () => { const steps = includedSteps(); const position = steps.indexOf(currentStep); if (position > 0) showStep(steps[position - 1]); });
  $$(".step").forEach((step, index) => step.addEventListener("click", () => { const steps = includedSteps(); if (steps.includes(index) && steps.indexOf(index) <= steps.indexOf(currentStep)) showStep(index); }));
  form.addEventListener("submit", finishSession);
  form.addEventListener("change", event => {
    if (["studyMode", "participantArrangement"].includes(event.target.name)) updateStudyMode();
    queueAutosave(0);
  });
  form.addEventListener("input", () => queueAutosave(350));
  $("#regenerate-ids").addEventListener("click", () => { ensureParticipantIds(true); toast("New anonymous participant ID(s) generated."); });
  $$('input[type="range"]', form).forEach(range => {
    // Clickable 1–5 numbers under each slider; the track fill and highlighted number follow the value.
    const ticks = document.createElement("div");
    ticks.className = "scale-ticks";
    for (let value = Number(range.min || 1); value <= Number(range.max || 5); value++) {
      const tick = document.createElement("button");
      tick.type = "button";
      tick.textContent = value;
      tick.setAttribute("aria-label", `Set ${range.name} to ${value}`);
      tick.addEventListener("click", () => { range.value = value; range.dispatchEvent(new Event("input", { bubbles: true })); range.dispatchEvent(new Event("change", { bubbles: true })); });
      ticks.append(tick);
    }
    range.insertAdjacentElement("afterend", ticks);
    const sync = () => {
      $(`[data-output="${range.name}"]`).textContent = range.value;
      const min = Number(range.min || 1), max = Number(range.max || 5);
      range.style.setProperty("--fill", `${((range.value - min) / (max - min)) * 100}%`);
      $$("button", ticks).forEach(tick => tick.classList.toggle("on", Number(tick.textContent) === Number(range.value)));
    };
    range.addEventListener("input", sync);
    sync();
  });
  $$(".max-three").forEach(group => group.addEventListener("change", event => {
    const name = event.target.name;
    if (event.target.checked && $$(`input[name="${name}"]:checked`).length > 3) { event.target.checked = false; toast("Choose up to 3 options."); }
  }));
  $('[data-name="channels"]')?.addEventListener("change", event => { if (event.target.name === "channelsUsed") syncChannelRows(); });
  $('[data-name="channels"]')?.addEventListener("pointerdown", event => {
    const input = event.target.closest(".channel-option")?.querySelector("input");
    if (input) input.dataset.wasChecked = String(input.checked);
  });
  $('[data-name="channels"]')?.addEventListener("click", event => {
    const input = event.target.closest(".channel-option input");
    if (!input || input.dataset.wasChecked !== "true") return;
    input.dataset.wasChecked = "false";
    input.checked = false;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  $("#start-recording").addEventListener("click", startRecording);
  $("#stop-recording").addEventListener("click", () => stopRecording("manual"));
  $("#export-all").addEventListener("click", exportAll);
  $("#copy-participant-link")?.addEventListener("click", async () => {
    const link = new URL("participate.html", location.href.split("#")[0]).href;
    try { await navigator.clipboard.writeText(link); toast(`Copied: ${link}`); }
    catch { prompt("Copy this participant link:", link); }
  });
  $("#import-data").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", event => { const [file] = event.target.files; event.target.value = ""; if (file) importData(file); });
  $("#close-trace").addEventListener("click", () => $("#trace-dialog").close());
  document.addEventListener("PATHWAYS_TRACE_STATUS", event => setExtensionStatus(Boolean(event.detail?.connected)));
  document.addEventListener("PATHWAYS_TRACE_STARTED", event => { if (event.detail?.ok) toast("Automatic click trace started."); });
  document.addEventListener("PATHWAYS_TRACE_RESULT", event => handleTraceResult(event.detail));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && currentSession) autosave().catch(() => {}); });
  window.addEventListener("pagehide", () => { if (currentSession) autosave().catch(() => {}); });
  window.addEventListener("beforeunload", event => { if (currentSession) autosave().catch(() => {}); if (mediaRecorder?.state === "recording") { event.preventDefault(); event.returnValue = ""; } });
}

async function init() {
  renderModuleSetup();
  renderChoices();
  bindEvents();
  const liveLabel = $(".live-trace .eyebrow");
  if (liveLabel) liveLabel.textContent = "TRACE SUMMARY";
  const metrics = $$(".metric");
  metrics[0]?.querySelector("span")?.replaceChildren("Survey datasets");
  metrics[0]?.querySelector("small")?.replaceChildren("Independent or linked");
  metrics[1]?.querySelector("span")?.replaceChildren("Observation datasets");
  metrics[1]?.querySelector("small")?.replaceChildren("Trace + post-task scales");
  const heroCopy = $(".hero p");
  if (heroCopy) heroCopy.textContent = "Run a survey, an observation, or both. Link one participant across modules or keep two participants separate.";
  const recordingPrompt = $("#preview-empty");
  if (recordingPrompt) {
    $("strong", recordingPrompt).textContent = "Click Start recording, then choose Entire Screen";
    $("p", recordingPrompt).textContent = "After sharing starts, click Open task tab to begin searching. Entire Screen captures every tab you open.";
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  // Each address keeps its own saved sessions (browser storage is per origin), so say which copy this is.
  const localCard = $(".local-card");
  if (localCard) {
    const isLocalServer = ["127.0.0.1", "localhost"].includes(location.hostname);
    $("strong", localCard).textContent = isLocalServer ? "Local server copy" : "Online copy (this computer only)";
    $("p", localCard).textContent = `Data is saved only in this browser for ${location.host}. Nothing is uploaded; sessions from other computers or addresses are not shown here — use Export all data to share.`;
  }
  const installGuide = $("#guide .guide-block");
  if (installGuide) installGuide.insertAdjacentHTML("beforeend", '<p class="extension-download"><a class="button primary" href="pathways-trace-extension.zip" download>↓ Download Chrome extension</a><small>Unzip the download, then choose the extracted folder in Load unpacked.</small></p>');
  $$('input[type="range"]', form).forEach(range => range.dispatchEvent(new Event("input")));
  updateStudyMode();
  routeTo(["dashboard", "sessions", "guide"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "dashboard");
  pingExtension();
  setTimeout(pingExtension, 600);
  setTimeout(() => { if (!extensionConnected) setExtensionStatus(false); }, 1200);
}

init().catch(error => { console.error(error); toast("The app could not initialize. Refresh and try again."); });
