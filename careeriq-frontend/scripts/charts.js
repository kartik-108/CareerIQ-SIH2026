// charts.js — lightweight, dependency-free SVG chart renderers.
// Every function returns/injects raw SVG so there's no charting library
// dependency, matching the "no frameworks" constraint.

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

/**
 * Renders an animated circular progress ring into `container`.
 * value: 0-100. Injects a gradient def once per ring.
 */
export function renderRing(container, { value = 0, size = 140, label = '', caption = '', colorFrom = '#5B7CFA', colorTo = '#34D9E8' } = {}) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const gradientId = `ringGradient-${Math.random().toString(36).slice(2, 9)}`;

  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'ring-wrap';

  const svg = svgEl('svg', { class: 'ring-svg', width: size, height: size, viewBox: `0 0 ${size} ${size}` });
  const defs = svgEl('defs');
  const gradient = svgEl('linearGradient', { id: gradientId, x1: '0%', y1: '0%', x2: '100%', y2: '100%' });
  gradient.appendChild(svgEl('stop', { offset: '0%', 'stop-color': colorFrom }));
  gradient.appendChild(svgEl('stop', { offset: '100%', 'stop-color': colorTo }));
  defs.appendChild(gradient);
  svg.appendChild(defs);

  const track = svgEl('circle', { class: 'ring-track', cx: size / 2, cy: size / 2, r: radius });
  svg.appendChild(track);

  const valueCircle = svgEl('circle', {
    class: 'ring-value',
    cx: size / 2,
    cy: size / 2,
    r: radius,
    stroke: `url(#${gradientId})`,
    'stroke-dasharray': circumference,
    'stroke-dashoffset': circumference,
  });
  svg.appendChild(valueCircle);

  const labelDiv = document.createElement('div');
  labelDiv.className = 'ring-label';
  labelDiv.innerHTML = `<span class="value">${label || value}</span><span class="caption">${caption}</span>`;

  wrap.appendChild(svg);
  wrap.appendChild(labelDiv);
  container.appendChild(wrap);

  // Animate on next frame so the transition actually plays.
  requestAnimationFrame(() => {
    const offset = circumference - (Math.max(0, Math.min(100, value)) / 100) * circumference;
    valueCircle.style.strokeDashoffset = offset;
  });

  return wrap;
}

/**
 * Renders a simple animated line chart. data: [{label, value}]
 */
