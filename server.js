// Minimal static file server for the Marfani Steels Reporting Deck.
// Works locally (npm start) and on Render as a Web Service.
const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const XLSX = require('xlsx');

const ADMIN_USERNAME = 'Admin';
const ADMIN_PASSWORD = 'Marfani@12345';
const AUTH_COOKIE = 'marfani_admin_session';
const USERS = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf8'));
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null;
const DEFAULT_LIVE_WORKBOOK_URL = 'https://raw.githubusercontent.com/MarfaniSteelGroup/import-monitoring-data/main/Import%20Monitoring.xlsx.xlsm';
const configuredWorkbookUrl = (process.env.LIVE_WORKBOOK_URL || '').trim();
const LIVE_WORKBOOK_URL = configuredWorkbookUrl || DEFAULT_LIVE_WORKBOOK_URL;
const CONTAINER_CST_URL = LIVE_WORKBOOK_URL;
const ENABLE_LIVE_WORKBOOK = String(process.env.ENABLE_LIVE_WORKBOOK || '').toLowerCase() === 'true';

function normalizeWorkbookUrl(url) {
  if (!url) return url;
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  if (trimmed.includes('drive.google.com/file/d/')) {
    const match = trimmed.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
    if (match) return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  }

  if (trimmed.includes('drive.google.com/open?id=')) {
    const match = trimmed.match(/[?&]id=([A-Za-z0-9_-]+)/);
    if (match) return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  }

  if (trimmed.includes('drive.google.com/uc?')) {
    return trimmed;
  }

  if (trimmed.includes('github.com/') && trimmed.includes('/blob/')) {
    const match = trimmed.match(/^https?:\/\/github\.com\/(.+?)\/blob\/(.+)$/i);
    if (match) {
      const [, repoPath, branchAndFile] = match;
      return `https://raw.githubusercontent.com/${repoPath}/${branchAndFile}`;
    }
  }

  if ((trimmed.includes('sharepoint.com') || trimmed.includes('onedrive.live.com')) && !/[?&]download=1/.test(trimmed)) {
    return `${trimmed}${trimmed.includes('?') ? '&' : '?'}download=1`;
  }

  if (trimmed.includes('dropbox.com') && !/[?&]dl=1/.test(trimmed)) {
    return `${trimmed}${trimmed.includes('?') ? '&' : '?'}dl=1`;
  }

  return trimmed;
}

function getWorkbookDownloadCandidates(url) {
  const normalized = normalizeWorkbookUrl(url);
  const candidates = new Set([normalized]);

  if (normalized.includes('sharepoint.com') || normalized.includes('onedrive.live.com')) {
    candidates.add(`${normalized}${normalized.includes('?') ? '&' : '?'}download=1`);
    candidates.add(normalized.replace(/([?&])download=1/, '$1download=1'));
  }

  if (normalized.includes('drive.google.com/uc?')) {
    const directUrl = new URL(normalized);
    directUrl.searchParams.set('export', 'download');
    directUrl.searchParams.set('confirm', '1');
    candidates.add(directUrl.toString());
  }

  return [...candidates];
}

const app = express();
const PORT = process.env.PORT || 3000;

async function initializeUserStore() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      username VARCHAR(32) PRIMARY KEY,
      password TEXT NOT NULL,
      display_name VARCHAR(80) NOT NULL DEFAULT '',
      role VARCHAR(20) NOT NULL,
      permissions JSONB NOT NULL DEFAULT '[]'::jsonb
    )
  `);
  await pool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS display_name VARCHAR(80) NOT NULL DEFAULT ''`);
  for (const [username, account] of Object.entries(USERS)) {
    await pool.query(`
      INSERT INTO app_users (username, password, display_name, role, permissions)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, display_name = EXCLUDED.display_name, role = EXCLUDED.role, permissions = EXCLUDED.permissions
    `, [username, account.password, account.display_name || username, account.role, JSON.stringify(account.permissions || [])]);
  }
  const result = await pool.query('SELECT username, password, display_name, role, permissions FROM app_users');
  Object.keys(USERS).forEach(username => delete USERS[username]);
  result.rows.forEach(account => { USERS[account.username] = { ...account, display_name: account.display_name || account.username }; });
}

