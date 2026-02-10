# QC Metrics Dashboard - Implementation Prompts

## Master Architecture Reference

```
qc-dashboard/
├── backend/
│   ├── app.py                 # Flask server & routes
│   ├── database.py            # DuckDB operations
│   ├── requirements.txt       # Python dependencies
│   └── uploads/               # Temporary parquet storage
├── frontend/
│   ├── index.html             # Main HTML structure
│   ├── css/
│   │   └── styles.css         # All styling
│   └── js/
│       ├── main.js            # App init, tabs, file upload
│       ├── filters.js         # Dropdown filter logic
│       ├── table.js           # Data table rendering
│       └── plots.js           # D3.js box-and-whisker plots
└── README.md                  # Setup & run instructions
```

---

## PROMPT 1: requirements.txt

```
Create a requirements.txt for a Python project with these dependencies:
- flask (lightweight web server)
- duckdb (parquet file querying engine)
- pandas (data serialization helper)

Pin to stable versions. No extras needed.
```

---

## PROMPT 2: backend/database.py — DuckDB Operations

```
Create a Python module `database.py` that handles all DuckDB operations for a QC metrics dashboard.

PURPOSE:
This module wraps DuckDB to load parquet files, detect column types, filter data, and compute box plot statistics.

CLASS: QCDatabase
- Manages a single DuckDB in-memory connection
- One parquet file loaded at a time (new upload replaces old)

METHODS:

1. __init__(self):
   - Create in-memory DuckDB connection
   - Initialize state (no data loaded yet)

2. load_parquet(self, file_path: str) -> dict:
   - Drop existing table if any
   - Load parquet into DuckDB table called "qc_data": CREATE TABLE qc_data AS SELECT * FROM read_parquet(file_path)
   - Auto-detect columns: categorize each column as "categorical" or "numerical" based on DuckDB column types (VARCHAR = categorical, numeric types = numerical)
   - "Sample_Name" or any sample identifier should be excluded from filter options
   - For each categorical column, query DISTINCT values and prepend "All" as the first option
   - Return dict with:
     {
       "columns": {"categorical": [...], "numerical": [...]},
       "filter_options": {"Machine": ["All", "NovaSeq", ...], "Assay": ["All", ...], ...},
       "total_rows": int
     }

3. query_data(self, filters: dict) -> list[dict]:
   - Build SQL: SELECT * FROM qc_data WHERE ...
   - For each filter key/value: if value is "All", skip that filter; otherwise add "column = value" to WHERE clause
   - All filters are AND-joined
   - Return list of row dicts (JSON-serializable)

4. get_stats(self, filters: dict) -> dict:
   - Apply same filter logic as query_data
   - For EACH numerical column, compute:
     - min, q1 (25th percentile), median, q3 (75th percentile), max
     - All individual data points as a list (for jittered dots)
   - Use DuckDB SQL: PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY col) for quartiles
   - Return dict keyed by column name:
     {
       "Q30": {"min": ..., "q1": ..., "median": ..., "q3": ..., "max": ..., "points": [...]},
       "Total_Yield": {...},
       ...
     }

5. get_filter_options(self) -> dict:
   - Return the stored filter_options from load_parquet

6. get_column_info(self) -> dict:
   - Return the stored column categorization

IMPORTANT DETAILS:
- Handle empty filter results gracefully (return empty data, empty stats)
- Column names should preserve original parquet column names exactly
- All numerical values should be Python floats (JSON-serializable)
- Use parameterized queries or proper escaping for filter values
```

---

## PROMPT 3: backend/app.py — Flask Server & Routes

