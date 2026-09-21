/* ============================================================
   View renderers — one function per section.
   Each returns nothing directly; they render into #stage and
   wire up their own charts/filters after the HTML is mounted.
   ============================================================ */

const Views = {};

/* ---------------- 1. OVERVIEW ---------------- */

Views.overview = async function(stage){
  const d = await DataStore.load('consolidated_mis');
  const ps = d.portfolio_snapshot, sd = d.shipment_docs_status, cd = d.cost_duty_summary;

  stage.innerHTML = `
    <div class="grid grid-4">
      <div class="kpi" style="--kpi-accent:${PALETTE.steel}">
        <div class="kpi-label">Live BL Records</div>
        <div class="kpi-value">${fmt.num(ps.total_bl_records)}</div>
        <div class="kpi-foot">${fmt.num(ps.total_containers)} containers across portfolio</div>
      </div>
      <div class="kpi" style="--kpi-accent:${PALETTE.green}">
        <div class="kpi-label">Closed Orders</div>
        <div class="kpi-value">${fmt.num(ps.closed_orders)}</div>
        <div class="kpi-foot">${fmt.pct(ps.closed_orders, ps.total_bl_records)} of portfolio</div>
      </div>
      <div class="kpi" style="--kpi-accent:${PALETTE.amber}">
        <div class="kpi-label">Active Orders</div>
        <div class="kpi-value">${fmt.num(ps.active_orders)}</div>
        <div class="kpi-foot">${fmt.pct(ps.active_orders, ps.total_bl_records)} still open</div>
      </div>
      <div class="kpi" style="--kpi-accent:${PALETTE.red}">
        <div class="kpi-label">Fund Required &ndash; Open Items</div>
        <div class="kpi-value">₹${fmt.num(cd.total_fund_required_inr/100000,1)}<small>L</small></div>
        <div class="kpi-foot">per Fund Planning Report</div>
      </div>
    </div>

    <div class="section-header">
      <span class="section-tag">C</span>
      <h2>Cost &amp; Duty Summary (INR)</h2>
    </div>
    <div class="grid grid-4">
      <div class="kpi" style="--kpi-accent:${PALETTE.steel}">
        <div class="kpi-label">Total Landing Cost</div>
        <div class="kpi-value">₹${fmt.num(cd.total_landing_cost_inr/100000,1)}<small>L</small></div>
      </div>
      <div class="kpi" style="--kpi-accent:${PALETTE.steel}">
        <div class="kpi-label">Avg Landing Cost / KG</div>
        <div class="kpi-value">${fmt.inr(cd.avg_landing_cost_per_kg)}</div>
      </div>
      <div class="kpi" style="--kpi-accent:${PALETTE.amber}">
        <div class="kpi-label">Total Duty Amount</div>
        <div class="kpi-value">₹${fmt.num(cd.total_duty_amount_inr/100000,1)}<small>L</small></div>
      </div>
      <div class="kpi" style="--kpi-accent:${PALETTE.red}">
        <div class="kpi-label">Detention + Damage</div>
        <div class="kpi-value">${fmt.inr(cd.total_detention_amount_inr + cd.total_damage_claims_inr)}</div>
        <div class="kpi-foot">Detention ${fmt.inr(cd.total_detention_amount_inr)} &middot; Damage ${fmt.inr(cd.total_damage_claims_inr)}</div>
      </div>
    </div>

    <div class="two-col">
      <div class="panel">
        <div class="panel-head">
          <h3 class="panel-title">Shipment &amp; Documents Status</h3>
          <span class="panel-note">${fmt.num(ps.total_bl_records)} BLs tracked</span>
        </div>
        <div class="chart-box"><canvas id="ovStatusChart"></canvas></div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <h3 class="panel-title">Top Vendors by BL Count</h3>
          <span class="panel-note">Share of portfolio</span>
        </div>
        <ul class="legend-list" id="ovVendorList"></ul>
      </div>
    </div>
  `;

  const statusLabels = ['Delivered','In-Transit','Docs Released','Docs At Bank','Docs At Seller'];
  const statusValues = [sd.delivered, sd.in_transit, sd.documents_released, sd.documents_at_bank, sd.documents_at_seller];
  const statusColors = [PALETTE.green, PALETTE.amber, PALETTE.steel, PALETTE.red, '#8b6f47'];

  new Chart(document.getElementById('ovStatusChart'), {
    type: 'bar',
    data: {
      labels: statusLabels,
      datasets: [{ data: statusValues, backgroundColor: statusColors, borderRadius: 3, maxBarThickness: 42 }]
    },
    options: {
      plugins: { legend: { display:false } },
      scales: {
        x: { grid: { display:false }, ticks: { color: PALETTE.ink2 } },
        y: { grid: { color: PALETTE.gridline }, ticks: { color: PALETTE.ink2 }, beginAtZero:true }
      }
    }
  });

  const maxVendor = Math.max(...d.top_vendors.map(v => v.bl_count));
  document.getElementById('ovVendorList').innerHTML = d.top_vendors.map((v,i) => `
    <li>
      <span class="lg-name"><span class="swatch" style="background:${i===0?PALETTE.amber:PALETTE.steel}"></span>${esc(v.vendor)}</span>
      <span class="lg-val">${v.bl_count}</span>
    </li>
  `).join('');
};

