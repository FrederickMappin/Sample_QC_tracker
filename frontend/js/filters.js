/**
 * filters.js – Dropdown population, change handlers, data fetching.
 */

/* ── Map filter keys → DOM select IDs ──────────────────── */
const FILTER_ID_MAP = {
  Machine:      'filter-machine',
  Assay:        'filter-assay',
  Desired_Size: 'filter-size',
};

/**
 * Populate all three dropdowns from the server-supplied options.
 */
function populateFilters(filterOptions) {
  for (const [col, values] of Object.entries(filterOptions)) {
    const selectId = FILTER_ID_MAP[col] || guessSelectId(col);
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

    // change listener – re-apply filters on every change
    el.onchange = () => {
      window.appState.currentFilters[col] = el.value;
      applyFilters();
    };
  }
}

/**
 * Fallback: try to guess which <select> matches a column name.
 */
function guessSelectId(col) {
  const lower = col.toLowerCase().replace(/[^a-z]/g, '');
  if (lower.includes('machine'))  return 'filter-machine';
  if (lower.includes('assay'))    return 'filter-assay';
  if (lower.includes('size') || lower.includes('desired')) return 'filter-size';
  return 'filter-' + lower;
}

/**
 * Read current filter state, fetch filtered data & stats.
 */
async function applyFilters() {
  const filters = { ...window.appState.currentFilters };
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
  const filters = { ...window.appState.currentFilters };

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
      parts.push(val);
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
