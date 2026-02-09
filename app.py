import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

# ── Page config ──────────────────────────────────────────────────────────────
st.set_page_config(page_title="Parquet Data Explorer", layout="wide")
st.title("🔬 Sequencing Data Explorer")

# ── Load data ────────────────────────────────────────────────────────────────
DATA_PATH = "sequencing_data.parquet"


@st.cache_data
def load_data():
    return pd.read_parquet(DATA_PATH)


df = load_data()

# Separate column types
non_numeric_cols = df.select_dtypes(exclude="number").columns.tolist()
numeric_cols = df.select_dtypes(include="number").columns.tolist()

# ── Sidebar: categorical filters ─────────────────────────────────────────────
st.sidebar.header("🏷️ Filter by Category")

selected_categories = {}
for col in non_numeric_cols:
    unique_vals = sorted(df[col].dropna().unique().tolist())
    selected = st.sidebar.multiselect(
        f"**{col}**",
        options=unique_vals,
        default=unique_vals,
        key=f"cat_{col}",
    )
    selected_categories[col] = selected

# ── Sidebar: numeric range sliders ───────────────────────────────────────────
st.sidebar.header("📏 Numeric Ranges")

range_filters = {}
for col in numeric_cols:
    col_min = float(df[col].min())
    col_max = float(df[col].max())
    step = 1.0 if df[col].dtype == "int64" else 0.1
    selected_range = st.sidebar.slider(
        f"**{col}**",
        min_value=col_min,
        max_value=col_max,
        value=(col_min, col_max),
        step=step,
        key=f"range_{col}",
    )
    range_filters[col] = selected_range

# ── Apply filters ────────────────────────────────────────────────────────────
filtered = df.copy()

for col, vals in selected_categories.items():
    filtered = filtered[filtered[col].isin(vals)]

for col, (lo, hi) in range_filters.items():
    filtered = filtered[(filtered[col] >= lo) & (filtered[col] <= hi)]

# ── Summary metrics ──────────────────────────────────────────────────────────
st.markdown("---")
st.subheader(f"📊 Filtered Data — {len(filtered)} / {len(df)} rows")

metric_cols = st.columns(len(numeric_cols))
for i, col in enumerate(numeric_cols):
    with metric_cols[i]:
        st.metric(label=col, value=f"{filtered[col].mean():.2f}", delta=f"range {filtered[col].min():.1f}–{filtered[col].max():.1f}")

# ── Categorical column visualizations ────────────────────────────────────────
st.markdown("---")
st.subheader("🏷️ Non-Numeric Column Distributions")

cat_tabs = st.tabs([f"📌 {col}" for col in non_numeric_cols])

for tab, col in zip(cat_tabs, non_numeric_cols):
    with tab:
        value_counts = filtered[col].value_counts().reset_index()
        value_counts.columns = [col, "Count"]

        left, right = st.columns(2)

        with left:
            fig_bar = px.bar(
                value_counts,
                x=col,
                y="Count",
                color=col,
                title=f"Counts per {col}",
                text="Count",
            )
            fig_bar.update_layout(showlegend=False, height=400)
            fig_bar.update_traces(textposition="outside")
            st.plotly_chart(fig_bar, use_container_width=True)

        with right:
            fig_pie = px.pie(
                value_counts,
                names=col,
                values="Count",
                title=f"Proportion of {col}",
                hole=0.4,
            )
            fig_pie.update_layout(height=400)
            st.plotly_chart(fig_pie, use_container_width=True)

        # Show numeric breakdown per category value
        st.markdown(f"**Numeric breakdown by {col}**")
        breakdown = (
            filtered.groupby(col)[numeric_cols]
            .agg(["mean", "min", "max", "count"])
            .round(2)
        )
        breakdown.columns = [f"{m} ({s})" for m, s in breakdown.columns]
        st.dataframe(breakdown, use_container_width=True)

# ── Per-numeric-column charts (grouped by selected category) ─────────────────
st.markdown("---")
st.subheader("📈 Numeric Columns — Detailed View")

color_by = st.selectbox(
    "Color / group charts by:",
    options=non_numeric_cols,
    index=1,  # default to Assay
)

num_tabs = st.tabs([f"📐 {col}" for col in numeric_cols])

for tab, col in zip(num_tabs, numeric_cols):
    with tab:
        row1_left, row1_right = st.columns(2)

        with row1_left:
            fig_hist = px.histogram(
                filtered,
                x=col,
                color=color_by,
                barmode="overlay",
                opacity=0.7,
                title=f"Distribution of {col}",
                marginal="rug",
            )
            fig_hist.update_layout(height=420)
            st.plotly_chart(fig_hist, use_container_width=True)

        with row1_right:
            fig_box = px.box(
                filtered,
                x=color_by,
                y=col,
                color=color_by,
                points="all",
                title=f"{col} by {color_by}",
            )
            fig_box.update_layout(height=420, showlegend=False)
            st.plotly_chart(fig_box, use_container_width=True)

        row2_left, row2_right = st.columns(2)

        with row2_left:
            fig_strip = px.strip(
                filtered,
                x=color_by,
                y=col,
                color=color_by,
                title=f"{col} strip plot",
            )
            fig_strip.update_layout(height=380, showlegend=False)
            st.plotly_chart(fig_strip, use_container_width=True)

        with row2_right:
            fig_violin = px.violin(
                filtered,
                x=color_by,
                y=col,
                color=color_by,
                box=True,
                title=f"{col} violin plot",
            )
            fig_violin.update_layout(height=380, showlegend=False)
            st.plotly_chart(fig_violin, use_container_width=True)

# ── Raw data table ───────────────────────────────────────────────────────────
st.markdown("---")
with st.expander("📋 View Filtered Raw Data", expanded=False):
    st.dataframe(filtered, use_container_width=True, height=400)

# ── Correlation heatmap ──────────────────────────────────────────────────────
st.markdown("---")
with st.expander("🔥 Numeric Correlation Heatmap", expanded=False):
    corr = filtered[numeric_cols].corr().round(2)
    fig_heat = px.imshow(
        corr,
        text_auto=True,
        color_continuous_scale="RdBu_r",
        title="Correlation Matrix",
        aspect="auto",
    )
    fig_heat.update_layout(height=450)
    st.plotly_chart(fig_heat, use_container_width=True)
