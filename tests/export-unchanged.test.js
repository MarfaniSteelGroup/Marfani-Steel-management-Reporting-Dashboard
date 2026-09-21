const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const utilsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');

class FakeCell {
  constructor(text = '') {
    this.textContent = text;
    this.style = {};
    this.children = [];
  }
  cloneNode() {
    return new FakeCell(this.textContent);
  }
}

class FakeRow {
  constructor(cells = []) {
    this.children = cells;
  }
  cloneNode() {
    return new FakeRow(this.children.map((cell) => cell.cloneNode()));
  }
}

class FakeTable {
  constructor(headers, rows) {
    this.style = {};
    this.headers = headers;
    this.rows = rows;
  }
  cloneNode() {
    return new FakeTable(this.headers.map((cell) => cell.cloneNode()), this.rows.map((row) => row.cloneNode()));
  }
  querySelectorAll(selector) {
    if (selector === 'th, td') {
      const cells = [];
      for (const row of this.rows) cells.push(...row.children);
      return cells;
    }
    if (selector === 'tr') return [...this.headers.map((cell) => ({ children: [cell] })), ...this.rows];
    return [];
  }
}

test('Active export selector chooses the current dashboard section table without stripping columns', () => {
  const stageTable = {
    closest: () => ({})
  };

  const otherTable = {
    closest: () => ({})
  };

  const context = {
    console,
    Date,
    fetch: async () => ({ ok: false }),
    window: {},
    document: {
      querySelector: (selector) => {
        if (selector === '#stage .table-wrap table' || selector === '#stage table') return stageTable;
        if (selector === '.fp-print-area table') return stageTable;
        return null;
      },
      querySelectorAll: () => [stageTable, otherTable]
    }
  };

  vm.createContext(context);
  vm.runInContext(utilsSource, context);

  const selected = vm.runInContext('getActiveTableForExport()', context);
  assert.strictEqual(selected, stageTable);
});

test('Print/PDF/XLSX export keeps only the visible S.N. through Remarks range and leaves screen data unchanged', () => {
  const headers = [
    'S.N.', 'Last 6 Digit BL No.', 'Order Status', 'Party Name', 'Composition / Grade', 'Inty Name', 'No. of Cont.',
    'Container ETA', 'Free Till', 'CHA Name', 'Qty in KGS', 'Rate per MTS (in USD)', 'DUTY AMT APPROX in INR',
    'Advance paid in USD', 'AMOUNT TO BE PAID IN USD', 'Amount payable in INR (APPROX)', 'Total Amount required (INR)',
    'HSS Agmt', 'Remarks', 'SIMS Status', 'Payment Term', 'BOE Status', 'Current Documents Status', 'DO Payment Status', 'SO No.'
  ].map((title) => new FakeCell(title));

  const rows = [
    new FakeRow([
      new FakeCell('1'), new FakeCell('422627'), new FakeCell('Active'), new FakeCell('AQG'), new FakeCell('SS 316'),
      new FakeCell('MSPL'), new FakeCell('1'), new FakeCell('15-09-26'), new FakeCell('29-09-26'), new FakeCell('CityLink'),
      new FakeCell('17,135'), new FakeCell('8,750.00'), new FakeCell('4,01,757.24'), new FakeCell('500.00'),
      new FakeCell('24,799.49'), new FakeCell('21,82,354.72'), new FakeCell('25,84,111.97'), new FakeCell('Yes'),
      new FakeCell('Bill Lodged but Payment Pending'), new FakeCell('OK'), new FakeCell('Bank'), new FakeCell('Received'),
      new FakeCell('Current'), new FakeCell('Paid'), new FakeCell('1620020986')
    ])
  ];

  const table = new FakeTable(headers, rows);
  const exportRange = { start: 0, end: 18 };
  const cloned = table.cloneNode();

  const visibleHeaders = cloned.headers.filter((_, idx) => idx >= exportRange.start && idx <= exportRange.end);
  const visibleRowCells = cloned.rows[0].children.filter((_, idx) => idx >= exportRange.start && idx <= exportRange.end);

  assert.equal(visibleHeaders.length, 19);
  assert.equal(visibleRowCells.length, 19);
  assert.equal(visibleRowCells[18].textContent, 'Bill Lodged but Payment Pending');
});
