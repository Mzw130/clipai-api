/**
 * 收入分析页面 — 月度收入趋势 + 方案细分
 */
const RevenueAnalyticsView = (() => {
  let chart = null;
  let state = { months: 12 };

  async function render() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading">加载中...</div>';

    try {
      const res = await AdminAPI.getRevenueBreakdown(state.months);
      const data = res.data || [];

      // Aggregate
      const totalRevenue = data.reduce((s, d) => s + Number(d.revenue), 0);
      const totalCount = data.reduce((s, d) => s + d.count, 0);

      // Group by month
      const monthlyMap = {};
      const planSet = new Set();
      data.forEach(d => {
        if (!monthlyMap[d.month]) monthlyMap[d.month] = {};
        monthlyMap[d.month][d.plan_name] = { count: d.count, revenue: Number(d.revenue) };
        planSet.add(d.plan_name);
      });

      const months = Object.keys(monthlyMap).sort();
      const plans = Array.from(planSet);
      const uniqueMonths = months.length;
      const avgRevenue = uniqueMonths > 0 ? totalRevenue / uniqueMonths : 0;

      // Monthly totals
      const monthlyTotals = months.map(m => {
        const total = Object.values(monthlyMap[m]).reduce((s, v) => s + v.revenue, 0);
        return { month: m, revenue: total };
      });

      content.innerHTML = `
        <div class="page-header">
          <h1>💰 收入分析</h1>
          <div class="filters-bar" style="margin-top:8px">
            <select id="months-filter">
              <option value="6" ${state.months === 6 ? 'selected' : ''}>最近6个月</option>
              <option value="12" ${state.months === 12 ? 'selected' : ''}>最近12个月</option>
              <option value="24" ${state.months === 24 ? 'selected' : ''}>最近24个月</option>
            </select>
          </div>
        </div>

        <div class="stats-grid compact">
          ${kpiCard('总收入', '$' + totalRevenue.toLocaleString(), 'gold')}
          ${kpiCard('订阅总数', totalCount, 'primary')}
          ${kpiCard('月均收入', '$' + Math.round(avgRevenue).toLocaleString(), 'success')}
          ${kpiCard('活跃月份', uniqueMonths, '')}
        </div>

        <div class="analytics-section">
          <div class="section-title">📊 月度收入趋势</div>
          <div class="chart-container large">
            <canvas id="revenue-chart"></canvas>
          </div>
        </div>

        <div class="analytics-section">
          <div class="section-title">📋 月度收入明细</div>
          <div id="revenue-table"></div>
        </div>
      `;

      renderChart(months, plans, monthlyMap, monthlyTotals);
      renderTable(months, plans, monthlyMap, monthlyTotals);

      document.getElementById('months-filter').addEventListener('change', function() {
        state.months = parseInt(this.value);
        render();
      });
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  }

  function renderChart(months, plans, monthlyMap, monthlyTotals) {
    if (typeof Chart === 'undefined') return;
    if (chart) { chart.destroy(); chart = null; }
    const ctx = document.getElementById('revenue-chart');
    if (!ctx || !months.length) return;

    const colors = ['#8B5CF6', '#4ADE80', '#D4AF37', '#F87171', '#60A5FA', '#34D399', '#FBBF24'];
    const datasets = plans.map((plan, i) => ({
      label: plan,
      data: months.map(m => (monthlyMap[m][plan]?.revenue || 0)),
      backgroundColor: colors[i % colors.length],
      borderRadius: 2,
    }));

    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months.map(m => m.slice(2)),
        datasets: datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#999', font: { size: 12 }, usePointStyle: true },
          },
          tooltip: {
            backgroundColor: '#1A1A1A',
            titleColor: '#fff',
            bodyColor: '#ccc',
            callbacks: {
              label: function(ctx) {
                const v = ctx.raw;
                return `${ctx.dataset.label}: $${v.toLocaleString()}`;
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            ticks: { color: '#999', font: { size: 10 } },
            grid: { color: '#2A2A2A' },
          },
          y: {
            stacked: true,
            ticks: { color: '#999', font: { size: 10 }, callback: v => '$' + v },
            grid: { color: '#2A2A2A' },
            beginAtZero: true,
          },
        },
      },
    });
  }

  function renderTable(months, plans, monthlyMap, monthlyTotals) {
    const container = document.getElementById('revenue-table');
    if (!container) return;
    if (!months.length) {
      container.innerHTML = '<div class="empty-state">暂无数据</div>';
      return;
    }

    let html = `<table class="data-table"><thead><tr><th>月份</th>`;
    plans.forEach(p => { html += `<th>${esc(p)}</th>`; });
    html += `<th>合计</th></tr></thead><tbody>`;

    // Show in reverse chronological order
    const reversed = [...months].reverse();
    html += reversed.map(m => {
      let row = `<tr><td><strong>${m}</strong></td>`;
      let monthTotal = 0;
      plans.forEach(p => {
        const val = monthlyMap[m][p]?.revenue || 0;
        monthTotal += val;
        row += `<td>${val > 0 ? '$' + val.toLocaleString() : '-'}</td>`;
      });
      row += `<td><strong>$${monthTotal.toLocaleString()}</strong></td></tr>`;
      return row;
    }).join('');

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  function kpiCard(label, value, colorClass) {
    return `<div class="stats-card">
      <div class="label">${label}</div>
      <div class="value ${colorClass}">${typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>`;
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { render };
})();
