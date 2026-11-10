/**
 * Pathways participant uploads — Google Apps Script backend.
 *
 * Receives submissions from participate.html (GitHub Pages or the local server):
 *   - each answer set becomes a row in the "Submissions" sheet of this spreadsheet
 *   - screen recordings are saved to Drive, one folder per participant
 *   - an email notification goes to NOTIFY_EMAIL for every finished participant
 *
 * Setup (once): see apps-script/SETUP.md. Paste this whole file into
 * Extensions → Apps Script of a Google Sheet, then Deploy → New deployment → Web app.
 *
 * The web app URL is public (it is in the participant page), so this script only ever
 * ADDS data. Nothing here returns stored answers or recordings to the caller.
 */

const NOTIFY_EMAIL = "zxyyy1987@gmail.com";
const ROOT_FOLDER_NAME = "Pathways participant uploads";
const SHEET_NAME = "Submissions";
const MAX_CHUNK_BASE64 = 14 * 1024 * 1024;   // ~10 MB of video per upload request
const MAX_PARTS = 400;
const MERGE_LIMIT_BYTES = 30 * 1024 * 1024;  // larger recordings stay in pieces (Apps Script memory)

const SESSION_ID = /^[A-Za-z0-9_-]{6,80}$/;
const PARTICIPANT_ID = /^[PSO]-\d{6}-[A-Z0-9]{4}$/;

function doGet() {
  return json_({ ok: true, service: "pathways-uploads", time: new Date().toISOString() });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (body.app !== "pathways") throw new Error("Unknown client");
    if (body.action === "ping") return json_({ ok: true });
    if (!SESSION_ID.test(body.sessionId || "")) throw new Error("Bad session id");
    if (!PARTICIPANT_ID.test(body.participantId || "")) throw new Error("Bad participant id");
    if (body.action === "chunk") return json_(saveChunk_(body));
    if (body.action === "submit") return json_(submit_(body));
    throw new Error("Unknown action");
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: String(error && error.message || error) });
  }
}

// ---------- recording pieces ----------

function saveChunk_(body) {
  const index = Number(body.index);
  const attempt = Number(body.attempt || 1);
  if (!Number.isInteger(index) || index < 0 || index >= MAX_PARTS) throw new Error("Bad chunk index");
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > 50) throw new Error("Bad attempt");
  if (typeof body.data !== "string" || body.data.length > MAX_CHUNK_BASE64) throw new Error("Chunk too large");
  const folder = sessionFolder_(body.participantId, body.sessionId);
  const name = partName_(attempt, index);
  trashByName_(folder, name);
  const blob = Utilities.newBlob(Utilities.base64Decode(body.data), "video/webm", name);
  folder.createFile(blob);
  return { ok: true, index: index };
}

function partName_(attempt, index) {
  return "rec" + attempt + "-part-" + ("000" + index).slice(-4) + ".webm";
}

// ---------- final submission ----------

function submit_(body) {
  const record = body.record || {};
  const folder = sessionFolder_(body.participantId, body.sessionId);
  const attempt = Number(body.attempt || 0);
  const expectedParts = Number(body.partCount || 0);

  let recording = { status: "none", file: "", parts: 0, missing: "" };
  if (attempt > 0 && expectedParts > 0) recording = finishRecording_(folder, attempt, expectedParts);

  record.session_id = body.sessionId;
  record.participant_id = body.participantId;
  record.received_at = new Date().toISOString();
  record.recording_status = recording.status;
  record.recording_parts = recording.parts;
  record.recording_missing_parts = recording.missing;
  record.drive_folder = folder.getUrl();

  trashByName_(folder, "answers.json");
  folder.createFile("answers.json", JSON.stringify(record, null, 2), "application/json");
  upsertRow_(record);
  notify_(record, folder, recording);
  return { ok: true, recording: recording.status };
}

function finishRecording_(folder, attempt, expectedParts) {
  const prefix = "rec" + attempt + "-part-";
  const parts = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (file.getName().indexOf(prefix) === 0) parts.push(file);
  }
  parts.sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });
  const have = {};
  parts.forEach(function (file) { have[file.getName()] = true; });
  const missing = [];
  for (let i = 0; i < expectedParts; i++) if (!have[partName_(attempt, i)]) missing.push(i);

  const total = parts.reduce(function (sum, file) { return sum + file.getSize(); }, 0);
  // WebM pieces from MediaRecorder concatenate into one playable file.
  if (!missing.length && total <= MERGE_LIMIT_BYTES) {
    try {
      let bytes = [];
      parts.forEach(function (file) { bytes = bytes.concat(file.getBlob().getBytes()); });
      trashByName_(folder, "screen-recording.webm");
      folder.createFile(Utilities.newBlob(bytes, "video/webm", "screen-recording.webm"));
      parts.forEach(function (file) { file.setTrashed(true); });
      return { status: "merged", file: "screen-recording.webm", parts: parts.length, missing: "" };
    } catch (error) {
      console.warn("Merge failed, keeping parts: " + error);
    }
  }
  return {
    status: missing.length ? "incomplete" : "parts",
    file: "",
    parts: parts.length,
    missing: missing.join(" ")
  };
}

