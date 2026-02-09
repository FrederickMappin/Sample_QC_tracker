/**
 * table.js – Build & update the scrollable data table.
 */

let _headerBuilt = false;

/**
 * Render the data table.
 * @param {Array<Object>} data   – Row objects from /query
 * @param {Object}        cols   – { categorical: [...], numerical: [...] }
 */
function renderTable(data, cols) {
  const thead = document.getElementById('table-head');
  const tbody = document.getElementById('table-body');
  const placeholder = document.getElementById('table-placeholder');

  if (!data || data.length === 0) {
    tbody.innerHTML = '';
    if (!_headerBuilt) thead.innerHTML = '';
    placeholder.style.display = 'block';
    placeholder.textContent = 'No data matches the current filters.';
    return;
  }
  placeholder.style.display = 'none';

  const allCols  = Object.keys(data[0]);
  const numSet   = new Set(cols.numerical);

  // ── build header once (or rebuild if columns changed) ─────
  if (!_headerBuilt || thead.querySelectorAll('th').length !== allCols.length) {
    thead.innerHTML = '';
    const tr = document.createElement('tr');
    allCols.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col.replace(/_/g, ' ');
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    _headerBuilt = true;
  }

  // ── build body ────────────────────────────────────────────
  tbody.innerHTML = '';
  data.forEach(row => {
    const tr = document.createElement('tr');
    allCols.forEach(col => {
      const td = document.createElement('td');
      const val = row[col];

      if (val == null) {
        td.textContent = '—';
      } else if (numSet.has(col)) {
        td.textContent = formatNum(col, val);
        td.classList.add('cell-num');
      } else {
        td.textContent = val;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

/**
 * Format a numerical value based on its column name.
 * Falls back to 2 decimal places.
 */
function formatNum(col, val) {
  const v = Number(val);
  if (isNaN(v)) return String(val);

  const lower = col.toLowerCase();
  if (lower.includes('q30'))         return v.toFixed(1) + '%';
  if (lower.includes('yield'))       return v.toFixed(2) + ' GB';
  if (lower.includes('pass'))        return v.toFixed(1) + '%';
  if (lower.includes('error'))       return v.toFixed(2) + '%';
  return v.toFixed(2);
}