```
Create a Flask application `app.py` that serves as the backend for a QC metrics dashboard.

PURPOSE:
Lightweight localhost web server that serves the frontend and provides API endpoints for parquet file operations.

IMPORTS:
- Flask, request, jsonify, send_from_directory
- database.py (QCDatabase class from Prompt 2)
- os, webbrowser, threading

SETUP:
- Flask app serves static files from ../frontend/ directory
- QCDatabase instance created at startup
- uploads/ directory created if not exists
- Auto-open browser to localhost:5000 on startup

ROUTES:

1. GET / → Serve index.html from frontend/

2. GET /css/<path> → Serve CSS files from frontend/css/
   GET /js/<path> → Serve JS files from frontend/js/

3. POST /upload
   - Receive parquet file from multipart/form-data (field name: "file")
   - Save to backend/uploads/ directory (overwrite any existing file)
   - Call QCDatabase.load_parquet() with saved file path
   - Return JSON with column info and filter options
   - Handle errors: invalid file, not parquet, missing columns

4. POST /query
   - Receive JSON body: {"filters": {"Machine": "NextSeq", "Assay": "WES", "Desired_Size": "All"}}
   - Call QCDatabase.query_data() with filters
   - Return JSON: {"data": [...rows...], "count": int}
   - Handle error: no data loaded yet

5. POST /stats
   - Receive JSON body: same filter format as /query
   - Call QCDatabase.get_stats() with filters
   - Return JSON with box plot statistics per numerical column
   - Handle error: no data loaded yet

6. GET /filters
   - Return current filter options (categorical column values)
   - Handle error: no data loaded yet

STARTUP:
- Run on host='127.0.0.1', port=5000
- Auto-open browser after 1 second delay using threading.Timer + webbrowser.open
- Print "Dashboard running at http://localhost:5000" to console

ERROR HANDLING:
- All endpoints return {"error": "message"} with appropriate HTTP status codes on failure
- 400 for bad requests, 500 for server errors
```

---

## PROMPT 4: frontend/index.html — Main HTML Structure

```
Create the main HTML file for a QC metrics dashboard.

PURPOSE:
Single-page app with two tabs for data exploration and visualization.

STRUCTURE:

<head>:
- Title: "QC Metrics Dashboard"
- Link to css/styles.css
- Load D3.js v7 from CDN (d3js.org)

<body>:

1. HEADER BAR:
   - App title: "QC Metrics Dashboard"
   - File upload button (styled, not default browser input)
   - Upload status indicator (filename shown after upload)

2. TAB NAVIGATION:
   - Two tabs: "Data Table" and "Visualizations"
   - Tab switching handled by main.js
   - Active tab visually highlighted

3. TAB 1 CONTENT (id="tab-data"):
   - FILTER ROW: Three dropdown <select> elements side by side
     - Machine (id="filter-machine"): starts empty, populated after upload
     - Assay (id="filter-assay"): starts empty, populated after upload
     - Desired Size (id="filter-size"): starts empty, populated after upload
   - Row count display (e.g., "Showing 47 of 1200 rows")
   - DATA TABLE CONTAINER (id="table-container"):
     - Fixed header row
     - Scrollable body
     - Table populated dynamically by table.js

4. TAB 2 CONTENT (id="tab-plots"):
   - FILTER BANNER (id="filter-banner"): Shows active filters (e.g., "NextSeq | WES | 200mbp")
   - PLOT GRID (id="plot-grid"): 2x2 CSS grid container
     - 4 plot containers (id="plot-0", "plot-1", "plot-2", "plot-3")
     - Each has a title area and SVG area for D3.js rendering
   - Grid should expand (2xN) if more numerical columns exist

5. LOADING OVERLAY (id="loading"):
   - Semi-transparent overlay with spinner
   - Shown during data loading, hidden when complete

<scripts> at bottom:
- js/main.js
- js/filters.js
- js/table.js
- js/plots.js

IMPORTANT:
- No data shown initially, just "Upload a parquet file to begin" placeholder
- All dynamic content injected by JavaScript
- Semantic HTML, accessible labels on inputs
- Plot grid should be hidden until Tab 2 is selected
```

---

## PROMPT 5: frontend/css/styles.css — Styling

