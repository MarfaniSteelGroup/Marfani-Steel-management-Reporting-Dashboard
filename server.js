// Minimal static file server for the Marfani Steels Reporting Deck.
// Works locally (npm start) and on Render as a Web Service.
const express = require('express');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const ADMIN_USERNAME = 'Admin';
const ADMIN_PASSWORD = 'Marfani@12345';
const AUTH_COOKIE = 'marfani_admin_session';
const USERS = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf8'));
const LIVE_WORKBOOK_URL = 'https://marfanisteelpvtltd-my.sharepoint.com/:x:/g/personal/dms-msgroup_marfanisteel_com/IQAkxFhUOv2wQIdzGqC5p7__AdUOyL2WEfeYENY4RJNv6lI?e=DIcp0h&download=1';

const app = express();
const PORT = process.env.PORT || 3000;

async function downloadWorkbook() {
  const response = await fetch(LIVE_WORKBOOK_URL, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Workbook download failed with status ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function loadStaticReport(name) {
  const filePath = path.join(__dirname, 'data', `${name}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function textValue(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '');
}

function liveRows(buffer, sheetName, headerRow) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Workbook sheet not found: ${sheetName}`);
  return XLSX.utils.sheet_to_json(sheet, { range: headerRow, defval: '' });
}

function liveFundPlanning(buffer) {
  const rows = liveRows(buffer, 'Fund Planning Report', 2).map((row, index) => ({
    sn: row['S. N.'] || index + 1,
    bl_no: row['Last 6 Digit BL No.'],
    order_status: row['Order Status'],
    so_no: row['Sales Order No. '],
    party_name: row['Party Name'],
    composition: row['Composition/Grade'],
    entity: row['Intity Name'],
    no_of_cont: numberValue(row['No. of Cont.']),
    container_eta: row['Cont. ETA Date'],
    free_till: row['Free Till'],
    cha_name: row['CHA Name'],
    qty_kgs: numberValue(row['Qty In KGS']),
    duty_approx_inr: numberValue(row['DUTY AMT APPROX in INR']),
    amount_usd: numberValue(row['AMOUNT TO BE PAID IN USD']),
    amount_payable_inr: numberValue(row['Amount payable in RS (APPROX)']),
    total_required_inr: numberValue(row['Total Amount required\n(In INR)']),
    remarks: row['Remarks']
  })).filter(row => row.bl_no || row.party_name);
  return {
    asOn: new Date().toISOString().slice(0, 10),
    rows,
    totals: rows.reduce((totals, row) => ({
      duty_approx_inr: totals.duty_approx_inr + row.duty_approx_inr,
      amount_usd: totals.amount_usd + row.amount_usd,
      amount_payable_inr: totals.amount_payable_inr + row.amount_payable_inr,
      total_required_inr: totals.total_required_inr + row.total_required_inr
    }), { duty_approx_inr: 0, amount_usd: 0, amount_payable_inr: 0, total_required_inr: 0 })
  };
}

function liveDailyFundOutflow(buffer) {
  const rows = liveRows(buffer, 'Daywise', 5).map((row, index) => ({
    sr: row['Sr. No.'] || index + 1,
    date: textValue(row.Date),
    day: row.Day,
    amount: numberValue(row.Amount)
  })).filter(row => row.day || row.amount);
  return { asOn: new Date().toISOString().slice(0, 10), currency: 'INR', rows, total: rows.reduce((sum, row) => sum + row.amount, 0) };
}

function liveOneView(buffer) {
  const rows = liveRows(buffer, 'New Data', 2).map(row => ({
    bl_no: textValue(row['Last 6 Digit BL No.']),
    full_bl_no: textValue(row['BL No.']),
    order_status: row['Order Status'],
    entity: row['Intity Name'],
    vendor_name: row['Vendor name'],
    product_name: row['Pruduct Name As per SO'],
    category: row.Category,
    no_of_containers: numberValue(row['Nos of Container']),
    shipment_status: row['Shipment Status'],
    documents_status: row['Documents Status'],
    shipping_line: row['Shiping Line'],
    cha_name: row['CHA Name']
  })).filter(row => row.bl_no || row.vendor_name);
  return { asOn: new Date().toISOString().slice(0, 10), rows };
}

function liveShipmentCosting(buffer) {
  const rows = liveRows(buffer, 'Shipmement Costing', 2).map(row => ({
    bl_no: textValue(row['Last 6 Digit BL No.']),
    order_status: row['Order Status'],
    entity: row['Intity Name'],
    full_bl_no: row['BL No.'],
    bl_date: textValue(row['BL  Date']),
    so_no: row['SO  No.'],
    vendor_name: row['Vendor name'],
    product_name: row['Pruduct Name As per SO'],
    category: row.Category,
    port_of_loading: row['Port of Loading'],
    port_of_discharge: row['Port of Discharge'],
    invoice_qty_mt: numberValue(row['Invoice Qty.']),
    amount_paid_usd: numberValue(row['Amount Paid in USD']),
    duty_amount_inr: numberValue(row['DUTY AMOUNT']),
    total_be_amount_inr: numberValue(row['Total BE Amount']),
    landing_cost_inr: numberValue(row['Landing Cost\nin INR']),
    landing_cost_per_kg_inr: numberValue(row['Landing Cost per KGS\nin INR']),
    detention_amount_inr: numberValue(row['Detention Amount']),
    damage_claim_inr: numberValue(row['Damage Claim']),
    shipment_status: row['Shipment Status'],
    documents_status: row['Documents Status']
  })).filter(row => row.bl_no || row.vendor_name);
  const totals = rows.reduce((total, row) => ({
    duty_amount_inr: total.duty_amount_inr + row.duty_amount_inr,
    total_be_amount_inr: total.total_be_amount_inr + row.total_be_amount_inr,
    landing_cost_inr: total.landing_cost_inr + row.landing_cost_inr,
    detention_amount_inr: total.detention_amount_inr + row.detention_amount_inr,
    damage_claim_inr: total.damage_claim_inr + row.damage_claim_inr,
    qty: total.qty + row.invoice_qty_mt
  }), { duty_amount_inr: 0, total_be_amount_inr: 0, landing_cost_inr: 0, detention_amount_inr: 0, damage_claim_inr: 0, qty: 0 });
  totals.avg_landing_cost_per_kg = totals.qty ? totals.landing_cost_inr / (totals.qty * 1000) : 0;
  return { fy: '2025-26', asOn: new Date().toISOString().slice(0, 10), rows, totals };
}

function liveOverview(buffer) {
  const oneView = liveOneView(buffer);
  const costing = liveShipmentCosting(buffer);
  const planning = liveFundPlanning(buffer);
  const statusCount = (field, value) => oneView.rows.filter(row => String(row[field]).toLowerCase() === value.toLowerCase()).length;
  const vendors = {};
  oneView.rows.forEach(row => { vendors[row.vendor_name] = (vendors[row.vendor_name] || 0) + 1; });
  const topVendors = Object.entries(vendors).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([vendor, bl_count]) => ({ vendor, bl_count }));
  return {
    asOn: new Date().toISOString().slice(0, 10),
    portfolio_snapshot: {
      total_bl_records: oneView.rows.length,
      total_containers: oneView.rows.reduce((sum, row) => sum + row.no_of_containers, 0),
      active_orders: oneView.rows.filter(row => String(row.order_status).toLowerCase() === 'active').length,
      closed_orders: oneView.rows.filter(row => String(row.order_status).toLowerCase() === 'closed').length
    },
    shipment_docs_status: {
      delivered: statusCount('shipment_status', 'Delivered'),
      in_transit: statusCount('shipment_status', 'In-Transit'),
      documents_released: statusCount('documents_status', 'Released'),
      documents_at_bank: statusCount('documents_status', 'At Bank'),
      documents_at_seller: statusCount('documents_status', 'At Seller')
    },
    cost_duty_summary: {
      total_landing_cost_inr: costing.totals.landing_cost_inr,
      avg_landing_cost_per_kg: costing.totals.avg_landing_cost_per_kg,
      total_duty_amount_inr: costing.totals.duty_amount_inr,
      total_detention_amount_inr: costing.totals.detention_amount_inr,
      total_damage_claims_inr: costing.totals.damage_claim_inr,
      total_fund_required_inr: planning.totals.total_required_inr
    },
    top_vendors: topVendors
  };
}

async function getLiveData(name) {
  const buffer = await downloadWorkbook();
  if (name === 'consolidated_mis') return liveOverview(buffer);
  if (name === 'daily_fund_outflow') return liveDailyFundOutflow(buffer);
  if (name === 'fund_planning') return liveFundPlanning(buffer);
  if (name === 'one_view') return liveOneView(buffer);
  if (name === 'shipment_costing') return liveShipmentCosting(buffer);
  throw new Error(`Live mapping is not available for ${name}`);
}

function buildLoginPage(errorMessage = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Marfani Steel Group Admin Login</title>
  <style>
    :root {
      --bg: #12161b;
      --panel: #181d24;
      --panel-border: #323d48;
      --ink: #eef0f2;
      --muted: #8b95a1;
      --amber: #e08a3e;
      --amber-soft: rgba(224,138,62,0.12);
      --red: #cc5f56;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: var(--bg);
      color: var(--ink);
      font-family: Arial, sans-serif;
    }
    .login-shell {
      width: min(420px, calc(100vw - 24px));
      background: var(--panel);
      border: 1px solid var(--panel-border);
      border-radius: 12px;
      padding: 28px 24px;
      box-shadow: 0 18px 40px rgba(0,0,0,0.25);
    }
    h1 {
      margin: 0 0 8px;
      font-size: 28px;
      letter-spacing: 0.04em;
    }
    p {
      margin: 0 0 20px;
      color: var(--muted);
      font-size: 14px;
    }
    form {
      display: grid;
      gap: 16px;
    }
    label {
      display: grid;
      gap: 8px;
      font-size: 13px;
      color: #dfe5eb;
    }
    input {
      width: 100%;
      padding: 12px 14px;
      border-radius: 8px;
      border: 1px solid var(--panel-border);
      background: #10161b;
      color: var(--ink);
      font-size: 15px;
    }
    input:focus {
      outline: 2px solid var(--amber);
      outline-offset: 1px;
      border-color: var(--amber);
    }
    button {
      border: 0;
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 15px;
      font-weight: 600;
      color: #111a1d;
      background: var(--amber);
      cursor: pointer;
    }
    .error {
      min-height: 20px;
      color: var(--red);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="login-shell">
    <h1>Admin Login</h1>
    <p>Marfani Steel Group Management Reporting Deck</p>
    <form method="POST" action="/login">
      <label>
        Admin ID
        <input name="username" type="text" value="Admin" required />
      </label>
      <label>
        Password
        <input name="password" type="password" value="Marfani@12345" required />
      </label>
      <div class="error">${errorMessage}</div>
      <button type="submit">Login</button>
    </form>
  </div>
</body>
</html>`;
}

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

function getSessionUser(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookie = cookieHeader.split(';').map(item => item.trim()).find(item => item.startsWith(`${AUTH_COOKIE}=`));
  if (!cookie) return null;

  const encoded = decodeURIComponent(cookie.split('=')[1]);
  if (!encoded) return null;

  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const [username, password] = decoded.split(':');
    const account = USERS[username];
    if (!account || account.password !== password) return null;
    return { username, role: account.role, permissions: account.permissions || [] };
  } catch (error) {
    return null;
  }
}

app.get('/login', (req, res) => {
  if (getSessionUser(req)) return res.redirect('/');
  res.type('html').send(buildLoginPage());
});

app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const account = USERS[username];
  if (account && account.password === password) {
    const value = Buffer.from(`${username}:${password}`).toString('base64');
    res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax`);
    return res.redirect('/');
  }

  res.status(401).type('html').send(buildLoginPage('Invalid admin ID or password.'));
});

