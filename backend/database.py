"""
DuckDB database layer for QC Metrics Dashboard.
Handles parquet loading, filtering, and box-plot statistics.
"""

import duckdb
import math


class QCDatabase:
    def __init__(self):
        self.conn = duckdb.connect(":memory:")
        self.loaded = False
        self.columns = {"categorical": [], "numerical": []}
        self.filter_options = {}
        self.total_rows = 0

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
            self.filter_options[col] = ["All"] + [str(v[0]) for v in vals if v[0] is not None]

        self.total_rows = self.conn.execute("SELECT COUNT(*) FROM qc_data").fetchone()[0]
        self.loaded = True

        return {
            "columns": self.columns,
            "filter_options": self.filter_options,
            "total_rows": self.total_rows,
        }

    def query_data(self, filters: dict) -> list[dict]:
        """Return rows matching all filters (AND logic)."""
        if not self.loaded:
            return []
        where, params = self._build_where(filters)
        sql = f"SELECT * FROM qc_data{where}"
        result = self.conn.execute(sql, params)
        cols = [desc[0] for desc in result.description]
        rows = result.fetchall()
        return [self._row_to_dict(cols, r) for r in rows]

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

            if row[0] is not None:
                stats[col] = {
                    "min": self._safe_float(row[0]),
                    "q1": self._safe_float(row[1]),
                    "median": self._safe_float(row[2]),
                    "q3": self._safe_float(row[3]),
                    "max": self._safe_float(row[4]),
                    "points": [self._safe_float(p) for p in points],
                }
            else:
                stats[col] = {"min": 0, "q1": 0, "median": 0, "q3": 0, "max": 0, "points": []}
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

    @staticmethod
    def _safe_float(v):
        try:
            f = float(v)
            return None if (math.isnan(f) or math.isinf(f)) else f
        except (TypeError, ValueError):
            return None
