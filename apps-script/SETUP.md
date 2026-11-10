# Participant uploads — Google Apps Script setup (about 10 minutes, once)

The participant page (`participate.html`) sends each finished participant to a small Google Apps Script that you own:

- **Answers** → a row in the **Submissions** tab of a Google Sheet
- **Screen recording** → a Drive folder per participant inside **Pathways participant uploads**
- **Email** → a notification to `zxyyy1987@gmail.com` with the answers and a link to the recording

Do these steps while signed in to **zxyyy1987@gmail.com** in Chrome.

## 1. Create the Sheet and paste the script

1. Go to <https://sheets.new> and name the sheet **Pathways participant data**.
2. Menu **Extensions → Apps Script**. A code editor opens.
3. Delete everything in `Code.gs`, then paste the whole contents of [`Code.gs`](Code.gs) from this folder.
4. Click 💾 **Save** (name the project "Pathways uploads").

## 2. Allow it to use Sheets, Drive and email

1. In the toolbar's function menu choose **setupTest**, then click ▶ **Run**.
2. Google asks for permission → **Review permissions** → choose your account.
   You will see "Google hasn't verified this app" because you wrote it yourself: click **Advanced → Go to Pathways uploads (unsafe)** → **Allow**.
3. Within a minute you should get an email **"Pathways uploads: setup works"**, and a **Submissions** tab appears in the sheet.

## 3. Publish it as a web app

1. Click **Deploy → New deployment**.
2. Click the ⚙️ next to "Select type" → **Web app**.
3. Set:
   - **Execute as:** Me (zxyyy1987@gmail.com)
   - **Who has access:** **Anyone** (participants have no Google login; the script only accepts new data and never returns stored data)
4. **Deploy** → copy the **Web app URL** (it ends in `/exec`).

## 4. Connect the participant page

Open `participant-config.js` in the project and paste the URL:

```js
export const SUBMIT_URL = "https://script.google.com/macros/s/XXXXXXXX/exec";
```

Then publish as usual: `npm run sync-pages`, and commit + **Push origin** the `programming` repo in GitHub Desktop.
(Or send the URL to Claude and it will do the edit + sync.)

## 5. Test it yourself

Open `https://xz1987.github.io/programming/participate.html`, do **Survey only** (~3 min), and check that a row appears in the sheet and an email arrives. Then try the search task once with a short recording.

## Day-to-day

| Where | What |
|---|---|
| Sheet → **Submissions** | One row per participant, all answers (lists are joined with `|`) |
| Drive → **Pathways participant uploads** → `<ID>_<session>` | `answers.json` + `screen-recording.webm` |
| Your inbox | One email per finished participant |

- Recordings up to ~30 MB (about 5 minutes) are merged into one `screen-recording.webm`. Longer ones stay as 30-second pieces (`rec1-part-0000.webm`, …). To join them on a Mac, download the folder and run inside it: `cat rec*-part-*.webm > screen-recording.webm`.
- If a participant submits twice (e.g. after a retry), their row is updated, not duplicated.
- Gmail allows about 100 notification emails per day from a script — plenty for a class study.

## Sessions from the researcher app

Sessions saved in the main researcher app are sent to the same script. In the Sheet they have `source = researcher-app`, a `researcher` column, and separate `survey_…` / `observation_…` participant columns. Their Drive folder also contains `trace.json` (click trace) and `complete-session.json`. The email subject reads "Pathways: session by Cora · P-… · Survey + observation" ("(updated)" when a session is edited and saved again — the recording is not re-uploaded).

## Changing the script later

Edit `Code.gs` in the Apps Script editor, then **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same, so the participant page needs no change. (Creating a *new* deployment instead would give a new URL.)

## Privacy notes

- The web app URL is visible in the page source; that is expected. The script only writes, validates IDs, caps upload sizes, and never sends stored data back.
- Recordings can contain whatever was on the participant's screen. Keep the Drive folder private (it is by default) and share it only with the research team.
- Check with your instructor/IRB that storing recordings in this Google account is acceptable for your protocol.