async function saveUser(account) {
  if (pool) {
    await pool.query(`
      INSERT INTO app_users (username, password, display_name, role, permissions)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, display_name = EXCLUDED.display_name, role = EXCLUDED.role, permissions = EXCLUDED.permissions
    `, [account.username, account.password, account.display_name || account.username, account.role, JSON.stringify(account.permissions || [])]);
    return;
  }
  fs.writeFileSync(path.join(__dirname, 'data', 'users.json'), `${JSON.stringify(USERS, null, 2)}\n`);
}

async function listUsers() {
  if (!pool) return Object.entries(USERS).map(([username, account]) => ({ username, display_name: account.display_name || username, role: account.role, permissions: account.permissions || [] }));
  const result = await pool.query('SELECT username, display_name, role, permissions FROM app_users ORDER BY display_name, username');
  return result.rows;
}

function requestBinaryUrl(workbookUrl, timeoutMs = 22000, seen = new Set()) {
  const normalisedUrl = String(workbookUrl).trim();
  if (seen.has(normalisedUrl)) {
    return Promise.reject(new Error(`Workbook redirect loop detected for ${normalisedUrl}`));
  }

  return new Promise((resolve, reject) => {
    const transport = normalisedUrl.startsWith('https:') ? require('https') : require('http');
    const req = transport.get(normalisedUrl, {
      headers: {
        Accept: 'application/vnd.ms-excel.sheet.macroEnabled.12,application/octet-stream,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*',
        'User-Agent': 'Mozilla/5.0 Marfani-Steel-Reporting',
        'Cache-Control': 'no-cache'
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || '';
        const finalUrl = res.headers.location ? new URL(res.headers.location, normalisedUrl).toString() : normalisedUrl;

        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = new URL(res.headers.location, normalisedUrl).toString();
          if (seen.size >= 10) {
            return reject(new Error(`Workbook redirect limit exceeded while fetching ${normalisedUrl}`));
          }
          const nextSeen = new Set(seen);
          nextSeen.add(normalisedUrl);
          return requestBinaryUrl(nextUrl, timeoutMs, nextSeen)
            .then(resolve)
            .catch(reject);
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Workbook download failed with status ${res.statusCode} for ${finalUrl}`));
        }

        resolve({ buffer, contentType, finalUrl });
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Workbook request timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);
  });
}

let workbookBufferCache = null;
let workbookBufferPromise = null;
let liveDataCache = {};

async function getWorkbookBuffer(forceRefresh = false) {
  if (!forceRefresh && workbookBufferCache) return workbookBufferCache;
  if (!forceRefresh && workbookBufferPromise) return workbookBufferPromise;

  workbookBufferPromise = (async () => {
    const candidates = getWorkbookDownloadCandidates(LIVE_WORKBOOK_URL);
    let lastError = null;

    for (const workbookUrl of candidates) {
      try {
        const { buffer, contentType, finalUrl } = await requestBinaryUrl(workbookUrl, 22000);
        const isExcelBinary = contentType.includes('excel') || contentType.includes('spreadsheet') || contentType.includes('octet-stream') || buffer.slice(0, 2).toString() === 'PK';
        const isLoginPage = /sign in|login.microsoftonline.com|oauth2|microsoftonline/i.test(buffer.toString('utf8', 0, 2500));

        if (!isExcelBinary || isLoginPage) {
          throw new Error(`The workbook URL did not return an actual Excel file. Received: ${contentType || 'unknown'} from ${finalUrl}`);
        }

        if (!buffer.length) {
          throw new Error('Downloaded workbook is empty. Check the LIVE_WORKBOOK_URL in the deployment environment.');
        }

        workbookBufferCache = buffer;
        return buffer;
      } catch (error) {
        lastError = error;
        console.warn(`Live workbook fetch attempt failed for ${workbookUrl}:`, error.message);
      }
    }

    throw new Error(lastError ? lastError.message : 'Unable to download the live workbook. Update LIVE_WORKBOOK_URL to a public Excel file URL.');
  })();

  try {
    return await workbookBufferPromise;
  } finally {
    workbookBufferPromise = null;
  }
}

async function downloadWorkbook(forceRefresh = false) {
  return getWorkbookBuffer(forceRefresh);
}

function loadStaticReport(name) {
  const filePath = path.join(__dirname, 'data', `${name}.json`);
  return normalizeReportContent(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function textValue(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '');
}

function normalizePartyName(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text) return '';

  const compact = text.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (compact.includes('alqaryangroup') || compact.includes('alqaryangroupfortradingindustrycontracting')) {
    return 'AQG';
  }

  return text;
}

function normalizeReportContent(report) {
  if (!report || typeof report !== 'object') return report;

  if (Array.isArray(report.rows)) {
    report.rows = report.rows.map(row => {
      if (!row || typeof row !== 'object') return row;
      if ('party_name' in row) row.party_name = normalizePartyName(row.party_name);
      if ('vendor_name' in row) row.vendor_name = normalizePartyName(row.vendor_name);
      if ('seller_name' in row) row.seller_name = normalizePartyName(row.seller_name);
      if ('seller' in row) row.seller = normalizePartyName(row.seller);
      return row;
    });
  }

  return report;
}

function readWorkbook(buffer) {
  return XLSX.read(buffer, { type: 'buffer', cellDates: true, dense: true, raw: false });
}

function liveRows(buffer, sheetName, headerRow) {
  const workbook = readWorkbook(buffer);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Workbook sheet not found: ${sheetName}`);
  return XLSX.utils.sheet_to_json(sheet, { range: headerRow, defval: '', raw: false });
}

function liveColumnValues(buffer, sheetName, headerRow, columnIndex) {
  const workbook = readWorkbook(buffer);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Workbook sheet not found: ${sheetName}`);
  const rows = XLSX.utils.sheet_to_json(sheet, { range: headerRow, header: 1, defval: '', raw: false });
  return rows.slice(1).map(row => row[columnIndex]);
}

function pickValue(row, aliases) {
  const normalized = Object.entries(row).reduce((map, [key, value]) => {
    map[String(key).trim().toLowerCase().replace(/[^a-z0-9]+/g, '')] = value;
    return map;
  }, {});

  for (const alias of aliases) {
    const direct = row[alias];
    if (direct !== undefined && direct !== null && direct !== '') return direct;

    const compactAlias = String(alias).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (normalized[compactAlias] !== undefined && normalized[compactAlias] !== null && normalized[compactAlias] !== '') {
      return normalized[compactAlias];
    }
  }

  return undefined;
}

function findWorkbookSheet(workbook, candidates) {
  const normalizedNames = workbook.SheetNames.map((name) => String(name).trim());
  const match = candidates.find((candidate) => normalizedNames.some((name) => name.toLowerCase() === candidate.toLowerCase() || name.toLowerCase().includes(candidate.toLowerCase().replace(/[^a-z0-9]/g, ''))));
  if (match) return match;

  const sheetKey = candidates.map((candidate) => String(candidate).toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const name of normalizedNames) {
    const compact = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (sheetKey.some((key) => compact.includes(key))) return name;
  }

  return workbook.SheetNames[0] || null;
}

function liveFundPlanning(buffer) {
  const workbook = readWorkbook(buffer);
  const sheetName = findWorkbookSheet(workbook, ['Fund Planning Report', 'Fund Planning', 'Compele Data Sheet', 'Complete Data Sheet', 'Complete Data']);
  if (!sheetName) {
    throw new Error('No supported workbook sheet was found for fund planning data.');
  }

  const dataRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { range: 4, defval: '' });
  const sampleHeader = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { range: 2, header: 1, defval: '' })[0] || [];

  const rows = dataRows.map((row, index) => {
    const qtyValue = pickValue(row, ['Total BL Qty.\r\nIn KGS', 'Total BL Qty. In KGS', 'Total BL Qty. in KGS', 'Qty in KGS', 'Qty In KGS', 'Qty (KGS)', 'Qty (KGS) ', 'Qty In Kgs']) || pickValue(row, ['(as per SO) QTY\r\nIN MT', '(as per SO) QTY\nIN MT', '(as per SO) QTY IN MT', 'QTY IN MT']);
    const amountToBePaidUsd = numberValue(pickValue(row, ['AMOUNT TO BE PAID IN USD', 'Amount to be Paid (USD)', 'Amount To Be Paid In USD', 'Amount to be Paid in USD', 'Amount To Be Paid In US$', 'Final Amount Paid in USD', 'Amount After ADV deduction']));
    const rateValue = numberValue(
      pickValue(row, [
        'Rate per MTS (in USD)', 'Rate per MTS (USD)', 'Rate per MTS in USD', 'Rate Per MTS', 'Rate / MTS',
        'Rate as per SO in USD', 'Rate as per SO (USD)', 'Rate As Per SO (USD)', 'Rate per SO in USD',
        'Rate as per SO in us$', 'Rate as per SO us$', 'Rate per SO', 'Rate in USD', 'Rate USD', '(as per SO) Rate'
      ]) ?? pickValue(row, ['rate as per so in usd', 'rate as per so usd', 'rate as per so (usd)', 'rate as per so in us$', 'rate per so in usd', 'rate per so usd', 'rate in usd', 'rate usd']) ?? (sampleHeader[17] && row[sampleHeader[17]])
    );

    const advanceValue = pickValue(row, [
      'Advance Amount Paid (USD)', 'Advance Amount Paid', 'Advance amount paid', 'Advance amount paid (USD)',
      'Advance amount paid usd', 'Advance amount paid in usd', 'Advance paid', 'Advance paid (USD)',
      'Advance Paid USD', 'Advance Amount', 'Advance Amt Paid', 'Advance Amount'
    ]);
    const advanceAmountPaidUsd = advanceValue !== undefined ? numberValue(advanceValue) : 0;

    const partyAliasValue = pickValue(row, [
      'Seller Name (Short)',
      'Seller name (Short)',
      'Seller Name (Shot)',
      'Seller name (Shot)',
      'Seller Name\r\n(Short)',
      'Seller Name\r\n(Shot)',
      'Seller Name',
      'Party Name',
      'Party',
      'Party Name ',
      'Part Name'
    ]);
    const partyFromHeaderIndex = sampleHeader && sampleHeader[14] !== undefined ? row[sampleHeader[14]] : undefined;
    const partyName = (partyAliasValue !== undefined && partyAliasValue !== null && String(partyAliasValue).trim() !== '')
      ? String(partyAliasValue).trim()
      : (partyFromHeaderIndex !== undefined && partyFromHeaderIndex !== null && String(partyFromHeaderIndex).trim() !== '')
        ? String(partyFromHeaderIndex).trim()
        : '';
    const composition = pickValue(row, ['COMPOSTION', 'Pruduct Name As per SO', 'Composition/Grade', 'Composition / Grade', 'Composition', 'Composition Grade', 'Grade', 'Product Name As per SO']);
    const entity = pickValue(row, ['Intity Name', 'Entity', 'Entity Name', 'Intity Name ']);
    const containerEta = pickValue(row, ['ETA', 'Container ETA', 'Cont ETA Date', 'ETA Date', 'Cont. ETA Date']);
    const freeTill = pickValue(row, ['Free Till Date', 'Free Till', 'Free Till ', 'Free Till Date ']);
    const chaName = pickValue(row, ['CHA Name', 'CHA Name\r\n(Short)', 'CHA Name (Short)', 'CHA', 'Cha Name']);
    const remarks = pickValue(row, ['Remarks', 'Remark', 'Remarks2', 'Remarks 2', 'Remark 2', 'DN Remarks', 'Reason for Dammage']);
    const hss = pickValue(row, ['HSS', 'HSS Status', 'HSS Value', 'Hss', 'HSS Agmt']);
    const sims = pickValue(row, ['SIMS', 'Sims', 'SIMS Status', 'SIMS Amount']);
    const payment = pickValue(row, ['Payment', 'Payment Status', 'Payment BO', 'DO Payment Status', 'DO Payment']);
    const boe = pickValue(row, ['BOE No.', 'BOE No', 'BOE', 'BO', 'BO Status']);
    const currentDocument = pickValue(row, ['Current Document', 'Current Doc', 'Current Document status', 'Current Document Status']);
    const doPaymentStatus = pickValue(row, ['DO Payment Status', 'DO Payment', 'Payment DO', 'DO Payment status']);

    const dutyApproxInr = numberValue(pickValue(row, ['DUTY AMOUNT', 'DUTY AMT APPROX in INR', 'Duty Approx. (INR)', 'Duty Approximation in INR', 'DUTY AMT APPROX', 'Duty Amt Approx INR', 'Duty Amount Approx IN INR']));
    const payableInr = numberValue(pickValue(row, ['Amount payable in INR (APPROX)', 'Amount Payable (INR)', 'Amount payable in INR', 'Amount payable in INR (approx)', 'Amount Payable in INR', 'Amount payable approx in INR', 'Final Amount Paid in INR', 'Total BOE Amount', 'Amount After ADV deduction']));
    const totalRequired = numberValue(pickValue(row, ['Total Amount required (In INR)', 'Total Amount required (INR)', 'Total Amount required\n(In INR)', 'Total Amount required in INR', 'Total Amount Required (INR)', 'Total Amount (INR Approx.)', 'Total Amount required', 'Total BOE Amount', 'Total BOE Taxable Value']));

    return {
      sn: pickValue(row, ['S. N.', 'S.No.', 'S No.', 'SN']) || index + 1,
      bl_no: pickValue(row, ['Last 6 Digit BL No.', 'Last 6 Digit BL No', 'Last 6 Digit BL. No.', 'BL No.', 'Last 6 Digit BL No. ']) || pickValue(row, ['BL Number', 'BL No']),
      order_status: pickValue(row, ['Order Status', 'Status', 'Order status']),
      so_no: pickValue(row, ['SO  No.', 'SO No.', 'Sales Order No.', 'SO No', 'SO Number', 'Sales Order No. ', 'SO no']),
      party_name: normalizePartyName(partyName),
      composition,
      entity,
      rate_as_per_so_usd: rateValue,
      no_of_cont: numberValue(pickValue(row, ['Nos of Container', 'No. of Cont.', 'No of Cont.', 'No. of Cont', 'No of Cont', 'No.of Cont', 'No of Containers', 'No of Container'])),
      container_eta: containerEta,
      free_till: freeTill,
      cha_name: chaName,
      qty_kgs: numberValue(qtyValue),
      duty_approx_inr: dutyApproxInr,
      amount_usd: amountToBePaidUsd,
      advance_amount_paid_usd: advanceAmountPaidUsd,
      amount_payable_inr: payableInr,
      total_required_inr: totalRequired,
      hss,
      sims,
      payment,
      bo: boe,
      boe,
      current_document: currentDocument,
      do_payment_status: doPaymentStatus,
      remarks,
      remarks2: remarks,
      rate_per_mts_usd: rateValue,
      mts: pickValue(row, ['MTS', 'Mts', 'RATE PER MTS', 'Rate Per MTS'])
    };
  }).filter(row => row.bl_no || row.party_name);

  return {
    asOn: new Date().toISOString().slice(0, 10),
    rows,
    totals: rows.reduce((totals, row) => ({
      duty_approx_inr: totals.duty_approx_inr + (row.duty_approx_inr || 0),
      amount_usd: totals.amount_usd + (row.amount_usd || 0),
      rate_as_per_so_usd: totals.rate_as_per_so_usd + (row.rate_as_per_so_usd || 0),
      advance_amount_paid_usd: totals.advance_amount_paid_usd + (row.advance_amount_paid_usd || 0),
      amount_payable_inr: totals.amount_payable_inr + (row.amount_payable_inr || 0),
      total_required_inr: totals.total_required_inr + (row.total_required_inr || 0)
    }), { duty_approx_inr: 0, amount_usd: 0, rate_as_per_so_usd: 0, advance_amount_paid_usd: 0, amount_payable_inr: 0, total_required_inr: 0 })
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
    vendor_name: normalizePartyName(row['Vendor name']),
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
    vendor_name: normalizePartyName(row['Vendor name']),
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

async function getLiveData(name, options = {}) {
  const { forceRefresh = false } = options;
  const cacheKey = `${name}:${forceRefresh ? 'refresh' : 'cached'}`;
  const cached = liveDataCache[cacheKey];
  const now = Date.now();

  if (!forceRefresh && cached && now - cached.fetchedAt < 300000) {
    return cached.data;
  }

  if (!ENABLE_LIVE_WORKBOOK) {
    const fallback = loadStaticReport(name);
    liveDataCache[cacheKey] = { data: fallback, fetchedAt: now };
    return fallback;
  }

  const buffer = await getWorkbookBuffer(forceRefresh);
  let data;
  if (name === 'consolidated_mis') data = liveOverview(buffer);
  else if (name === 'daily_fund_outflow') data = liveDailyFundOutflow(buffer);
  else if (name === 'fund_planning') data = liveFundPlanning(buffer);
  else if (name === 'one_view') data = liveOneView(buffer);
  else if (name === 'shipment_costing') data = liveShipmentCosting(buffer);
  else throw new Error(`Live mapping is not available for ${name}`);

  liveDataCache[cacheKey] = { data, fetchedAt: now };
  return data;
}

function buildLoginPage(errorMessage = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Marfani Steel Group User Login</title>
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
    <h1>User Login</h1>
    <p>Marfani Steel Group Management Reporting Deck</p>
    <form method="POST" action="/login">
      <label>
        User ID
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
    return { username, display_name: account.display_name || username, role: account.role, permissions: account.permissions || [] };
  } catch (error) {
    return null;
  }
}

app.get('/login', (req, res) => {
  if (getSessionUser(req)) return res.redirect('/');
  res.type('html').send(buildLoginPage());
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  let account = USERS[username];
  if (pool) {
    const result = await pool.query('SELECT username, password, display_name, role, permissions FROM app_users WHERE username = $1', [username]);
    account = result.rows[0];
  }
  if (account && account.password === password) {
    const value = Buffer.from(`${username}:${password}`).toString('base64');
    res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax`);
    return res.redirect('/');
  }

  res.status(401).type('html').send(buildLoginPage('Invalid user ID or password.'));
});

app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`);
  res.redirect('/login');
});

app.use('/data', express.static(path.join(__dirname, 'data')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/css', express.static(path.join(__dirname, 'css')));

app.use((req, res, next) => {
  const publicPaths = [
    '/login',
    '/logout',
    '/api/session',
    '/api/live-data',
    '/api/report-data',
    '/data/',
    '/js/',
    '/css/',
    '/download/'
  ];

  const isPublic = publicPaths.some(prefix => req.path === prefix.replace(/\/$/, '') || req.path.startsWith(prefix));
  if (isPublic) return next();
  if (getSessionUser(req)) return next();
  return res.redirect('/login');
});

app.get('/api/session', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, username: user.username, display_name: user.display_name, role: user.role, permissions: user.permissions });
});

app.patch('/api/account/password', async (req, res) => {
  const session = getSessionUser(req);
  if (!session) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  const confirmPassword = String(req.body?.confirmPassword || '');
  if (currentPassword.length === 0 || newPassword.length < 8) {
    return res.status(400).json({ error: 'Enter your current password and a new password of at least 8 characters.' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'The new password and confirmation do not match.' });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'Your new password must be different from the current password.' });
  }

  const account = USERS[session.username];
  if (!account || account.password !== currentPassword) {
    return res.status(401).json({ error: 'The current password is incorrect.' });
  }

  account.password = newPassword;
  await saveUser({ username: session.username, ...account });
  const value = Buffer.from(`${session.username}:${newPassword}`).toString('base64');
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax`);
  res.json({ message: 'Password updated successfully.' });
});

