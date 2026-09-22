# Marfani Steels — Management Reporting Deck

A section-wise web dashboard built from the *Marfani Steels Group — Management
Reporting Pack* Excel workbook. Five sections, one per report in the workbook's
Report Index:

| Section | Source sheet |
|---|---|
| Overview | 05 Consolidated MIS Report |
| Daily Fund Outflow | 01 Daily Fund Outflow Rpt |
| Fund Planning | 02 Fund Planning Report |
| One View – BL Tracker | 03 One View BL Wise Rpt |
| Shipment Costing | 04 Shipment Costing Rpt |

The dashboard reads the live workbook from Dropbox by default and keeps
static JSON files under `data/` as a fallback. It is served by a tiny
Node/Express server.

## Project structure

```
.
├── index.html         # app shell (sidebar + topbar + content mount point)
├── css/style.css       # all styling
├── js/
│   ├── utils.js        # formatting + data-loading helpers
│   ├── views.js        # one render function per report section
│   └── app.js           # hash-based router
├── data/*.json         # extracted report data
├── server.js           # Express static server (used on Render)
├── package.json
└── render.yaml          # optional Render Blueprint
```

## Updating the data

The live workbook URL can be overridden with `LIVE_WORKBOOK_URL`. Set
`ENABLE_LIVE_WORKBOOK=false` to use the saved JSON files only. Each static file
mirrors one worksheet's rows/totals and remains the fallback when the workbook
cannot be downloaded.

The configured SharePoint link must allow anonymous viewing/download (SharePoint
permission: **Anyone with the link can view**) because the Node server cannot use
your browser login session. Dropbox is also supported: create a shared link for
the Excel file with **Anyone with the link can view**, then set
`LIVE_WORKBOOK_URL` to that link. The server automatically changes Dropbox's
`dl=0` link to a direct download link.

For local use, place the project folder inside your Dropbox-synced folder if you
want the code and saved JSON fallback files synchronized across computers. For
Render or another hosted server, keep the project in Git and use the public
Dropbox Excel link as `LIVE_WORKBOOK_URL`; the hosted server cannot read a local
Dropbox folder on your PC.

Example:

```powershell
$env:LIVE_WORKBOOK_URL = 'https://www.dropbox.com/scl/fi/<file-id>/New-Import-Monitoring.xlsx?rlkey=<key>&dl=0'
$env:ENABLE_LIVE_WORKBOOK = 'true'
npm start
```

## Run locally

```bash
npm install
npm start
# open http://localhost:3000
```

### Start automatically on Windows

Run this once in PowerShell from the project folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1
```

This installs a per-user Task Scheduler logon task that starts the dashboard at
each Windows logon without opening a console window. It serves the dashboard at
`http://localhost:3000`.

### Automatically publish workbook changes

Install the five-minute workbook sync task once from PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-autosync.ps1
```

When `data/New Import Monitoring.xlsx` changes, the task commits only that file
and pushes `main`. Render then deploys the updated workbook automatically.

Or, since it's plain static HTML/CSS/JS, you can also just open `index.html`
directly in a browser, or serve the folder with any static server (`npx serve .`).

## Publish to GitHub

```bash
git init
git add .
git commit -m "Marfani Steels management reporting dashboard"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## Deploy on Render

1. Go to [render.com](https://render.com) → **New +** → **Web Service**.
2. Connect the GitHub repo you just pushed.
3. Render should auto-detect the settings from `render.yaml`; otherwise set:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Click **Create Web Service**. Render will build and give you a live URL
   (e.g. `https://marfani-steels-reporting-deck.onrender.com`).

Every push to `main` will auto-redeploy.

### Alternative: Static Site on Render

Since there's no backend logic, you can also deploy this as a **Static Site**
on Render instead of a Web Service — same repo, but set:
- **Build Command:** *(leave blank)*
- **Publish Directory:** `.`

Either option works; the Web Service option is a slightly better fit if you
later want to add live API endpoints instead of static JSON.