```
Create CSS styles for a QC metrics dashboard with a clean, professional look.

DESIGN:
- Clean, modern, minimal design suitable for scientific/lab use
- Dark header bar, light content area
- Responsive but optimized for desktop (this is a local tool)

COMPONENTS TO STYLE:

1. HEADER BAR:
   - Dark background (#2c3e50 or similar)
   - White text, app title on left
   - Upload button on right side of header
   - Upload button styled as a clean button (not default file input)
   - Filename display next to upload button after file is loaded

2. TAB NAVIGATION:
   - Horizontal tab bar below header
   - Active tab: bold, colored bottom border, different background
   - Inactive tab: subtle, clickable

3. FILTER ROW (Tab 1):
   - Three dropdowns in a horizontal row with labels above each
   - Consistent spacing, clean select styling
   - Row count text below filters

4. DATA TABLE:
   - Fixed header (sticky top) with dark background
   - Scrollable body (max-height so it doesn't overflow page)
   - Alternating row colors (zebra striping)
   - Hover highlight on rows
   - Clean borders, readable font size
   - Numerical columns right-aligned
   - Table takes full width of container

5. TAB 2 - PLOTS:
   - Filter banner: light background strip showing active filter text
   - 2x2 CSS Grid layout for plots
   - Each plot container: white background, subtle border/shadow, padding
   - Plot title centered above each plot
   - Grid should be responsive: 2 columns on wide screens, 1 column if narrow
   - Grid expands to 2xN rows as more plots are added

6. LOADING OVERLAY:
   - Semi-transparent dark background covering entire page
   - Centered spinner (CSS animation, no images needed)
   - "Loading..." text

7. PLACEHOLDER STATE:
   - "Upload a parquet file to begin" centered message
   - Shown when no data is loaded
   - Light gray text, centered

8. GENERAL:
   - Font: system fonts (-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)
   - Box-sizing: border-box globally
   - Smooth transitions on tab switching
   - No horizontal scrollbar on page
```

---

## PROMPT 6: frontend/js/main.js — App Initialization, Tabs, File Upload

```
Create main.js - the entry point JavaScript for a QC metrics dashboard.

PURPOSE:
Handles app initialization, tab switching, and file upload functionality.

FUNCTIONS:

1. init():
   - Called on DOMContentLoaded
   - Set up tab click handlers
   - Set up file upload handler
   - Show placeholder state ("Upload a parquet file to begin")
   - Default to Tab 1 active

2. switchTab(tabId):
   - Toggle active class on tab buttons
   - Show/hide tab content divs (id="tab-data" and id="tab-plots")
   - When switching to Tab 2: trigger plot refresh with current filters (call plots.js renderPlots)

3. handleFileUpload():
   - Triggered by upload button click
   - Create hidden <input type="file" accept=".parquet"> and trigger click
   - On file selected:
     - Show loading overlay
     - Create FormData, append file
     - POST to /upload via fetch
     - On success:
       - Store column info and filter options globally (window.appState or similar)
       - Call filters.js populateFilters() with filter_options
       - Call filters.js applyFilters() to load initial data (all filters set to "All")
       - Update upload status indicator with filename
       - Hide loading overlay
       - Hide placeholder, show content
     - On error: show alert with error message, hide loading

4. showLoading() / hideLoading():
   - Toggle loading overlay visibility

GLOBAL STATE (window.appState):
- currentFile: filename string
- columns: {categorical: [...], numerical: [...]}
- filterOptions: {Machine: [...], Assay: [...], ...}
- currentFilters: {Machine: "All", Assay: "All", ...}
- currentData: [...rows...]

IMPORTANT:
- All fetch calls include proper error handling
- Loading overlay shown during any API call
- Tab 2 plots auto-refresh when tab is activated (not just on filter change)
```

---

## PROMPT 7: frontend/js/filters.js — Filter Dropdown Logic

```
Create filters.js - handles the three dropdown filters for the QC metrics dashboard.

PURPOSE:
Manage categorical filter dropdowns and trigger data refresh on filter change.

FUNCTIONS:

1. populateFilters(filterOptions):
   - Input: {"Machine": ["All", "NovaSeq", "MiSeq", "NextSeq"], "Assay": ["All", ...], "Desired_Size": ["All", ...]}
   - Clear existing options from all three <select> elements
   - Populate each dropdown with options from filterOptions
   - Map filter keys to correct DOM element IDs:
     - Machine → #filter-machine
     - Assay → #filter-assay
     - Desired_Size → #filter-size
   - Set default selection to "All" for each
   - Attach 'change' event listener to each dropdown → calls applyFilters()

2. applyFilters():
   - Read current value from each dropdown
   - Build filters object: {"Machine": "NextSeq", "Assay": "WES", "Desired_Size": "200mbp"}
   - Store in window.appState.currentFilters
   - Show loading overlay
   - POST to /query with filters via fetch
   - On success:
     - Store returned data in window.appState.currentData
     - Call table.js renderTable() with the data
     - Update row count display ("Showing X of Y rows")
     - If Tab 2 is currently active, call plots.js renderPlots() with current filters
     - Hide loading overlay
   - On error: show alert, hide loading

3. getCurrentFilters() → dict:
   - Return current filter values from dropdowns
   - Utility function for other modules to read filter state

4. getFilterDisplayText() → string:
   - Return human-readable filter string for the banner
   - Format: "NextSeq | WES | 200mbp"
   - If a filter is "All", show "All Machines" / "All Assays" / "All Sizes"
   - Example: "All Machines | WES | 200mbp"

IMPORTANT:
- Filters use AND logic (handled by backend, frontend just sends values)
- Each dropdown is single-select only
- "All" means no filter applied for that category
- Filter change triggers BOTH table refresh AND plot refresh (if Tab 2 visible)
- Handle case where no data is loaded yet (don't send requests)
```