app.get('/api/live-data/:name', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  try {
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    if (!ENABLE_LIVE_WORKBOOK) {
      const fallback = loadStaticReport(req.params.name);
      res.setHeader('X-Data-Source', 'static-fallback');
      return res.json(fallback);
    }
    res.setHeader('X-Data-Source', 'live-excel');
    res.json(await getLiveData(req.params.name, { forceRefresh }));
  } catch (error) {
    console.error(`Live workbook unavailable for ${req.params.name}. Update LIVE_WORKBOOK_URL to a public Excel file link or use the static JSON fallback.`, error.message);
    try {
      const fallback = loadStaticReport(req.params.name);
      res.setHeader('X-Data-Source', 'static-fallback');
      res.json(fallback);
    } catch (fallbackError) {
      const safeFallback = { asOn: new Date().toISOString().slice(0, 10), rows: [], totals: { duty_approx_inr: 0, amount_usd: 0, amount_payable_inr: 0, total_required_inr: 0 } };
      res.status(200).json(safeFallback);
    }
  }
});

app.get('/api/report-data/:name', (req, res) => {
  try {
    const data = loadStaticReport(req.params.name);
    res.setHeader('X-Data-Source', 'static-json-fallback');
    res.json(data);
  } catch (error) {
    res.status(404).json({ error: `Report not found: ${req.params.name}` });
  }
});

