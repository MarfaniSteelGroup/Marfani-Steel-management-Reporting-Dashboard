const assert = require('assert');
const { liveFundPlanning } = require('../server.js');

const workbookUrl = 'https://www.dropbox.com/scl/fi/fiiy3o6coteasonzw49tu/New-Import-Monitoring.xlsx?rlkey=kml4r6k2dtcq9c0bjw7ambt6o&st=zrxjnwlq&dl=1';

async function downloadWorkbook(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Workbook download failed with HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

(async () => {
  try {
    const buffer = await downloadWorkbook(workbookUrl);
    const data = liveFundPlanning(buffer);
    assert.ok(data.rows.length > 0, 'Expected live fund planning rows from workbook');
    const first = data.rows[0];
    assert.ok(first.bl_no, 'First row should include a BL number');
    assert.ok(first.order_status, 'First row should include an order status');
    assert.ok(!/AL-QARYAN GROUP/i.test(String(first.party_name || '')), 'Expected short seller-name value rather than the long display name');
    assert.ok(Number(first.amount_usd) >= 0 || Number(first.amount_payable_inr) >= 0, 'Expected numeric financial values');
    console.log(`LIVE_CHECK_OK rows=${data.rows.length} first_bl=${first.bl_no} party=${first.party_name}`);
  } catch (error) {
    console.error('LIVE_CHECK_FAILED');
    console.error(error.stack || error.message);
    process.exit(1);
  }
})();
