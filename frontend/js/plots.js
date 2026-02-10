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

  // remove old legend if present
  const oldLegend = document.querySelector('.plot-legend');
  if (oldLegend) oldLegend.remove();

  const placeholder = document.getElementById('plots-placeholder');
  if (!statsData || Object.keys(statsData).length === 0) {
    placeholder.style.display = 'block';
    return;
  }
  placeholder.style.display = 'none';

  // check if any new samples exist
  const hasNewSamples = Object.values(statsData).some(
    s => s.new_points && s.new_points.length > 0
  );

  // ── legend ────────────────────────────────────────────
  if (hasNewSamples) {
    const legend = document.createElement('div');
    legend.className = 'plot-legend';
    legend.innerHTML =
      '<span class="legend-dot legend-dot-db"></span> Database ' +
      '<span class="legend-dot legend-dot-ns"></span> New Samples';
    grid.parentNode.insertBefore(legend, grid);
  }

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

  // ── jittered dots (database – rose) ────────────────────
  const jitterW = boxW * 0.75;
  svg.selectAll('.dot-db')
    .data(data.points)
    .enter()
    .append('circle')
      .attr('class', 'dot-db')
      .attr('cx', () => xC + (Math.random() - 0.5) * jitterW)
      .attr('cy', d  => y(d))
      .attr('r', 3.5)
      .attr('fill', '#e11d48')
      .attr('opacity', 0.45)
      .attr('stroke', '#fff')
      .attr('stroke-width', 0.5);

  // ── jittered dots (new samples – blue, with tooltips) ──
  if (data.new_points && data.new_points.length > 0) {
    // ensure tooltip div exists
    let tooltip = d3.select('#plot-tooltip');
    if (tooltip.empty()) {
      tooltip = d3.select('body').append('div')
        .attr('id', 'plot-tooltip')
        .attr('class', 'plot-tooltip');
    }

    svg.selectAll('.dot-ns')
      .data(data.new_points)
      .enter()
      .append('circle')
        .attr('class', 'dot-ns')
        .attr('cx', () => xC + (Math.random() - 0.5) * jitterW)
        .attr('cy', d  => y(d.value))
        .attr('r', 4)
        .attr('fill', '#2563eb')
        .attr('opacity', 0.7)
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5)
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
          d3.select(this).attr('r', 6).attr('opacity', 1);
          const label = d.name ? d.name : 'New Sample';
          const val = d.value != null ? d.value.toFixed(2) : '—';
          tooltip
            .style('display', 'block')
            .html('<strong>' + label + '</strong><br>' + formatTitle(colName) + ': ' + val);
        })
        .on('mousemove', function(event) {
          tooltip
            .style('left', (event.pageX + 12) + 'px')
            .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function() {
          d3.select(this).attr('r', 4).attr('opacity', 0.7);
          tooltip.style('display', 'none');
        });
  }

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
  // dynamic range: include both database and new sample points
  const dbPts = data.points || [];
  const nsPts = (data.new_points || []).map(p => typeof p === 'object' ? p.value : p).filter(v => v != null);
  const allPts = dbPts.concat(nsPts);
  const allMin = allPts.length > 0 ? Math.min(data.min, ...allPts) : data.min;
  const allMax = allPts.length > 0 ? Math.max(data.max, ...allPts) : data.max;
  const pad = (allMax - allMin) * 0.1 || 1;
  return [Math.max(0, allMin - pad), allMax + pad];
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
