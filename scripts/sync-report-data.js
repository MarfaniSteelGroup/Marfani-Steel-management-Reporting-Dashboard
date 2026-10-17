const fs = require('fs');
const path = require('path');
const {
  liveFundPlanning,
  liveOneView,
  liveShipmentCosting,
  liveOverview
} = require('../server');

const project = path.join(__dirname, '..');
const workbookPath = path.join(project, 'data', 'New Import Monitoring.xlsx');
const defaultUserSyncUrl = 'https://dashboard.marfanisteel.com/api/users/sync';

async function main() {
  const workbook = fs.readFileSync(workbookPath);
  const reports = {
    consolidated_mis: liveOverview(workbook),
    daily_fund_outflow: JSON.parse(fs.readFileSync(path.join(project, 'data', 'daily_fund_outflow.json'), 'utf8')),
    fund_planning: liveFundPlanning(workbook),
    one_view: liveOneView(workbook),
    shipment_costing: liveShipmentCosting(workbook)
  };
  const summary = Object.entries(reports)
    .map(([name, report]) => `${name}:${report.rows?.length ?? report.portfolio_snapshot?.total_bl_records ?? 0}`)
    .join(',');

  if (process.argv.includes('--dry-run')) {
    console.log(`REPORT_SYNC_DRY_RUN ${summary}`);
    return;
  }

  const tokenPath = path.join(project, '.users-sync-token');
  const token = (process.env.USER_SYNC_TOKEN || (fs.existsSync(tokenPath) ? fs.readFileSync(tokenPath, 'utf8').trim() : '')).trim();
  if (!token) throw new Error('USER_SYNC_TOKEN is not set and .users-sync-token was not found.');

  const syncUrl = process.env.REPORT_SYNC_URL || new URL('/api/reports/sync', process.env.USER_SYNC_URL || defaultUserSyncUrl).toString();
  const response = await fetch(syncUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Sync-Token': token
    },
    body: JSON.stringify({ reports })
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`Report snapshot upload failed with HTTP ${response.status}: ${responseText}`);
  console.log(`REPORT_SYNC_OK ${summary}`);
}

main().catch(error => {
  console.error('REPORT_SYNC_FAILED', error.message);
  process.exitCode = 1;
});