/**
 * main.js – App initialisation, tab switching, file upload.
 */

/* ── Global state ──────────────────────────────────────── */
window.appState = {
  currentFile: null,
  columns: { categorical: [], numerical: [] },
  filterOptions: {},        // { Machine: ["All","NovaSeq",…], … }
  currentFilters: {},       // { Machine: "All", Assay: "All", … }
  currentData: [],
  totalRows: 0,
};

/* ── DOM references ────────────────────────────────────── */
const tabBtns        = document.querySelectorAll('.tab-btn');
const tabContents    = document.querySelectorAll('.tab-content');
const uploadBtn      = document.getElementById('upload-btn');
const fileInput      = document.getElementById('file-input');
const uploadStatus   = document.getElementById('upload-status');
const loadingOverlay = document.getElementById('loading');

/* ── Loading helpers ───────────────────────────────────── */
function showLoading() { loadingOverlay.style.display = 'flex'; }
function hideLoading() { loadingOverlay.style.display = 'none'; }

/* ── Tab switching ─────────────────────────────────────── */
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;

    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(tc => tc.classList.remove('active'));

    btn.classList.add('active');
    document.getElementById(target).classList.add('active');

    // auto-refresh plots when switching to visualisations tab
    if (target === 'tab-plots' && window.appState.currentFile) {
      updateVisualizations();
    }
  });
});

/* ── File upload ───────────────────────────────────────── */
uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;

  if (!file.name.toLowerCase().endsWith('.parquet')) {
    alert('Please select a .parquet file.');
    return;
  }

  showLoading();

  const form = new FormData();
  form.append('file', file);

  try {
    const res  = await fetch('/upload', { method: 'POST', body: form });
    const json = await res.json();

    if (!res.ok || json.error) {
      alert('Upload failed: ' + (json.error || 'Unknown error'));
      hideLoading();
      return;
    }

    // update global state
    window.appState.currentFile   = file.name;
    window.appState.columns       = json.columns;
    window.appState.filterOptions = json.filter_options;
    window.appState.totalRows     = json.total_rows;

    // initialise filters to "All"
    window.appState.currentFilters = {};
    for (const key of Object.keys(json.filter_options)) {
      window.appState.currentFilters[key] = 'All';
    }

    uploadStatus.textContent = file.name;

    // populate dropdowns & load initial data
    populateFilters(json.filter_options);
    await applyFilters();

    // hide placeholders
    document.getElementById('table-placeholder').style.display = 'none';
    document.getElementById('plots-placeholder').style.display = 'none';

  } catch (err) {
    alert('Upload error: ' + err.message);
  } finally {
    hideLoading();
    fileInput.value = '';           // allow re-uploading same file
  }
});