app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`);
  res.redirect('/login');
});

app.use((req, res, next) => {
  if (req.path === '/login' || req.path === '/logout') return next();
  if (getSessionUser(req)) return next();
  return res.redirect('/login');
});

app.get('/api/session', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, username: user.username, role: user.role, permissions: user.permissions });
});

app.get('/api/live-data/:name', async (req, res) => {
  const session = getSessionUser(req);
  if (!session) return res.status(401).json({ error: 'Login required.' });
  try {
    res.json(await getLiveData(req.params.name));
  } catch (error) {
    console.error(`Live workbook unavailable for ${req.params.name}:`, error.message);
    try {
      res.setHeader('X-Data-Source', 'static-fallback');
      res.json(loadStaticReport(req.params.name));
    } catch (fallbackError) {
      res.status(502).json({ error: fallbackError.message });
    }
  }
});

app.get('/api/users', (req, res) => {
  const session = getSessionUser(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  res.json(Object.entries(USERS).map(([username, account]) => ({
    username,
    role: account.role,
    permissions: account.permissions || []
  })));
});

app.patch('/api/users/:username/permissions', (req, res) => {
  const session = getSessionUser(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });

  const username = req.params.username;
  const account = USERS[username];
  if (!account) return res.status(404).json({ error: 'User not found.' });
  if (account.role === 'admin') return res.status(400).json({ error: 'Admin permissions cannot be changed.' });

  const { entry, approval } = req.body || {};
  account.permissions = [entry ? 'entry' : '', approval ? 'approval' : ''].filter(Boolean);
  fs.writeFileSync(path.join(__dirname, 'data', 'users.json'), `${JSON.stringify(USERS, null, 2)}\n`);
  res.json({ username, role: account.role, permissions: account.permissions });
});

app.post('/api/users', (req, res) => {
  const session = getSessionUser(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });

  const { username, password, entry, approval } = req.body || {};
  const cleanUsername = String(username || '').trim();
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(cleanUsername) || String(password || '').length < 8) {
    return res.status(400).json({ error: 'Use a username of 3-32 letters/numbers and a password of at least 8 characters.' });
  }
  if (USERS[cleanUsername]) return res.status(409).json({ error: 'That user already exists.' });

  USERS[cleanUsername] = {
    password: String(password),
    role: 'viewer',
    permissions: [entry ? 'entry' : '', approval ? 'approval' : ''].filter(Boolean)
  };
  fs.writeFileSync(path.join(__dirname, 'data', 'users.json'), `${JSON.stringify(USERS, null, 2)}\n`);
  res.status(201).json({ username: cleanUsername, role: 'viewer', permissions: USERS[cleanUsername].permissions });
});

app.use(express.static(path.join(__dirname)));

// SPA fallback: any unknown route serves the shell so client-side hash routing works.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Marfani Steel Group Reporting Deck running on port ${PORT}`);
});
