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

The data itself lives as static JSON files under `data/` (extracted once from
the workbook), so the app has no database — it's a static dashboard served by
a tiny Node/Express server.

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

Whenever the workbook is refreshed, re-export the five JSON files in `data/`
to match. Each file mirrors one worksheet's rows/totals — keep the same keys
so `js/views.js` doesn't need to change.

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

This installs a per-user Startup shortcut that starts the dashboard at each
Windows logon without opening a console window. It serves the dashboard at
`http://localhost:3000`.

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