---

## PROMPT 8: frontend/js/table.js — Data Table Rendering

```
Create table.js - renders the scrollable data table for the QC metrics dashboard.

PURPOSE:
Dynamically build and update an HTML table showing filtered QC data.

FUNCTIONS:

1. renderTable(data, columns):
   - Input: data = array of row objects, columns = {categorical: [...], numerical: [...]}
   - Clear existing table content in #table-container
   - Build <table> with:

   HEADER (<thead>):
   - One <th> per column (all categorical + all numerical)
   - Column order: Sample_Name first, then categorical, then numerical
   - Sticky/fixed header (CSS handles this)

   BODY (<tbody>):
   - One <tr> per data row
   - Cell content from row object values
   - Numerical values formatted:
     - Q30: 1 decimal place + "%" (e.g., "92.5%")
     - Total_Yield: 2 decimal places + " GB" (e.g., "45.30 GB")
     - Pass_Filter: 1 decimal place + "%" (e.g., "88.2%")
     - Error_Rate: 2 decimal places + "%" (e.g., "0.85%")
   - Categorical values displayed as-is
   - Numerical cells right-aligned (via CSS class)

2. updateRowCount(filtered, total):
   - Update the row count display element
   - Format: "Showing {filtered} of {total} rows"

3. clearTable():
   - Remove all table content
   - Show placeholder if needed

IMPORTANT:
- Table must handle any number of columns dynamically (future-proof for adding metrics)
- Column names come from the parquet file, use them as-is for headers
- Format numerical values based on column type detection, not hardcoded names if possible
  (but formatting hints can be stored in appState)
- Empty data: show "No matching records found" message in table area
- Table body scrolls independently, header stays fixed
- Don't use pagination - continuous scroll for all rows
```

---

## PROMPT 9: frontend/js/plots.js — D3.js Box-and-Whisker Plots

