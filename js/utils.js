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
  async function load(name){
    if(cache[name]) return cache[name];
    try {
      const live = await fetch(`/api/live-data/${name}`);
      if(live.ok){
        const json = await live.json();
        cache[name] = json;
        return json;
      }
      console.warn(`Live workbook request failed for ${name}; using saved report data.`);
    } catch(error) {
      console.warn(`Live workbook unavailable for ${name}; using saved report data.`, error);
    }
    const res = await fetch(`data/${name}.json`);
    if(!res.ok) throw new Error(`Failed to load ${name}`);
    const json = await res.json();
    cache[name] = json;
    return json;
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

const PALETTE = {
  amber: '#e08a3e',
  steel: '#5c86a8',
  green: '#5fa377',
  red:   '#cc5f56',
  ink1:  '#c4cbd2',
  ink2:  '#8b95a1',
  gridline: 'rgba(255,255,255,0.06)'
};

function chartDefaults(){
  Chart.defaults.font.family = "'IBM Plex Mono', monospace";
  Chart.defaults.font.size = 11.5;
  Chart.defaults.color = PALETTE.ink2;
}