export function renderLineChart(container, data, { width = 560, height = 220, color = '#5B7CFA', fillId = null } = {}) {
  container.innerHTML = '';
  if (!data.length) return;

  const padding = 32;
  const max = Math.max(...data.map((d) => d.value)) * 1.15 || 1;
  const min = Math.min(0, ...data.map((d) => d.value));
  const stepX = (width - padding * 2) / (data.length - 1 || 1);

  const points = data.map((d, i) => {
    const x = padding + i * stepX;
    const y = height - padding - ((d.value - min) / (max - min || 1)) * (height - padding * 2);
    return [x, y];
  });

  const pathD = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  const gradId = fillId || `lineFill-${Math.random().toString(36).slice(2, 9)}`;

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, preserveAspectRatio: 'none' });

  const defs = svgEl('defs');
  const grad = svgEl('linearGradient', { id: gradId, x1: '0', y1: '0', x2: '0', y2: '1' });
  grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': '0.35' }));
  grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '0' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  // Grid lines
  for (let i = 0; i <= 3; i++) {
    const y = padding + ((height - padding * 2) / 3) * i;
    svg.appendChild(svgEl('line', { x1: padding, y1: y, x2: width - padding, y2: y, stroke: 'var(--border-subtle)', 'stroke-width': 1 }));
  }

  const areaD = `${pathD} L${points[points.length - 1][0]},${height - padding} L${points[0][0]},${height - padding} Z`;
  const area = svgEl('path', { d: areaD, fill: `url(#${gradId})`, stroke: 'none' });
  svg.appendChild(area);

  const path = svgEl('path', { d: pathD, fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const length = 2000; // safe upper bound for dash animation
  path.style.strokeDasharray = length;
  path.style.strokeDashoffset = length;
  svg.appendChild(path);

  points.forEach(([x, y]) => {
    svg.appendChild(svgEl('circle', { cx: x, cy: y, r: 3.5, fill: color }));
  });

  container.appendChild(svg);

  requestAnimationFrame(() => {
    path.style.transition = 'stroke-dashoffset 1.1s var(--ease-out, ease-out)';
    path.style.strokeDashoffset = '0';
  });
}

/**
 * Renders a radar/spider chart. axes: [{label, value(0-100)}]
 */
export function renderRadarChart(container, axes, { size = 280, color = '#9B6BFF' } = {}) {
  container.innerHTML = '';
  const center = size / 2;
  const radius = size / 2 - 40;
  const angleStep = (Math.PI * 2) / axes.length;

  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, width: '100%', height: size });

  // Grid rings
  [0.25, 0.5, 0.75, 1].forEach((frac) => {
    const pts = axes.map((_, i) => {
      const angle = angleStep * i - Math.PI / 2;
      const r = radius * frac;
      return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
    });
    svg.appendChild(svgEl('polygon', { points: pts.join(' '), fill: 'none', stroke: 'var(--border-subtle)', 'stroke-width': 1 }));
  });

  // Axis lines + labels
  axes.forEach((axis, i) => {
    const angle = angleStep * i - Math.PI / 2;
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    svg.appendChild(svgEl('line', { x1: center, y1: center, x2: x, y2: y, stroke: 'var(--border-subtle)', 'stroke-width': 1 }));

    const labelX = center + (radius + 22) * Math.cos(angle);
    const labelY = center + (radius + 22) * Math.sin(angle);
    const text = svgEl('text', {
      x: labelX, y: labelY, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      fill: 'var(--text-secondary)', 'font-size': '11', 'font-family': 'Inter, sans-serif',
    });
    text.textContent = axis.label;
    svg.appendChild(text);
  });

  // Value polygon
  const valuePts = axes.map((axis, i) => {
    const angle = angleStep * i - Math.PI / 2;
    const r = radius * (Math.max(0, Math.min(100, axis.value)) / 100);
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  });
  const polygon = svgEl('polygon', {
    points: valuePts.map((p) => p.join(',')).join(' '),
    fill: color, 'fill-opacity': '0.22', stroke: color, 'stroke-width': 2,
  });
  polygon.style.transformOrigin = `${center}px ${center}px`;
  polygon.style.transform = 'scale(0)';
  polygon.style.transition = 'transform 0.8s var(--ease-out, ease-out)';
  svg.appendChild(polygon);

  valuePts.forEach(([x, y]) => svg.appendChild(svgEl('circle', { cx: x, cy: y, r: 3, fill: color })));

  container.appendChild(svg);
  requestAnimationFrame(() => { polygon.style.transform = 'scale(1)'; });
}

/**
 * Renders a simple vertical bar chart. data: [{label, value}]
 */
export function renderBarChart(container, data, { width = 560, height = 220, color = '#34D9E8' } = {}) {
  container.innerHTML = '';
  if (!data.length) return;

  const padding = 32;
  const max = Math.max(...data.map((d) => d.value)) * 1.15 || 1;
  const barWidth = ((width - padding * 2) / data.length) * 0.55;
  const gap = ((width - padding * 2) / data.length) * 0.45;

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height });

  data.forEach((d, i) => {
    const x = padding + i * (barWidth + gap) + gap / 2;
    const barHeight = ((height - padding * 2) * d.value) / max;
    const y = height - padding - barHeight;

    const rect = svgEl('rect', { x, y: height - padding, width: barWidth, height: 0, rx: 6, fill: color, opacity: 0.85 });
    svg.appendChild(rect);

    const label = svgEl('text', {
      x: x + barWidth / 2, y: height - padding + 16, 'text-anchor': 'middle',
      fill: 'var(--text-tertiary)', 'font-size': '10', 'font-family': 'Inter, sans-serif',
    });
    label.textContent = d.label;
    svg.appendChild(label);

    requestAnimationFrame(() => {
      rect.style.transition = 'height 0.7s var(--ease-out, ease-out), y 0.7s var(--ease-out, ease-out)';
      rect.setAttribute('height', barHeight);
      rect.setAttribute('y', y);
    });
  });

  container.appendChild(svg);
}
