const ROUTES = {
  'overview': { title: 'Overview', sub: 'Consolidated management snapshot', render: Views.overview },
  'fund-outflow': { title: 'Daily Fund Outflow', sub: 'Amount due per day &middot; weekly total', render: Views.fundOutflow },
  'fund-planning': { title: 'Fund Planning Report', sub: 'Amounts to be paid (USD &amp; INR), duty approx., total INR required', render: Views.fundPlanning },
  'one-view': { title: 'One View &ndash; BL Tracker', sub: 'Container(s), qty, product, shipment &amp; document status', render: Views.oneView },
  'shipment-costing': { title: 'Shipment Costing Report', sub: 'Landing cost (INR) and landing cost per KG', render: Views.shipmentCosting },
};

const stage = document.getElementById('stage');
const pageTitle = document.getElementById('pageTitle');
const pageSub = document.getElementById('pageSub');
const dock = document.getElementById('dock');
const burger = document.getElementById('burger');

function updateLiveReportStamp(){
  const stamp = document.getElementById('asOnDate');
  if (!stamp) return;

  const now = new Date();
  const date = now.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).toUpperCase().replace(/\//g, '-');
  const time = now.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  stamp.textContent = `LIVE ${date.replace(/ /g, '-') } ${time}`;
}

async function navigate(route){
  if(route === 'user-control') return;
  if(!ROUTES[route]) route = 'overview';
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.route === route));
  const cfg = ROUTES[route];
  pageTitle.textContent = cfg.title.replace(/&ndash;/g,'–');
  pageSub.innerHTML = cfg.sub;
  stage.innerHTML = '<div class="empty-state">Loading…</div>';
  try{
    await cfg.render(stage);
  }catch(err){
    console.error(err);
    stage.innerHTML = `<div class="empty-state">Could not load this report. ${esc(err.message || '')}</div>`;
  }
  window.location.hash = route;
  dock.classList.remove('open');
}

document.getElementById('dockNav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item');
  if(!btn) return;
  navigate(btn.dataset.route);
});

burger.addEventListener('click', () => dock.classList.toggle('open'));

/* ---------------- professional theme manager ---------------- */

const THEME_NAMES = {
  'executive-navy': 'Executive Navy',
  'titanium-slate': 'Titanium Slate',
  'charcoal-steel': 'Charcoal Steel',
  'emerald-treasury': 'Emerald Treasury',
  'corporate-light': 'Corporate Light'
};

const THEME_KEYS = Object.keys(THEME_NAMES);

function applyTheme(themeKey, notify = false){
  if (!THEME_NAMES[themeKey]) themeKey = 'executive-navy';
  document.documentElement.setAttribute('data-theme', themeKey);
  if (document.body) document.body.setAttribute('data-theme', themeKey);
  try {
    localStorage.setItem('marfani_theme', themeKey);
  } catch(e) {}

  const activeLabel = document.getElementById('activeThemeName');
  if (activeLabel) {
    activeLabel.textContent = `Theme: ${THEME_NAMES[themeKey]}`;
  }

  const authLabel = document.getElementById('authThemeLabel');
  if (authLabel) {
    authLabel.textContent = `Theme: ${THEME_NAMES[themeKey]}`;
  }

  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === themeKey);
  });

  if (typeof updatePaletteFromTheme === 'function') {
    updatePaletteFromTheme();
  }

  if (notify && typeof navigate === 'function') {
    const currentRoute = (window.location.hash || '#overview').replace('#','');
    navigate(currentRoute);
  }
}

function cycleNextTheme(){
  const current = localStorage.getItem('marfani_theme') || 'executive-navy';
  const idx = THEME_KEYS.indexOf(current);
  const next = THEME_KEYS[(idx + 1) % THEME_KEYS.length];
  applyTheme(next, true);
}

function initThemeSwitcher(){
  const trigger = document.getElementById('themeTrigger');
  const dropdown = document.getElementById('themeDropdown');
  const authBtn = document.getElementById('authThemeBtn');

  const currentTheme = localStorage.getItem('marfani_theme') || 'executive-navy';
  applyTheme(currentTheme, false);

  if (trigger && dropdown) {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = trigger.getAttribute('aria-expanded') === 'true';
      trigger.setAttribute('aria-expanded', String(!isExpanded));
      dropdown.hidden = isExpanded;
    });

    dropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.theme-option');
      if (!opt) return;
      const chosenTheme = opt.dataset.theme;
      applyTheme(chosenTheme, true);
      dropdown.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && !trigger.contains(e.target)) {
        dropdown.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !dropdown.hidden) {
        dropdown.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  if (authBtn) {
    authBtn.addEventListener('click', (e) => {
      e.preventDefault();
      cycleNextTheme();
    });
  }
}

initThemeSwitcher();

updateLiveReportStamp();
setInterval(updateLiveReportStamp, 1000);

chartDefaults();

const initial = (window.location.hash || '#overview').replace('#','');
navigate(initial);

setInterval(() => {
  const route = (window.location.hash || '#overview').replace('#','');
  navigate(route);
}, 60 * 1000);
