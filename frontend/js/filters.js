/**
 * filters.js – Dropdown population, change handlers, data fetching.
 */

/* ── Static Type → Package mapping (cascading) ─────────── */
const PACKAGE_MAP = {
  'Illumina Whole Exome Sequencing': [
    '200 Mbp', '400 Mbp', '650 Mbp', '1 Gbp', '2 Gbp',
    '5 Gbp', '10 Gbp', '25 Gbp', '50 Gbp', '30×', '60x',
  ],
  'Illumina Whole Genome Sequencing': [
    '50x', '100x', '200x',
  ],
  'mRNA Enrichment': [
    '25M', '50M', '100M', '200M',
  ],
  'rRNA Depletion': [
    '12M', '25M', '50M', '100M', '200M',
  ],
};

const TYPE_OPTIONS = ['All', ...Object.keys(PACKAGE_MAP)];

/* ── Map parquet column names to our UI filter keys ────── */
// The parquet may use Assay / Desired_Size; we present them as Type / Package.
const COLUMN_TO_UI = {
  Assay:        'Type',
  Desired_Size: 'Package',
};
const UI_TO_COLUMN = {};                       // filled dynamically at load time

/* ── Map filter keys → DOM select IDs ──────────────────── */
const FILTER_ID_MAP = {
  Machine:  'filter-machine',
  Type:     'filter-type',
  Package:  'filter-package',
};

/* ── Populate the static Type dropdown ─────────────────── */
function populateTypeDropdown() {
  const el = document.getElementById('filter-type');
  el.innerHTML = '';
  TYPE_OPTIONS.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    el.appendChild(opt);
  });
  el.disabled = false;
  el.value = 'All';

  el.onchange = () => {
    window.appState.currentFilters.Type = el.value;
    populatePackageDropdown(el.value);
    applyFilters();
  };
}

/* ── Populate Package dropdown based on selected Type ──── */
function populatePackageDropdown(selectedType) {
  const el = document.getElementById('filter-package');
  let values;

  if (!selectedType || selectedType === 'All') {
    // merge all packages (deduplicated, preserving order)
    const seen = new Set();
    values = ['All'];
    for (const pkgs of Object.values(PACKAGE_MAP)) {
      for (const p of pkgs) {
        if (!seen.has(p)) { seen.add(p); values.push(p); }
      }
    }
  } else {
    values = ['All', ...(PACKAGE_MAP[selectedType] || [])];
  }

  el.innerHTML = '';
  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    el.appendChild(opt);
  });
  el.disabled = false;
  el.value = 'All';
  window.appState.currentFilters.Package = 'All';

  el.onchange = () => {
    window.appState.currentFilters.Package = el.value;
    applyFilters();
  };
}

/**
 * Populate all filter dropdowns.
 * Machine is dynamic (from parquet data); Type & Package are hardcoded.
 */
function populateFilters(filterOptions) {
  // ── Machine (dynamic from data) ──
  for (const [col, values] of Object.entries(filterOptions)) {
    // Map old parquet column names to our UI key
    const uiKey = COLUMN_TO_UI[col] || col;

    if (uiKey === 'Type' || uiKey === 'Package') {
      // remember the real parquet column name for query time
      UI_TO_COLUMN[uiKey] = col;
      continue;                     // skip dynamic population – we hardcode these
    }

    const selectId = FILTER_ID_MAP[uiKey] || guessSelectId(uiKey);
    const el = document.getElementById(selectId);
    if (!el) continue;

    el.innerHTML = '';
    values.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      el.appendChild(opt);
    });
    el.disabled = false;
    el.value = 'All';

    el.onchange = () => {
      window.appState.currentFilters[uiKey] = el.value;
      applyFilters();
    };
  }

  // ── Type & Package (hardcoded, cascading) ──
  populateTypeDropdown();
  populatePackageDropdown('All');

  // Initialise filter state for Type / Package
  window.appState.currentFilters.Type = 'All';
  window.appState.currentFilters.Package = 'All';
}

/**
 * Fallback: try to guess which <select> matches a column name.
 */
function guessSelectId(col) {
  const lower = col.toLowerCase().replace(/[^a-z]/g, '');
  if (lower.includes('machine'))  return 'filter-machine';
  if (lower.includes('assay') || lower.includes('type'))    return 'filter-type';
  if (lower.includes('size') || lower.includes('desired') || lower.includes('package')) return 'filter-package';
  return 'filter-' + lower;
}

/**
 * Build the filters dict to send to the backend.
 * Maps our UI keys (Type, Package) back to the actual parquet column names.
 */
function buildBackendFilters() {
  const raw = { ...window.appState.currentFilters };
  const mapped = {};
  for (const [key, val] of Object.entries(raw)) {
    const backendCol = UI_TO_COLUMN[key] || key;
    mapped[backendCol] = val;
  }
  return mapped;
}

/**
 * Read current filter state, fetch filtered data & stats.
 */
async function applyFilters() {
  const filters = buildBackendFilters();
  showLoading();

  try {
    // fetch table data
    const res  = await fetch('/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters }),
    });
    const json = await res.json();

    if (json.error) { alert(json.error); return; }

    window.appState.currentData = json.data;
    window.appState.newSamplesData = json.new_data || [];
    renderTable(json.data, window.appState.columns, json.new_data || []);
    updateRowCount(json.count, json.total, json.new_count || 0);
    updateFilterBanner();

    // if visualisation tab is visible, refresh plots immediately
    const plotsTab = document.getElementById('tab-plots');
    if (plotsTab.classList.contains('active')) {
      await updateVisualizations();
    }
  } catch (err) {
    console.error('Filter error:', err);
  } finally {
    hideLoading();
  }
}

/**
 * Fetch box-plot stats and render plots.
 */
async function updateVisualizations() {
  const filters = buildBackendFilters();

  try {
    const res  = await fetch('/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters }),
    });
    const stats = await res.json();
    if (stats.error) { console.error(stats.error); return; }
    renderPlots(stats);
  } catch (err) {
    console.error('Stats error:', err);
  }
}

/**
 * Update the filter banner on Tab 2.
 */
function updateFilterBanner() {
  const parts = [];
  for (const [col, val] of Object.entries(window.appState.currentFilters)) {
    if (val === 'All') {
      parts.push('All ' + col.replace(/_/g, ' ') + 's');
    } else {
      parts.push(col.replace(/_/g, ' ') + ': ' + val);
    }
  }
  const banner = document.getElementById('filter-banner');
  banner.textContent = parts.length ? parts.join('  |  ') : 'All Samples';
}

/**
 * Update the row count label.
 */
function updateRowCount(filtered, total, newCount) {
  let text = `Showing ${filtered} of ${total} rows`;
  if (newCount > 0) {
    text += ` + ${newCount} new sample${newCount !== 1 ? 's' : ''}`;
  }
  document.getElementById('row-count').textContent = text;
}
