const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');

test('DataStore falls back to the API-backed static JSON route when live fetch fails', async () => {
  const context = {
    window: {},
    console,
    Date,
    fetch: async (url) => {
      if (String(url).startsWith('/api/live-data/')) {
        throw new Error('live fetch failed');
      }

      if (String(url) === '/api/report-data/consolidated_mis') {
        return {
          ok: true,
          headers: { get: () => 'static-api' },
          json: async () => ({
            asOn: '2026-09-21',
            portfolio_snapshot: {
              total_bl_records: 10,
              total_containers: 20,
              active_orders: 3,
              closed_orders: 7
            }
          })
        };
      }

      return {
        ok: false,
        status: 404,
        headers: { get: () => '' }
      };
    }
  };

  vm.createContext(context);
  vm.runInContext(source, context);
  const DataStore = vm.runInContext('DataStore', context);

  const data = await DataStore.load('consolidated_mis');
  assert.equal(data.asOn, '2026-09-21');
  assert.equal(data.portfolio_snapshot.total_bl_records, 10);
});