```
Create plots.js - renders box-and-whisker plots using D3.js for the QC metrics dashboard.

PURPOSE:
Render one box-and-whisker plot per numerical column in a 2x2 grid, with jittered dots.

FUNCTIONS:

1. renderPlots(filters):
   - Input: filters object {"Machine": "NextSeq", "Assay": "WES", ...}
   - Update filter banner (#filter-banner) with human-readable filter text
   - Show loading
   - POST to /stats with filters via fetch
   - On success: for each numerical column in the response, call renderBoxPlot()
   - Dynamically create plot containers in #plot-grid if they don't exist
   - Clear old plots before rendering new ones

2. renderBoxPlot(containerId, columnName, stats):
   - Input:
     - containerId: e.g., "plot-0"
     - columnName: e.g., "Q30"
     - stats: {min, q1, median, q3, max, points: [...]}
   - Clear container SVG content
   - Set up SVG with margins (top: 40, right: 30, bottom: 40, left: 60)
   - SVG should be responsive to container size

   Y-AXIS:
   - Scale: d3.scaleLinear()
   - Domain: slightly padded beyond data min/max (or use fixed ranges if known)
   - Labeled with appropriate units based on column name
   - Tick formatting:
     - Q30, Pass_Filter: percentage (%)
     - Total_Yield: GB
     - Error_Rate: percentage (%)

   X-AXIS:
   - Single category: just the metric name centered

   BOX-AND-WHISKER:
   - Box: rectangle from Q1 to Q3
     - Fill: light steel blue (#4a90d9 with 0.3 opacity)
     - Stroke: darker blue (#2c5aa0)
     - Width: ~60px centered
   - Median line: horizontal line inside box
     - Color: dark (#2c3e50)
     - Stroke-width: 2px
   - Whiskers: vertical lines from min to Q1 and Q3 to max
     - Thin lines with horizontal caps at ends
     - Color: #555
   - Whisker caps: short horizontal lines at min and max

   JITTERED DOTS:
   - One dot per data point (from stats.points)
   - Y position: actual value
   - X position: centered with random horizontal jitter (spread ±20px)
   - Radius: 3-4px
   - Color: semi-transparent (#e74c3c with 0.5 opacity)
   - Jitter: random horizontal offset so dots don't stack vertically
   - Use d3 random or Math.random for jitter

   TITLE:
   - Column name centered above the plot
   - Font: bold, 14-16px

3. clearPlots():
   - Remove all SVG content from plot containers
   - Show placeholder if no data

IMPORTANT:
- Plots must handle any number of numerical columns dynamically
- Plot containers created dynamically based on number of numerical columns
- Grid layout (2 columns) handled by CSS, JS just creates the containers
- Handle edge cases:
  - Only 1 data point: show just the dot, no box
  - Empty data: show "No data" message in plot area
  - All same values: box collapses to line, still render correctly
- D3.js v7 syntax (use d3.select, d3.scaleLinear, etc.)
- SVG should resize if window resizes (responsive)
- Smooth transitions when data updates (optional but nice)
```

---

## PROMPT 10: README.md — Setup & Run Instructions

```
Create a README.md for a QC Metrics Dashboard application.

CONTENT:

# QC Metrics Dashboard

## Overview
Standalone local web dashboard for visualizing QC metrics from sequencing runs.
Upload a parquet file, filter by categorical columns, view data tables and box-and-whisker plots.

## Requirements
- Python 3.8+
- Modern web browser (Chrome, Firefox, Safari)

## Setup
1. Clone/download the project
2. Install Python dependencies:
   ```
   cd backend
   pip install -r requirements.txt
   ```

## Running
1. Start the dashboard:
   ```
   cd backend
   python app.py
   ```
2. Browser will auto-open to http://localhost:5000
3. Upload a parquet file to begin

## Usage
1. Click "Upload Parquet" and select your file
2. **Tab 1 - Data Table**: Use dropdown filters (Machine, Assay, Desired Size) to filter data. Table updates automatically.
3. **Tab 2 - Visualizations**: View box-and-whisker plots for each numerical metric. Plots reflect current filter selection.

## Parquet File Format
Expected columns:
- **Sample_Name** (text): Unique sample identifier
- **Machine** (text): Sequencing instrument (NovaSeq, MiSeq, NextSeq)
- **Assay** (text): Assay type (WGS, WES, mRNA, rRNA)
- **Desired_Size** (text): Target size/coverage (200mbp, 500mbp, 50x, 30x)
- **Q30** (numeric): Percentage of bases with quality score ≥30
- **Total_Yield** (numeric): Total yield in GB
- **Pass_Filter** (numeric): Percentage of reads passing filter
- **Error_Rate** (numeric): Sequencing error rate percentage

## Tech Stack
- Backend: Python, Flask, DuckDB
- Frontend: HTML/CSS/JavaScript, D3.js v7
```

---

## Build Order

Execute prompts in this order:
1. **Prompt 1**: requirements.txt (dependency list)
2. **Prompt 2**: database.py (DuckDB layer — no dependencies on other custom code)
3. **Prompt 3**: app.py (Flask server — depends on database.py)
4. **Prompt 4**: index.html (HTML structure — no JS dependencies)
5. **Prompt 5**: styles.css (styling — depends on HTML structure)
6. **Prompt 6**: main.js (app init — depends on HTML element IDs)
7. **Prompt 7**: filters.js (filter logic — depends on main.js global state)
8. **Prompt 8**: table.js (table rendering — depends on HTML + appState)
9. **Prompt 9**: plots.js (D3 visualizations — depends on everything above)
10. **Prompt 10**: README.md (documentation — last)
