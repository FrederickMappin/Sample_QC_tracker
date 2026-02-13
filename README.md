# QC Metrics Dashboard

A standalone, local web dashboard for visualising and filtering quality-control metrics from Illumina sequencing runs. Upload a `.parquet` file and instantly explore data through filterable tables and interactive box plots — no cloud service or database server required.

---

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Usage](#usage)
- [Parquet File Format](#parquet-file-format)
- [Filter Dropdowns](#filter-dropdowns)
- [Tech Stack](#tech-stack)
- [Troubleshooting](#troubleshooting)

---

## Features

- **Upload & explore** — drag-and-drop `.parquet` files; data is loaded into an in-memory DuckDB instance (nothing leaves your machine).
- **Cascading filters** — select a sequencing **Type** and the **Package** dropdown automatically updates to show only the relevant size/coverage options.
- **Interactive visualisations** — box-and-whisker plots with jittered data points for every numerical column (powered by D3.js).
- **New-sample overlay** — upload a second parquet to highlight new samples against the existing database on both the table and plots.
- **Zero configuration** — no external database, no Docker, no environment variables. Just Python and a browser.

---

## Requirements

| Dependency | Version |
|---|---|
| Python | 3.9 + |
| pip packages | see `backend/requirements.txt` |
| Browser | Any modern browser (Chrome, Firefox, Safari, Edge) |

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/FrederickMappin/Sample_QC_tracker.git
cd Sample_QC_tracker

# 2. (Optional) Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # macOS / Linux
# venv\Scripts\activate         # Windows

# 3. Install Python dependencies
pip install -r backend/requirements.txt

# 4. Start the server
cd backend
python app.py
```

The dashboard opens automatically at **http://127.0.0.1:5000**. If it doesn't, open that URL manually in your browser.

---

## Project Structure

```
Sample_QC_tracker/
├── backend/
│   ├── app.py              # Flask server — routes, static file serving
│   ├── database.py         # DuckDB layer — parquet loading, filtering, stats
│   ├── requirements.txt    # Python dependencies
│   └── uploads/            # Temporary storage for uploaded parquet files
├── frontend/
│   ├── index.html          # Single-page app shell
│   ├── css/
│   │   └── styles.css      # Dashboard styling
│   └── js/
│       ├── main.js         # App init, tab switching, file upload handlers
│       ├── filters.js      # Dropdown population, cascading logic, query dispatch
│       ├── table.js        # Data table rendering
│       └── plots.js        # D3.js box-plot visualisations
├── IMPLEMENTATION_PROMPTS.md
└── README.md
```

---

## Usage

### 1. Upload a database

Click **Upload Database** and select a `.parquet` file. The file is loaded into an in-memory DuckDB table; the Machine filter populates from the data, and the Type / Package filters are ready to use.

### 2. Filter data (Tab 1 — Data Table)

| Filter | Behaviour |
|---|---|
| **Machine** | Populated dynamically from distinct values in the parquet `Machine` column. |
| **Type** | Hardcoded list of sequencing assay types (see [Filter Dropdowns](#filter-dropdowns)). |
| **Package** | Cascades from the selected Type — only shows the sizes/coverages relevant to that assay. |

Selecting any filter immediately re-queries the backend and updates the table.

### 3. Visualise data (Tab 2 — Visualizations)

Switch to the **Visualizations** tab to see box-and-whisker plots for every numerical column. Plots respect the current filter selections and refresh automatically.

### 4. Overlay new samples

Click **Upload New Samples** with a second `.parquet` file. New-sample rows appear highlighted in the table and as distinct points on the box plots, making it easy to see where new data falls relative to the existing database.

---

## Parquet File Format

The dashboard auto-detects columns by data type. Text/varchar columns become filters; numeric columns become plottable metrics. The expected schema is:

| Column | Type | Description | Example Values |
|---|---|---|---|
| `Sample_Name` | text | Unique sample identifier | S001, S002 |
| `Machine` | text | Sequencing instrument | NovaSeq, MiSeq, NextSeq, Revio |
| `Assay` | text | Assay / sequencing type | WGS, WES, mRNA, rRNA, Pacbio WGS, Pacbio AAV, Pacbio IsoSeq |
| `Desired_Size` | text | Target size or coverage | 200 Mbp, 50x, 100M |
| `Q30` | numeric | Percentage of bases ≥ Q30 | 0–100 |
| `Total_Yield` | numeric | Total yield (Gb) | 0–500 |
| `Pass_Filter` | numeric | % clusters passing filter | 0–100 |
| `Error_Rate` | numeric | Sequencing error rate (%) | 0–5 |

> Additional numeric columns are detected and plotted automatically. The `Assay` column maps to the **Type** filter and `Desired_Size` maps to the **Package** filter in the UI.

---

## Filter Dropdowns

### Type (hardcoded)

| Type |
|---|
| Illumina Whole Exome Sequencing |
| Illumina Whole Genome Sequencing |
| mRNA Enrichment |
| rRNA Depletion |
| Pacbio WGS |
| Pacbio AAV |
| Pacbio IsoSeq |

### Package (cascades from Type)

| Type | Available Packages |
|---|---|
| **Illumina Whole Exome Sequencing** | 200 Mbp, 400 Mbp, 650 Mbp, 1 Gbp, 2 Gbp, 5 Gbp, 10 Gbp, 25 Gbp, 50 Gbp, 30×, 60x |
| **Illumina Whole Genome Sequencing** | 50x, 100x, 200x |
| **mRNA Enrichment** | 25M, 50M, 100M, 200M |
| **rRNA Depletion** | 12M, 25M, 50M, 100M, 200M |
| **Pacbio WGS** | 25M |
| **Pacbio AAV** | 25M |
| **Pacbio IsoSeq** | 25M |

When **Type** is set to "All", the Package dropdown shows the combined (deduplicated) set of all values.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3 · Flask · DuckDB |
| Frontend | HTML / CSS / vanilla JS · D3.js v7 |
| Data format | Apache Parquet (via PyArrow) |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `ModuleNotFoundError: No module named 'flask'` | Run `pip install -r backend/requirements.txt` (activate your venv first). |
| Browser doesn't open automatically | Navigate to **http://127.0.0.1:5000** manually. |
| Port 5000 already in use | Kill the other process (`lsof -i :5000`) or change the port in `backend/app.py`. |
| Filters don't match parquet columns | Ensure your parquet has `Machine`, `Assay`, and `Desired_Size` text columns. The UI maps `Assay` → Type and `Desired_Size` → Package automatically. |
| New samples not highlighting | The new-samples parquet must share the same column schema as the database parquet. |
