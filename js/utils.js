/* ---------------- formatting helpers ---------------- */

const fmt = {
  inr(v){
    if(v === null || v === undefined || v === '' || isNaN(v)) return '—';
    return '₹' + Number(v).toLocaleString('en-IN', {maximumFractionDigits:0});
  },
  usd(v){
    if(v === null || v === undefined || v === '' || isNaN(v)) return '—';
    return '$' + Number(v).toLocaleString('en-US', {maximumFractionDigits:2});
  },
  num(v, d=0){
    if(v === null || v === undefined || v === '' || isNaN(v)) return '—';
    return Number(v).toLocaleString('en-IN', {maximumFractionDigits:d, minimumFractionDigits:d});
  },
  raw(v){
    return (v === null || v === undefined || v === '') ? '—' : v;
  },
  pct(part, total){
    if(!total) return '0%';
    return Math.round((part/total)*100) + '%';
  }
};

function esc(s){
  if(s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function statusClass(s){
  if(!s) return '';
  return 'status-' + String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
}

function badge(s){
  if(!s) return '<span class="badge">—</span>';
  return `<span class="badge ${statusClass(s)}">${esc(s)}</span>`;
}

/* ---------------- data loading (cached) ---------------- */

const DataStore = (() => {
  const cache = {};
  const CACHE_TTL_MS = 60 * 1000;
  async function load(name){
    if(cache[name] && Date.now() - cache[name].loadedAt < CACHE_TTL_MS) return cache[name].data;
    try {
      const live = await fetch(`/api/live-data/${name}?refresh=${Date.now()}`, { cache: 'no-store' });
      if(live.ok){
        const json = await live.json();
        window.dashboardDataSource = live.headers.get('x-data-source') || 'live-excel';
        cache[name] = { data: json, loadedAt: Date.now() };
        return json;
      }
      console.warn(`Live workbook request failed for ${name}; using saved report data.`);
    } catch(error) {
      console.warn(`Live workbook unavailable for ${name}; using saved report data.`, error);
    }
    const fallbackUrls = [
      `/api/report-data/${name}`,
      `data/${name}.json`
    ];

    let lastFallbackError = null;
    for (const url of fallbackUrls) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        window.dashboardDataSource = url.startsWith('/api/') ? 'static-api' : 'static-fallback';
        cache[name] = { data: json, loadedAt: Date.now() };
        return json;
      } catch (error) {
        lastFallbackError = error;
        console.warn(`Saved report fallback failed for ${url}.`, error);
      }
    }

    throw new Error(`Failed to load ${name}: ${lastFallbackError ? lastFallbackError.message : 'unknown fallback error'}`);
  }
  return { load };
})();

/* ---------------- small DOM helpers ---------------- */

function el(html){
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function debounce(fn, ms=200){
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function getActiveTableForExport(){
  if (typeof document === 'undefined') return null;

  const currentStageTable = document.querySelector('#stage .table-wrap table') ||
    document.querySelector('#stage table') ||
    document.querySelector('.fp-print-area table');

  if (currentStageTable) return currentStageTable;

  const allTables = Array.from(document.querySelectorAll('table') || []);
  return allTables.find((table) => {
    const wrap = table.closest('.table-wrap, .fp-print-area, .panel');
    return !!wrap || table.offsetParent !== null;
  }) || allTables[0] || null;
}

const PALETTE = {
  amber: '#d99a57',
  steel: '#76a9c9',
  green: '#70b58d',
  red:   '#db7770',
  ink1:  '#d2dce5',
  ink2:  '#91a5b8',
  gridline: 'rgba(145,165,184,0.14)'
};

function chartDefaults(){
  Chart.defaults.font.family = "'IBM Plex Mono', monospace";
  Chart.defaults.font.size = 11.5;
  Chart.defaults.color = PALETTE.ink2;
}
