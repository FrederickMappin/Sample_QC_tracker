/**
 * plots.js – D3.js box-and-whisker plots with jittered dots.
 */

/**
 * Render one box-and-whisker plot per numerical column.
 * @param {Object} statsData – { colName: {min, q1, median, q3, max, points}, … }
 */
function renderPlots(statsData) {
  const grid = document.getElementById('plot-grid');
  grid.innerHTML = '';                                    // clear old plots

  const placeholder = document.getElementById('plots-placeholder');
  if (!statsData || Object.keys(statsData).length === 0) {
    placeholder.style.display = 'block';
    return;
  }
  placeholder.style.display = 'none';

  Object.entries(statsData).forEach(([col, stats], idx) => {
    // ── create card ──────────────────────────────────────
    const card = document.createElement('div');
    card.className = 'plot-card';
    card.id = 'plot-' + idx;

    const title = document.createElement('h3');
    title.textContent = formatTitle(col);
    card.appendChild(title);

    grid.appendChild(card);

    // ── render D3 plot ───────────────────────────────────
    renderBoxPlot(card, col, stats);
  });
}

/* ── Box-and-whisker plot ──────────────────────────────── */

function renderBoxPlot(container, colName, data) {
  if (!data.points || data.points.length === 0) {
    const msg = document.createElement('p');
    msg.textContent = 'No data';
    msg.style.textAlign = 'center';
    msg.style.color = '#94a3b8';
    container.appendChild(msg);
    return;
  }

  const margin = { top: 10, right: 30, bottom: 35, left: 60 };
  const width  = 380 - margin.left - margin.right;
  const height = 300 - margin.top  - margin.bottom;

  const svg = d3.select(container)
    .append('svg')
      .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('width', '100%')
    .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

  // ── Y scale ────────────────────────────────────────────
  const [yMin, yMax] = yDomainFor(colName, data);
  const y = d3.scaleLinear().domain([yMin, yMax]).nice().range([height, 0]);
  svg.append('g').call(d3.axisLeft(y).ticks(6));

  // ── Y-axis label ───────────────────────────────────────
  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', -margin.left + 14)
    .attr('x', -height / 2)
    .attr('text-anchor', 'middle')
    .attr('font-size', '0.75rem')
    .attr('fill', '#64748b')
    .text(unitLabel(colName));

  // ── x centre ───────────────────────────────────────────
  const xC    = width / 2;
  const boxW  = 70;

  // ── whisker (min→max) ──────────────────────────────────
  svg.append('line')
    .attr('x1', xC).attr('x2', xC)
    .attr('y1', y(data.min)).attr('y2', y(data.max))
    .attr('stroke', '#475569').attr('stroke-width', 1.5);

  // whisker caps
  [data.min, data.max].forEach(v => {
    svg.append('line')
      .attr('x1', xC - 14).attr('x2', xC + 14)
      .attr('y1', y(v)).attr('y2', y(v))
      .attr('stroke', '#475569').attr('stroke-width', 1.5);
  });

  // ── box (Q1→Q3) ───────────────────────────────────────
  svg.append('rect')
    .attr('x', xC - boxW / 2)
    .attr('y', y(data.q3))
    .attr('width', boxW)
    .attr('height', Math.max(0, y(data.q1) - y(data.q3)))
    .attr('fill', 'rgba(59,130,246,0.18)')
    .attr('stroke', '#3b82f6')
    .attr('stroke-width', 2)
    .attr('rx', 3);

  // ── median ─────────────────────────────────────────────
  svg.append('line')
    .attr('x1', xC - boxW / 2).attr('x2', xC + boxW / 2)
    .attr('y1', y(data.median)).attr('y2', y(data.median))
    .attr('stroke', '#dc2626').attr('stroke-width', 2.5);

  // ── jittered dots ──────────────────────────────────────
  const jitterW = boxW * 0.75;
  svg.selectAll('.dot')
    .data(data.points)
    .enter()
    .append('circle')
      .attr('cx', () => xC + (Math.random() - 0.5) * jitterW)
      .attr('cy', d  => y(d))
      .attr('r', 3.5)
      .attr('fill', '#e11d48')
      .attr('opacity', 0.45)
      .attr('stroke', '#fff')
      .attr('stroke-width', 0.5);

  // ── x-axis label ───────────────────────────────────────
  svg.append('text')
    .attr('x', xC)
    .attr('y', height + margin.bottom - 6)
    .attr('text-anchor', 'middle')
    .attr('font-size', '0.8rem')
    .attr('fill', '#334155')
    .text(formatTitle(colName));
}

/* ── helpers ───────────────────────────────────────────── */

function yDomainFor(col, data) {
  const lo = col.toLowerCase();
  if (lo.includes('q30') || lo.includes('pass'))  return [0, 100];
  if (lo.includes('error'))                         return [0, 5];
  // dynamic range for yield or unknown columns
  const pad = (data.max - data.min) * 0.1 || 1;
  return [Math.max(0, data.min - pad), data.max + pad];
}

function unitLabel(col) {
  const lo = col.toLowerCase();
  if (lo.includes('q30'))    return '% bases ≥ Q30';
  if (lo.includes('yield'))  return 'Gigabases (GB)';
  if (lo.includes('pass'))   return '% pass filter';
  if (lo.includes('error'))  return '% error rate';
  return col.replace(/_/g, ' ');
}

function formatTitle(col) {
  return col.replace(/_/g, ' ');
}
