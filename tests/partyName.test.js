const assert = require('assert');
const XLSX = require('xlsx');
const { liveFundPlanning, normalizePartyName } = require('../server.js');

const filler1 = Array.from({ length: 20 }, () => 'FILLER_1');
const filler2 = Array.from({ length: 20 }, () => 'FILLER_2');
const filler3 = Array.from({ length: 20 }, () => 'FILLER_3');
const filler4 = Array.from({ length: 20 }, () => 'FILLER_4');
const header = Array.from({ length: 20 }, () => '');
header[14] = 'Party Name';
header[15] = 'Seller Name (Short)';
header[16] = 'Order Status';
header[17] = 'BL No.';
header[18] = 'Rate per MTS (in USD)';
header[19] = 'DUTY AMT APPROX in INR';
const dataRow = Array.from({ length: 20 }, () => '');
dataRow[14] = 'AL-QARYAN GROUP';
dataRow[15] = 'AQG';
dataRow[16] = 'Closed';
dataRow[17] = '422627';
dataRow[18] = '0';
dataRow[19] = '401757';

const ws = XLSX.utils.aoa_to_sheet([filler1, filler2, filler3, filler4, header, dataRow]);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, ws, 'Fund Planning');
const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

const result = liveFundPlanning(buffer);
assert.strictEqual(normalizePartyName('AL-QARYAN GROUP FOR TRADING, INDUSTRY & CONTRACTING'), 'AQG', 'Expected long legal name to normalize to AQG');
assert.strictEqual(result.rows[0].party_name, 'AQG', 'Expected short seller name to be preferred over the long party display name');
console.log('PARTY_NAME_TEST_OK', result.rows[0].party_name);