// ---------- storage helpers ----------

function rootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("ROOT_FOLDER_ID");
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (error) { /* folder deleted: recreate */ }
  }
  const folder = DriveApp.createFolder(ROOT_FOLDER_NAME);
  props.setProperty("ROOT_FOLDER_ID", folder.getId());
  return folder;
}

function sessionFolder_(participantId, sessionId) {
  const name = participantId + "_" + sessionId;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const root = rootFolder_();
    const found = root.getFoldersByName(name);
    return found.hasNext() ? found.next() : root.createFolder(name);
  } finally {
    lock.releaseLock();
  }
}

function trashByName_(folder, name) {
  const files = folder.getFilesByName(name);
  while (files.hasNext()) files.next().setTrashed(true);
}

function upsertRow_(record) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const book = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME);
    let headers = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
    const keys = Object.keys(record);
    const added = keys.filter(function (key) { return headers.indexOf(key) < 0; });
    if (added.length) {
      headers = headers.concat(added);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
    const row = headers.map(function (key) { return cell_(record[key]); });
    // Same session submitted again (e.g. a retry): replace its row instead of adding one.
    const idColumn = headers.indexOf("session_id") + 1;
    let target = 0;
    if (idColumn && sheet.getLastRow() > 1) {
      const ids = sheet.getRange(2, idColumn, sheet.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) if (ids[i][0] === record.session_id) { target = i + 2; break; }
    }
    if (target) sheet.getRange(target, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);
  } finally {
    lock.releaseLock();
  }
}

function cell_(value) {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(" | ");
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

// ---------- email ----------

function notify_(record, folder, recording) {
  const minutes = record.total_ms ? Math.round(record.total_ms / 60000) + " min" : "";
  const subject = "Pathways: new participant " + record.participant_id + " · " + (record.mode_label || record.mode || "") + (minutes ? " · " + minutes : "");
  const rows = Object.keys(record).map(function (key) {
    return "<tr><td style='padding:4px 10px;color:#61706e;vertical-align:top'>" + escape_(key) + "</td><td style='padding:4px 10px'>" + escape_(cell_(record[key])) + "</td></tr>";
  }).join("");
  const recordingLine = {
    merged: "Recording saved as screen-recording.webm.",
    parts: "Recording saved in " + recording.parts + " pieces (too large to merge automatically). To join them on a Mac: download the folder, then run  cat rec*-part-*.webm > screen-recording.webm  inside it.",
    incomplete: "Recording is incomplete — missing pieces: " + recording.missing + ".",
    none: "No recording for this participant."
  }[recording.status] || "";
  const html = "<p><b>" + escape_(record.participant_id) + "</b> finished the Pathways study.</p>" +
    "<p>" + escape_(recordingLine) + "<br><a href='" + folder.getUrl() + "'>Open this participant's Drive folder</a> · " +
    "<a href='" + SpreadsheetApp.getActiveSpreadsheet().getUrl() + "'>Open the Submissions sheet</a></p>" +
    "<table style='border-collapse:collapse;font:13px sans-serif'>" + rows + "</table>";
  MailApp.sendEmail({ to: NOTIFY_EMAIL, subject: subject, htmlBody: html, body: subject + "\n" + recordingLine + "\n" + folder.getUrl() });
}

function escape_(value) {
  return String(value).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; });
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

/** Run this once from the editor (▶ Run) to grant permissions and test email + Drive + Sheet. */
function setupTest() {
  const folder = rootFolder_();
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book.getSheetByName(SHEET_NAME)) book.insertSheet(SHEET_NAME);
  MailApp.sendEmail(NOTIFY_EMAIL, "Pathways uploads: setup works", "Drive folder: " + folder.getUrl() + "\nSheet: " + book.getUrl());
  Logger.log("OK — folder %s, sheet %s", folder.getUrl(), book.getUrl());
}