app.get('/api/users', async (req, res) => {
  const session = getSessionUser(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  res.json(await listUsers());
});

app.patch('/api/users/:username/permissions', async (req, res) => {
  const session = getSessionUser(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });

  const username = req.params.username;
  const account = USERS[username];
  if (!account) return res.status(404).json({ error: 'User not found.' });
  if (account.role === 'admin') return res.status(400).json({ error: 'Admin permissions cannot be changed.' });

  const { entry, approval } = req.body || {};
  account.permissions = [entry ? 'entry' : '', approval ? 'approval' : ''].filter(Boolean);
  await saveUser({ username, ...account });
  res.json({ username, role: account.role, permissions: account.permissions });
});

app.post('/api/users', async (req, res) => {
  const session = getSessionUser(req);
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });

  const { name, username, password, entry, approval } = req.body || {};
  const cleanName = String(name || '').trim();
  const cleanUsername = String(username || '').trim();
  if (cleanName.length < 2 || cleanName.length > 80 || !/^[A-Za-z0-9_-]{3,32}$/.test(cleanUsername) || String(password || '').length < 8) {
    return res.status(400).json({ error: 'Enter a name, a login ID of 3-32 letters/numbers, and a password of at least 8 characters.' });
  }
  if (USERS[cleanUsername] || (pool && (await pool.query('SELECT 1 FROM app_users WHERE username = $1', [cleanUsername])).rowCount)) {
    return res.status(409).json({ error: 'That user already exists.' });
  }

  const account = {
    username: cleanUsername,
    display_name: cleanName,
    password: String(password),
    role: 'viewer',
    permissions: [entry ? 'entry' : '', approval ? 'approval' : ''].filter(Boolean)
  };
  USERS[cleanUsername] = account;
  await saveUser(account);
  res.status(201).json({ username: cleanUsername, display_name: cleanName, role: 'viewer', permissions: account.permissions });
});

