let chartLoader;
const chartInstances = new WeakMap();

async function loadChartJs() {
  if (window.Chart) return window.Chart;
  if (!chartLoader) chartLoader = new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js'; script.onload = () => resolve(window.Chart); script.onerror = reject; document.head.appendChild(script); });
  return chartLoader;
}

export async function renderInterviewChart(element, values, { color = '#5B7CFA', label = 'Score' } = {}) {
  if (!element) return;
  const Chart = await loadChartJs();
  chartInstances.get(element)?.destroy?.();
  element.innerHTML = '<canvas aria-label="Interview trend chart"></canvas>';
  const chart = new Chart(element.querySelector('canvas'), { type: 'line', data: { labels: values.map((_, index) => `Q${index + 1}`), datasets: [{ label, data: values, borderColor: color, backgroundColor: `${color}33`, fill: true, tension: 0.35 }] }, options: { responsive: true, maintainAspectRatio: false, animation: false, resizeDelay: 120, scales: { y: { min: 0, max: 100 } }, plugins: { legend: { display: false } } } });
  chartInstances.set(element, chart);
  element.style.height = '220px';
}

export function destroyInterviewChart(element) { chartInstances.get(element)?.destroy?.(); chartInstances.delete(element); }