/**
 * PMS Dashboard Charts — Chart.js wrappers (PNGCS palette).
 */
const PMSCharts = (() => {
  const COLORS = {
    navy: '#0E2A47',
    gold: '#D9A441',
    purple: '#4B2E83',
    maroon: '#6A1B3D',
    green: '#059669',
    amber: '#D97706',
    red: '#DC2626',
    blue: '#0284C7',
    slate: '#94A3B8',
  };

  const instances = {};

  function destroy(id) {
    if (instances[id]) {
      instances[id].destroy();
      delete instances[id];
    }
  }

  function getCtx(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    return el.getContext('2d');
  }

  function renderDonut(canvasId, labels, values) {
    destroy(canvasId);
    const ctx = getCtx(canvasId);
    if (!ctx || typeof Chart === 'undefined') return;
    instances[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: [COLORS.navy, COLORS.blue, COLORS.green, COLORS.amber, COLORS.purple, COLORS.red],
          borderWidth: 2,
          borderColor: '#ffffff',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        animation: { duration: 600 },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10,
              padding: 12,
              font: { size: 11 },
              color: '#475569',
            },
          },
        },
      },
    });
  }

  function renderLine(canvasId, labels, values, label = 'Trend') {
    destroy(canvasId);
    const ctx = getCtx(canvasId);
    if (!ctx || typeof Chart === 'undefined') return;
    instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label,
          data: values,
          borderColor: COLORS.navy,
          backgroundColor: 'rgb(14 42 71 / 0.08)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: COLORS.gold,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600 },
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 10 }, color: '#475569' },
          },
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1, font: { size: 10 }, color: '#475569' },
            grid: { color: '#e2e8f0' },
          },
        },
      },
    });
  }

  function renderBar(canvasId, labels, values, stacked = false) {
    destroy(canvasId);
    const ctx = getCtx(canvasId);
    if (!ctx || typeof Chart === 'undefined') return;
    instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Count',
          data: values,
          backgroundColor: labels.map((_, i) => {
            const opacities = [0.85, 0.65, 0.45];
            return `rgb(14 42 71 / ${opacities[i % 3]})`;
          }),
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600 },
        plugins: { legend: { display: false } },
        scales: {
          x: {
            stacked,
            grid: { display: false },
            ticks: { font: { size: 10 }, color: '#475569' },
          },
          y: {
            stacked,
            beginAtZero: true,
            ticks: { stepSize: 1, font: { size: 10 }, color: '#475569' },
            grid: { color: '#e2e8f0' },
          },
        },
      },
    });
  }

  return { renderDonut, renderLine, renderBar, destroy, COLORS };
})();
