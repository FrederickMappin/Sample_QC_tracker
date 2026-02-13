"""
DuckDB database layer for QC Metrics Dashboard.
Handles parquet loading, filtering, and box-plot statistics.
"""

import duckdb
import math

# Default machines that always appear in the Machine dropdown
DEFAULT_MACHINES = ['NovaSeq', 'MiSeq', 'NextSeq', 'Revio']


class QCDatabase:
    def __init__(self):
        self.conn = duckdb.connect(":memory:")
        self.loaded = False
        self.new_samples_loaded = False
        self.columns = {"categorical": [], "numerical": []}
        self.filter_options = {}
        self.total_rows = 0
        self.new_samples_rows = 0

    # ── public API ──────────────────────────────────────────────

    def load_parquet(self, file_path: str) -> dict:
        """Load a parquet file, classify columns, extract filter options."""
        self.conn.execute("DROP TABLE IF EXISTS qc_data")
        self.conn.execute(
            "CREATE TABLE qc_data AS SELECT * FROM read_parquet(?)", [file_path]
        )

        # classify columns
        col_info = self.conn.execute(
            "SELECT column_name, data_type FROM information_schema.columns "
            "WHERE table_name = 'qc_data'"
        ).fetchall()

        categorical, numerical = [], []
        for name, dtype in col_info:
            if dtype in ("VARCHAR", "BOOLEAN") or "CHAR" in dtype or "TEXT" in dtype:
                categorical.append(name)
            else:
                numerical.append(name)

        self.columns = {"categorical": categorical, "numerical": numerical}

        # build filter options (skip sample-name-like cols – first categorical col)
        filterable = [c for c in categorical if c.lower() not in ("sample_name", "sample", "samplename", "sample name")]
        self.filter_options = {}
        for col in filterable:
            vals = self.conn.execute(
                f'SELECT DISTINCT "{col}" FROM qc_data ORDER BY "{col}"'
            ).fetchall()
            data_values = [str(v[0]) for v in vals if v[0] is not None]
            
            # If this is the Machine column, merge defaults with data values
            if col.lower() == 'machine':
                combined = list(DEFAULT_MACHINES)  # Start with defaults
                for val in data_values:
                    if val not in combined:
                        combined.append(val)
                self.filter_options[col] = ["All"] + combined
            else:
                self.filter_options[col] = ["All"] + data_values

        self.total_rows = self.conn.execute("SELECT COUNT(*) FROM qc_data").fetchone()[0]
        self.loaded = True

        return {
            "columns": self.columns,
            "filter_options": self.filter_options,
            "total_rows": self.total_rows,
        }

    def load_new_samples(self, file_path: str) -> dict:
        """Load a parquet file as new samples into a separate table."""
        self.conn.execute("DROP TABLE IF EXISTS new_samples")
        self.conn.execute(
            "CREATE TABLE new_samples AS SELECT * FROM read_parquet(?)", [file_path]
        )
        self.new_samples_rows = self.conn.execute(
            "SELECT COUNT(*) FROM new_samples"
        ).fetchone()[0]
        self.new_samples_loaded = True

        return {
            "total_rows": self.new_samples_rows,
        }

    def clear_new_samples(self):
        """Remove the new samples table."""
        self.conn.execute("DROP TABLE IF EXISTS new_samples")
        self.new_samples_loaded = False
        self.new_samples_rows = 0

    def query_data(self, filters: dict) -> dict:
        """Return rows matching all filters (AND logic), plus new samples."""
        data = []
        new_data = []

        if self.loaded:
            where, params = self._build_where(filters)
            sql = f"SELECT * FROM qc_data{where}"
            result = self.conn.execute(sql, params)
            cols = [desc[0] for desc in result.description]
            rows = result.fetchall()
            data = [self._row_to_dict(cols, r) for r in rows]

        if self.new_samples_loaded:
            where, params = self._build_where(filters)
            try:
                sql = f"SELECT * FROM new_samples{where}"
                result = self.conn.execute(sql, params)
                cols = [desc[0] for desc in result.description]
                rows = result.fetchall()
                new_data = [self._row_to_dict(cols, r) for r in rows]
            except Exception:
                # filter columns may not exist in new_samples; query without filters
                result = self.conn.execute("SELECT * FROM new_samples")
                cols = [desc[0] for desc in result.description]
                rows = result.fetchall()
                new_data = [self._row_to_dict(cols, r) for r in rows]

        return {"data": data, "new_data": new_data}

    def get_stats(self, filters: dict) -> dict:
        """Return box-plot statistics for every numerical column."""
        if not self.loaded:
            return {}
        where, params = self._build_where(filters)
        stats = {}
        for col in self.columns["numerical"]:
            agg_sql = (
                f'SELECT '
                f'MIN("{col}") AS mn, '
                f'PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY "{col}") AS q1, '
                f'MEDIAN("{col}") AS med, '
                f'PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY "{col}") AS q3, '
                f'MAX("{col}") AS mx '
                f'FROM qc_data{where}'
            )
            row = self.conn.execute(agg_sql, params).fetchone()
            if where:
                pts_sql = f'SELECT "{col}" FROM qc_data{where} AND "{col}" IS NOT NULL'
            else:
                pts_sql = f'SELECT "{col}" FROM qc_data WHERE "{col}" IS NOT NULL'
            points = [p[0] for p in self.conn.execute(pts_sql, params).fetchall()]

            # new samples points (with sample names for tooltips)
            new_points = []
            if self.new_samples_loaded:
                # detect sample name column in new_samples
                ns_name_col = self._detect_sample_name_col("new_samples")
                try:
                    if ns_name_col:
                        select_part = f'"{ns_name_col}", "{col}"'
                    else:
                        select_part = f'"{col}"'
                    if where:
                        ns_sql = f'SELECT {select_part} FROM new_samples{where} AND "{col}" IS NOT NULL'
                    else:
                        ns_sql = f'SELECT {select_part} FROM new_samples WHERE "{col}" IS NOT NULL'
                    rows_ns = self.conn.execute(ns_sql, params).fetchall()
                    if ns_name_col:
                        new_points = [{"name": str(r[0]), "value": r[1]} for r in rows_ns]
                    else:
                        new_points = [{"value": r[0]} for r in rows_ns]
                except Exception:
                    try:
                        if ns_name_col:
                            ns_sql = f'SELECT "{ns_name_col}", "{col}" FROM new_samples WHERE "{col}" IS NOT NULL'
                        else:
                            ns_sql = f'SELECT "{col}" FROM new_samples WHERE "{col}" IS NOT NULL'
                        rows_ns = self.conn.execute(ns_sql, []).fetchall()
                        if ns_name_col:
                            new_points = [{"name": str(r[0]), "value": r[1]} for r in rows_ns]
                        else:
                            new_points = [{"value": r[0]} for r in rows_ns]
                    except Exception:
                        new_points = []

            if row[0] is not None:
                stats[col] = {
                    "min": self._safe_float(row[0]),
                    "q1": self._safe_float(row[1]),
                    "median": self._safe_float(row[2]),
                    "q3": self._safe_float(row[3]),
                    "max": self._safe_float(row[4]),
                    "points": [self._safe_float(p) for p in points],
                    "new_points": [self._safe_float_obj(p) for p in new_points],
                }
            else:
                stats[col] = {"min": 0, "q1": 0, "median": 0, "q3": 0, "max": 0, "points": [], "new_points": [self._safe_float_obj(p) for p in new_points]}
        return stats

    def get_filter_options(self) -> dict:
        return self.filter_options

    def get_column_info(self) -> dict:
        return self.columns

    # ── helpers ──────────────────────────────────────────────────

    def _build_where(self, filters: dict) -> tuple[str, list]:
        """Build a WHERE clause from filter dict; skip 'All' values."""
        clauses, params = [], []
        for col, val in filters.items():
            if val and val != "All":
                clauses.append(f'"{col}" = ?')
                params.append(val)
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        return where, params

    @staticmethod
    def _row_to_dict(cols: list[str], row: tuple) -> dict:
        d = {}
        for c, v in zip(cols, row):
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                d[c] = None
            else:
                d[c] = v
        return d

    def _detect_sample_name_col(self, table: str) -> str | None:
        """Find the sample-name-like column in a table."""
        try:
            col_info = self.conn.execute(
                f"SELECT column_name FROM information_schema.columns "
                f"WHERE table_name = '{table}'"
            ).fetchall()
            for (name,) in col_info:
                if name.lower() in ("sample_name", "sample", "samplename", "sample name"):
                    return name
        except Exception:
            pass
        return None

    @staticmethod
    def _safe_float(v):
        try:
            f = float(v)
            return None if (math.isnan(f) or math.isinf(f)) else f
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _safe_float_obj(obj):
        """Safe-float for {name, value} dict objects."""
        if isinstance(obj, dict):
            try:
                f = float(obj["value"])
                val = None if (math.isnan(f) or math.isinf(f)) else f
            except (TypeError, ValueError):
                val = None
            result = {"value": val}
            if "name" in obj:
                result["name"] = obj["name"]
            return result
        # fallback for plain numbers
        try:
            f = float(obj)
            return {"value": None if (math.isnan(f) or math.isinf(f)) else f}
        except (TypeError, ValueError):
            return {"value": None}