app.get('/download/container-cst', async (req, res) => {
  if (!CONTAINER_CST_URL) {
    return res.status(404).send('Container CST Excel file is not configured. Set CONTAINER_CST_URL to a public direct download URL.');
  }

  let lastError = null;
  for (const workbookUrl of getWorkbookDownloadCandidates(CONTAINER_CST_URL)) {
    try {
      const { buffer, contentType } = await requestBinaryUrl(workbookUrl, 22000);
      const isExcelBinary = contentType.includes('excel') || contentType.includes('spreadsheet') || contentType.includes('octet-stream') || buffer.slice(0, 2).toString() === 'PK';
      if (!isExcelBinary || /sign in|login.microsoftonline.com|oauth2|microsoftonline/i.test(buffer.toString('utf8', 0, 2500))) {
        throw new Error(`Download did not return an Excel file: ${contentType || 'unknown'} from ${workbookUrl}`);
      }
      res.setHeader('Content-Type', contentType || 'application/vnd.ms-excel');
      res.setHeader('Content-Disposition', 'attachment; filename="CONTAINER_CST_Final.xlsm"');
      return res.send(buffer);
    } catch (error) {
      lastError = error;
      console.warn('Container CST download attempt failed:', error.message);
    }
  }
  return res.status(502).send(`The public Excel file could not be downloaded. ${lastError ? lastError.message : ''}`);
});

app.use(express.static(path.join(__dirname)));

// SPA fallback: any unknown route serves the shell so client-side hash routing works.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

module.exports = {
  app,
  downloadWorkbook,
  getLiveData,
  liveFundPlanning,
  liveDailyFundOutflow,
  liveOneView,
  liveShipmentCosting,
  liveOverview,
  buildLoginPage,
  normalizePartyName
};

if (require.main === module) {
  initializeUserStore().then(() => app.listen(PORT, () => {
    console.log(`Marfani Steel Group Reporting Deck running on port ${PORT}`);
  })).catch(error => {
    console.error('User store initialization failed:', error);
    process.exit(1);
  });
}
