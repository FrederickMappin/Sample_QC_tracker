# QC Metrics Dashboard

Standalone local dashboard for visualising QC metrics from sequencing runs.

## Requirements

- Python 3.9+
- Modern web browser (Chrome, Firefox, Safari)

## Setup

```bash
cd backend
pip install -r requirements.txt
```

## Running

```bash
cd backend
python app.py
```

Your browser will auto-open to **http://localhost:5000**.

## Usage

1. Click **Upload Parquet** and select your `.parquet` file.
2. **Tab 1 – Data Table**: Use the three dropdown filters (Machine, Assay, Desired Size) to narrow down data. The table updates automatically.
3. **Tab 2 – Visualizations**: View box-and-whisker plots (with jittered dots) for each numerical metric. Plots auto-refresh when filters change.

## Expected Parquet Columns

| Column | Type | Example values |
|---|---|---|
| Sample_Name | text | S001, S002 |
| Machine | text | NovaSeq, MiSeq, NextSeq |
| Assay | text | WGS, WES, mRNA, rRNA |
| Desired_Size | text | 200mbp, 500mbp, 50x, 30x |
| Q30 | numeric | 0–100 (%) |
| Total_Yield | numeric | GB |
| Pass_Filter | numeric | 0–100 (%) |
| Error_Rate | numeric | 0–5 (%) |

Additional numerical columns are detected and plotted automatically.

## Tech Stack

- **Backend**: Python · Flask · DuckDB
- **Frontend**: HTML/CSS/JS · D3.js v7