/* ---------------- 2. DAILY FUND OUTFLOW ---------------- */

Views.fundOutflow = async function(stage){
  const d = await DataStore.load('daily_fund_outflow');

  stage.innerHTML = `
    <div class="grid grid-3">
      <div class="kpi" style="--kpi-accent:${PALETTE.amber}">
        <div class="kpi-label">Week Total Outflow</div>
        <div class="kpi-value">${fmt.inr(d.total)}</div>
        <div class="kpi-foot">7-day rolling requirement</div>
      </div>
      <div class="kpi" style="--kpi-accent:${PALETTE.steel}">
        <div class="kpi-label">Average / Day</div>
        <div class="kpi-value">${fmt.inr(d.total / d.rows.length)}</div>
      </div>
      <div class="kpi" style="--kpi-accent:${PALETTE.red}">
        <div class="kpi-label">Peak Day</div>
        <div class="kpi-value">${fmt.inr(Math.max(...d.rows.map(r=>r.amount)))}</div>
        <div class="kpi-foot">${d.rows.reduce((a,b)=> b.amount > a.amount ? b : a).day}</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3 class="panel-title">Daily Outflow Trend</h3>
        <span class="panel-note">Currency: ${d.currency}</span>
      </div>
      <div class="chart-box"><canvas id="foChart"></canvas></div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3 class="panel-title">Daywise Fund Requirement</h3>
        <span class="panel-note">Report as on ${d.asOn}</span>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>#</th><th>Date</th><th>Day</th><th class="num">Amount (INR)</th></tr></thead>
          <tbody>
            ${d.rows.map(r => `
              <tr>
                <td>${r.sr}</td>
                <td>${esc(r.date)}</td>
                <td>${esc(r.day)}</td>
                <td class="num">${fmt.inr(r.amount)}</td>
              </tr>`).join('')}
            <tr class="total-row"><td colspan="3">TOTAL</td><td class="num">${fmt.inr(d.total)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  new Chart(document.getElementById('foChart'), {
    type: 'bar',
    data: {
      labels: d.rows.map(r => r.day.slice(0,3)),
      datasets: [{
        data: d.rows.map(r => r.amount),
        backgroundColor: d.rows.map(r => r.amount === Math.max(...d.rows.map(x=>x.amount)) ? PALETTE.amber : PALETTE.steel),
        borderRadius: 4, maxBarThickness: 46
      }]
    },
    options: {
      plugins: {
        legend: { display:false },
        tooltip: { callbacks: { label: (ctx) => fmt.inr(ctx.raw) } }
      },
      scales: {
        x: { grid: { display:false }, ticks: { color: PALETTE.ink2 } },
        y: { grid: { color: PALETTE.gridline }, ticks: { color: PALETTE.ink2, callback:(v)=>fmt.num(v/100000)+'L' }, beginAtZero:true }
      }
    }
  });
};

/* ---------------- 3. FUND PLANNING ---------------- */

Views.fundPlanning = async function(stage){
  const d = await DataStore.load('fund_planning');
  let filtered = d.rows;
  let statusFilter = 'all';
  let query = '';

  stage.innerHTML = `
    <div class="grid grid-4">
      <div class="kpi" style="--kpi-accent:${PALETTE.steel}">
        <div class="kpi-label">Duty Approx. (INR)</div>
        <div class="kpi-value">₹${fmt.num(d.totals.duty_approx_inr/100000,1)}<small>L</small></div>
      </div>
      <div class="kpi" style="--kpi-accent:${PALETTE.steel}">
        <div class="kpi-label">Amount to be Paid (USD)</div>
        <div class="kpi-value">${fmt.usd(d.totals.amount_usd)}</div>
      </div>
      <div class="kpi" style="--kpi-accent:${PALETTE.amber}">
        <div class="kpi-label">Amount Payable (INR)</div>
        <div class="kpi-value">₹${fmt.num(d.totals.amount_payable_inr/100000,1)}<small>L</small></div>
      </div>
      <div class="kpi" style="--kpi-accent:${PALETTE.red}">
        <div class="kpi-label">Total Fund Required</div>
        <div class="kpi-value">₹${fmt.num(d.totals.total_required_inr/100000,1)}<small>L</small></div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3 class="panel-title">Fund Planning Details</h3>
        <span class="panel-note">${d.rows.length} line items &middot; Live ${new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
      </div>
      <div class="controls">
        <input class="control-input" id="fpSearch" placeholder="Search BL no., SO, party, CHA...">
        <div class="pill-group" id="fpPills">
          <button class="pill active" data-v="all">All</button>
          <button class="pill" data-v="Active">Active</button>
          <button class="pill" data-v="Closed">Closed</button>
        </div>
        <div class="fp-actions">
          <button class="fp-btn" type="button" data-fp-export="print">Print A3</button>
          <button class="fp-btn" type="button" data-fp-export="pdf">Download PDF</button>
          <button class="fp-btn" type="button" data-fp-export="xlsx">Download XLSX</button>
        </div>
      </div>
      <div class="table-wrap fp-print-area">
        <table class="data">
          <thead><tr>
            <th>S.N.</th>
            <th>Last 6 Digit BL No.</th>
            <th>Order Status</th>
            <th>Party Name</th>
            <th>Composition / Grade</th>
            <th>Inty Name</th>
            <th>No. of Cont.</th>
            <th>Container ETA</th>
            <th>Free Till</th>
            <th>CHA Name</th>
            <th class="num">Qty in KGS</th>
            <th class="num">Rate per MTS (in USD)</th>
            <th class="num">DUTY AMT APPROX in INR</th>
            <th class="num">Advance paid in USD</th>
            <th class="num">AMOUNT TO BE PAID IN USD</th>
            <th class="num">Amount payable in INR (APPROX)</th>
            <th class="num">Total Amount required (INR)</th>
            <th>HSS Agmt</th>
            <th>Remarks</th>
            <th>SIMS Status</th>
            <th>Payment Term</th>
            <th>BOE Status</th>
            <th>Current Documents Status</th>
            <th>DO Payment Status</th>
            <th>SO No.</th>
          </tr></thead>
          <tbody id="fpBody"></tbody>
        </table>
      </div>
      <div id="fpEmpty" class="empty-state" style="display:none">No matching records.</div>
    </div>
  `;

  function getSubtotalRow(rows){
    const total = rows.reduce((acc, r) => {
      acc.qty_kgs += Number(r.qty_kgs || 0);
      acc.duty_approx_inr += Number(r.duty_approx_inr || 0);
      acc.advance_amount_paid_usd += Number(r.advance_amount_paid_usd || 0);
      acc.amount_usd += Number(r.amount_usd || 0);
      acc.amount_payable_inr += Number(r.amount_payable_inr || 0);
      acc.total_required_inr += Number(r.total_required_inr || 0);
      return acc;
    }, {
      qty_kgs: 0,
      duty_approx_inr: 0,
      advance_amount_paid_usd: 0,
      amount_usd: 0,
      amount_payable_inr: 0,
      total_required_inr: 0
    });

    return `
      <tr class="total-row" style="font-weight:700; background: rgba(224,138,62,0.08);">
        <td>Total</td>
        <td colspan="9"></td>
        <td class="num">${fmt.num(total.qty_kgs)}</td>
        <td></td>
        <td class="num">${fmt.inr(total.duty_approx_inr)}</td>
        <td class="num">${fmt.usd(total.advance_amount_paid_usd)}</td>
        <td class="num">${fmt.usd(total.amount_usd)}</td>
        <td class="num">${fmt.inr(total.amount_payable_inr)}</td>
        <td class="num">${fmt.inr(total.total_required_inr)}</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    `;
  }

  function renderRows(){
    const body = document.getElementById('fpBody');
    const empty = document.getElementById('fpEmpty');
    if(filtered.length === 0){
      body.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    body.innerHTML = filtered.slice(0, 500).map(r => {
      const rateAsPerSoUsd = Number(r.rate_as_per_so_usd ?? r.rate_per_mts_usd ?? 0);
      return `
      <tr>
        <td>${esc(r.sn)}</td>
        <td>${esc(r.bl_no)}</td>
        <td>${badge(r.order_status)}</td>
        <td class="wrap">${esc(r.party_name)}</td>
        <td class="wrap">${esc(r.composition)}</td>
        <td>${esc(r.entity)}</td>
        <td class="num">${typeof r.no_of_cont === 'number' ? fmt.num(r.no_of_cont) : esc(r.no_of_cont)}</td>
        <td>${esc(r.container_eta)}</td>
        <td>${esc(r.free_till)}</td>
        <td>${esc(r.cha_name)}</td>
        <td class="num">${typeof r.qty_kgs === 'number' ? fmt.num(r.qty_kgs) : esc(r.qty_kgs)}</td>
        <td class="num">${fmt.usd(rateAsPerSoUsd)}</td>
        <td class="num">${fmt.inr(r.duty_approx_inr)}</td>
        <td class="num">${fmt.usd(r.advance_amount_paid_usd)}</td>
        <td class="num">${fmt.usd(r.amount_usd)}</td>
        <td class="num">${fmt.inr(r.amount_payable_inr)}</td>
        <td class="num">${fmt.inr(r.total_required_inr)}</td>
        <td>${esc(r.hss)}</td>
        <td class="wrap">${esc(r.remarks || '')}</td>
        <td>${esc(r.sims)}</td>
        <td>${esc(r.payment)}</td>
        <td>${esc(r.boe || r.bo)}</td>
        <td>${esc(r.current_document)}</td>
        <td>${esc(r.do_payment_status)}</td>
        <td>${esc(r.so_no)}</td>
      </tr>
    `;
    }).join('') + getSubtotalRow(filtered);
  }

  function exportPrintableTable(mode) {
    const table = getActiveTableForExport();
    if (!table) return;

    const printFont = '13.5px';
    const pageTitle = document.querySelector('#pageTitle')?.textContent || 'Active Dashboard Section';
    const exportRange = { start: 0, end: 18 };
    const widthMap = {
      0: '34px', 1: '80px', 2: '92px', 3: '130px', 4: '180px', 5: '78px', 6: '58px',
      7: '88px', 8: '88px', 9: '90px', 10: '76px', 11: '88px', 12: '102px', 13: '94px',
      14: '104px', 15: '110px', 16: '110px', 17: '58px', 18: '58px'
    };

    const clonedTable = table.cloneNode(true);
    clonedTable.style.fontSize = printFont;
    clonedTable.style.borderCollapse = 'collapse';
    clonedTable.style.lineHeight = '1.2';
    clonedTable.style.tableLayout = 'fixed';
    clonedTable.style.minWidth = '1800px';
    clonedTable.style.width = '100%';

    Array.from(clonedTable.querySelectorAll('thead tr th')).forEach((cell, index) => {
      if (index < exportRange.start || index > exportRange.end) {
        cell.remove();
      } else {
        cell.style.fontSize = printFont;
        cell.style.padding = '5px';
        cell.style.lineHeight = '1.2';
        cell.style.whiteSpace = 'normal';
        cell.style.verticalAlign = 'top';
        cell.style.width = widthMap[index] || 'auto';
      }
    });

    Array.from(clonedTable.querySelectorAll('tbody tr')).forEach((row) => {
      Array.from(row.children).forEach((cell, index) => {
        if (index < exportRange.start || index > exportRange.end) {
          cell.remove();
        } else {
          cell.style.fontSize = printFont;
          cell.style.padding = '5px';
          cell.style.lineHeight = '1.2';
          cell.style.whiteSpace = 'normal';
          cell.style.verticalAlign = 'top';
          cell.style.wordBreak = 'break-word';
          cell.style.overflowWrap = 'anywhere';
          cell.style.width = widthMap[index] || 'auto';
        }
      });
    });

    if (mode === 'print') {
      const wrapper = document.createElement('div');
      wrapper.style.width = '100%';
      wrapper.style.padding = '18px';
      wrapper.style.background = '#fff';
      wrapper.style.color = '#111';
      wrapper.style.fontSize = printFont;
      wrapper.style.lineHeight = '1.2';
      wrapper.style.overflowX = 'auto';
      wrapper.appendChild(clonedTable);
      const old = document.body.innerHTML;
      document.body.innerHTML = '<div style="padding:24px;background:#fff;">' + wrapper.innerHTML + '</div>';
      window.print();
      document.body.innerHTML = old;
      location.reload();
      return;
    }

    if (mode === 'pdf') {
      const printWindow = window.open('', '_blank', 'width=1200,height=900');
      if (!printWindow) return alert('Popup blocked. Please allow pop-ups to print as PDF.');
      printWindow.document.write('<html><head><title>' + pageTitle + '</title><style>@page{size:A3 landscape;margin:8mm;} body{font-family:Arial,sans-serif;background:#fff;color:#111;padding:18px;font-size:13.5px;line-height:1.2;} table{width:100%;min-width:1800px;border-collapse:collapse;table-layout:fixed;line-height:1.2;} th,td{border:1px solid #111;padding:5px;text-align:left;font-size:13.5px;line-height:1.2;vertical-align:top;word-wrap:break-word;overflow-wrap:anywhere;white-space:normal;} th{background:#f3f3f3;}</style></head><body>' + clonedTable.outerHTML + '</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
      return;
    }

    if (mode === 'xlsx') {
      if (!(window.XLSX && typeof window.XLSX.utils !== 'undefined')) {
        return alert('Excel export library is not available.');
      }
      const rows = Array.from(clonedTable.querySelectorAll('tr')).map((tr) => Array.from(tr.children).map((td) => (td.textContent || '').trim()));
      const sheet = window.XLSX.utils.aoa_to_sheet(rows);
      const workbook = window.XLSX.utils.book_new();
      const sheetName = (pageTitle || 'Active Dashboard Section').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'Active Dashboard Section';
      window.XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31));
      window.XLSX.writeFile(workbook, (sheetName || 'active_dashboard_section') + '.xlsx');
    }
  }

  document.querySelectorAll('[data-fp-export]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.fpExport;
      exportPrintableTable(action);
    });
  });

  function applyFilters(){
    filtered = d.rows.filter(r => {
      const matchesStatus = statusFilter === 'all' || (r.order_status || '').toLowerCase() === statusFilter.toLowerCase();
      const hay = `${r.bl_no || ''} ${r.so_no || ''} ${r.party_name || ''} ${r.cha_name || ''} ${r.entity || ''}`.toLowerCase();
      const matchesQuery = !query || hay.includes(query);
      return matchesStatus && matchesQuery;
    });
    renderRows();
  }

  document.getElementById('fpSearch').addEventListener('input', debounce((e) => {
    query = e.target.value.trim().toLowerCase();
    applyFilters();
  }, 150));

  document.getElementById('fpPills').addEventListener('click', (e) => {
    const btn = e.target.closest('.pill');
    if(!btn) return;
    document.querySelectorAll('#fpPills .pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    statusFilter = btn.dataset.v;
    applyFilters();
  });

  renderRows();
};

/* ---------------- 4. ONE VIEW — BL TRACKER ---------------- */

Views.oneView = async function(stage){
  const d = await DataStore.load('one_view');
  let filtered = d.rows;
  let query = '';
  let docFilter = 'all';

  const docStatuses = [...new Set(d.rows.map(r => r.documents_status).filter(Boolean))];

  stage.innerHTML = `
    <div class="panel" style="margin-top:0">
      <div class="panel-head">
        <h3 class="panel-title">BL Master Index</h3>
        <span class="panel-note">${d.rows.length} bills of lading on record</span>
      </div>
      <div class="controls">
        <input class="control-input" id="ovSearch" placeholder="Search BL, vendor, product, shipping line...">
        <select class="control-select" id="ovDocFilter">
          <option value="all">All document statuses</option>
          ${docStatuses.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
        </select>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th>BL No.</th><th>Full BL No.</th><th>Order</th><th>Vendor</th>
            <th>Category</th><th class="num">No. Cont.</th><th>Shipment</th><th>Documents</th><th>Shipping Line</th><th>CHA</th>
          </tr></thead>
          <tbody id="ovBody"></tbody>
        </table>
      </div>
      <div id="ovEmpty" class="empty-state" style="display:none">No matching records.</div>
    </div>
  `;

  function renderRows(){
    const body = document.getElementById('ovBody');
    const empty = document.getElementById('ovEmpty');
    if(filtered.length === 0){ body.innerHTML=''; empty.style.display='block'; return; }
    empty.style.display = 'none';
    body.innerHTML = filtered.slice(0, 200).map(r => `
      <tr>
        <td>${esc(r.bl_no)}</td>
        <td>${esc(r.full_bl_no)}</td>
        <td>${badge(r.order_status)}</td>
        <td class="wrap">${esc(r.vendor_name)}</td>
        <td class="wrap">${esc(r.category)}</td>
        <td class="num">${esc(r.no_of_containers)}</td>
        <td>${badge(r.shipment_status)}</td>
        <td>${badge(r.documents_status)}</td>
        <td class="wrap">${esc(r.shipping_line)}</td>
        <td class="wrap">${esc(r.cha_name)}</td>
      </tr>
    `).join('');
  }

  function applyFilters(){
    filtered = d.rows.filter(r => {
      const matchesDoc = docFilter === 'all' || r.documents_status === docFilter;
      const hay = `${r.bl_no} ${r.full_bl_no} ${r.vendor_name} ${r.product_name} ${r.shipping_line} ${r.cha_name}`.toLowerCase();
      const matchesQuery = !query || hay.includes(query);
      return matchesDoc && matchesQuery;
    });
    renderRows();
  }

  document.getElementById('ovSearch').addEventListener('input', debounce((e) => {
    query = e.target.value.trim().toLowerCase();
    applyFilters();
  }, 150));
  document.getElementById('ovDocFilter').addEventListener('change', (e) => {
    docFilter = e.target.value;
    applyFilters();
  });

  renderRows();
};

/* ---------------- 5. SHIPMENT COSTING ---------------- */

Views.shipmentCosting = async function(stage){
  const d = await DataStore.load('shipment_costing');
  const t = d.totals;

  // aggregate landing cost by category (top 8)
  const byCategory = {};
  d.rows.forEach(r => {
    const cat = r.category || 'Uncategorised';
    byCategory[cat] = (byCategory[cat] || 0) + (Number(r.landing_cost_inr) || 0);
  });
  const topCats = Object.entries(byCategory).sort((a,b) => b[1]-a[1]).slice(0,8);

  stage.innerHTML = `
    <div class="grid grid-4">
      <div class="kpi" style="--kpi-accent:${PALETTE.steel}">
        <div class="kpi-label">Total Duty Amount</div>
        <div class="kpi-value">₹${fmt.num(t.duty_amount_inr/100000,1)}<small>L</small></div>
      </div>
      <div class="kpi" style="--kpi-accent:${PALETTE.steel}">
        <div class="kpi-label">Total BE Amount</div>
        <div class="kpi-value">₹${fmt.num(t.total_be_amount_inr/100000,1)}<small>L</small></div>
      </div>
      <div class="kpi" style="--kpi-accent:${PALETTE.amber}">
        <div class="kpi-label">Total Landing Cost</div>
        <div class="kpi-value">₹${fmt.num(t.landing_cost_inr/100000,1)}<small>L</small></div>
      </div>
      <div class="kpi" style="--kpi-accent:${PALETTE.red}">
        <div class="kpi-label">Avg Landing Cost / KG</div>
        <div class="kpi-value">${fmt.inr(t.avg_landing_cost_per_kg)}</div>
        <div class="kpi-foot">FY ${d.fy}</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3 class="panel-title">Landing Cost by Category (Top 8)</h3>
        <span class="panel-note">INR</span>
      </div>
      <div class="chart-box tall"><canvas id="scChart"></canvas></div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h3 class="panel-title">Shipment Costing Ledger</h3>
        <span class="panel-note">${d.rows.length} shipments &middot; FY ${d.fy} &middot; as on ${d.asOn}</span>
      </div>
      <div class="controls">
        <input class="control-input" id="scSearch" placeholder="Search BL, vendor, port, category...">
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th>BL No.</th><th>Vendor</th><th>Category</th><th>POL</th><th>POD</th>
            <th class="num">Qty (MT)</th><th class="num">Paid (USD)</th>
            <th class="num">Duty (INR)</th><th class="num">Landing Cost (INR)</th><th class="num">Cost/KG</th>
          </tr></thead>
          <tbody id="scBody"></tbody>
        </table>
        <table class="data">
          <tbody>
            <tr class="total-row">
              <td colspan="6">TOTAL</td>
              <td class="num">${fmt.inr(t.duty_amount_inr)}</td>
              <td class="num">${fmt.inr(t.landing_cost_inr)}</td>
              <td class="num">Avg ${fmt.inr(t.avg_landing_cost_per_kg)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div id="scEmpty" class="empty-state" style="display:none">No matching records.</div>
    </div>
  `;

  new Chart(document.getElementById('scChart'), {
    type: 'bar',
    data: {
      labels: topCats.map(c => c[0].length > 26 ? c[0].slice(0,26)+'…' : c[0]),
      datasets: [{ data: topCats.map(c => c[1]), backgroundColor: PALETTE.amber, borderRadius: 3 }]
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display:false }, tooltip: { callbacks: { label: (ctx) => fmt.inr(ctx.raw) } } },
      scales: {
        x: { grid: { color: PALETTE.gridline }, ticks: { color: PALETTE.ink2, callback:(v)=>fmt.num(v/100000)+'L' } },
        y: { grid: { display:false }, ticks: { color: PALETTE.ink1 } }
      }
    }
  });

  let filtered = d.rows;
  function renderRows(){
    const body = document.getElementById('scBody');
    const empty = document.getElementById('scEmpty');
    if(filtered.length === 0){ body.innerHTML=''; empty.style.display='block'; return; }
    empty.style.display = 'none';
    body.innerHTML = filtered.map(r => `
      <tr>
        <td>${esc(r.bl_no)}</td>
        <td class="wrap">${esc(r.vendor_name)}</td>
        <td class="wrap">${esc(r.category)}</td>
        <td>${esc(r.port_of_loading)}</td>
        <td>${esc(r.port_of_discharge)}</td>
        <td class="num">${fmt.num(r.invoice_qty_mt,2)}</td>
        <td class="num">${fmt.usd(r.amount_paid_usd)}</td>
        <td class="num">${fmt.inr(r.duty_amount_inr)}</td>
        <td class="num">${fmt.inr(r.landing_cost_inr)}</td>
        <td class="num">${fmt.num(r.landing_cost_per_kg_inr,2)}</td>
      </tr>
    `).join('');
  }
  document.getElementById('scSearch').addEventListener('input', debounce((e) => {
    const q = e.target.value.trim().toLowerCase();
    filtered = !q ? d.rows : d.rows.filter(r =>
      `${r.bl_no} ${r.vendor_name} ${r.category} ${r.port_of_loading} ${r.port_of_discharge}`.toLowerCase().includes(q)
    );
    renderRows();
  }, 150));

  renderRows();
};
