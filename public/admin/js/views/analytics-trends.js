/**
 * 趋势图表页面 — 30天用户/任务/收入趋势
 */
const TrendAnalyticsView = (() => {
  let chart = null;
  let userChart = null;
  let state = { days: 30, tab: 'overview' };

  async function render() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading">加载中...</div>';

    try {
      const [trendsRes, growthRes] = await Promise.all([
        AdminAPI.getDailyTrends(state.days),
        AdminAPI.getUserGrowth(state.days),
      ]);

      const trends = trendsRes.data || [];
      const growth = growthRes.data || [];

      const totalNewUsers = trends.reduce((s, t) => s + t.new_users, 0);
      const totalTasks = trends.reduce((s, t) => s + t.tasks, 0);
      const totalRevenue = trends.reduce((s, t) => s + Number(t.revenue), 0);
      const currentUsers = growth.length > 0 ? growth[growth.length - 1].cumulative : 0;

      content.innerHTML = `
        <div class="page-header">
          <h1>📈 趋势图表</h1>
          <div class="filters-bar" style="margin-top:8px">
            <select id="days-filter">
              <option value="7" ${state.days === 7 ? 'selected' : ''}>最近7天</option>
              <option value="30" ${state.days === 30 ? 'selected' : ''}>最近30天</option>
              <option value="90" ${state.days === 90 ? 'selected' : ''}>最近90天</option>
            </select>
          </div>
        </div>

        <div class="stats-grid compact">
          ${kpiCard('新增用户', totalNewUsers, 'primary')}
          ${kpiCard('总用户数', currentUsers, '')}
          ${kpiCard('任务数', totalTasks, 'success')}
          ${kpiCard('收入', '$' + totalRevenue.toLocaleString(), 'gold')}
        </div>

        <div class="analytics-section">
          <div class="section-title">📈 每日趋势总览</div>
          <div class="chart-container large">
            <canvas id="trend-chart"></canvas>
          </div>
        </div>

        <div class="analytics-section">
          <div class="section-title">👤 用户增长曲线</div>
          <div class="chart-container medium">
            <canvas id="user-growth-chart"></canvas>
          </div>
        </div>

        <div class="analytics-section">
          <div class="section-title">
            <span style="cursor:pointer;margin-right:16px;${state.tab==='users'?'color:var(--primary);font-weight:600':''}" data-tab="users" class="tab-link">新增用户</span>
            <span style="cursor:pointer;margin-right:16px;${state.tab==='tasks'?'color:var(--primary);font-weight:600':''}" data-tab="tasks" class="tab-link">任务</span>
            <span style="cursor:pointer;${state.tab==='revenue'?'color:var(--primary);font-weight:600':''}" data-tab="revenue" class="tab-link">收入</span>
          </div>
          <div id="detail-table"></div>
        </div>
      `;

      renderMainChart(trends);
      renderUserGrowthChart(growth);
      renderDetailTable(trends);

      document.getElementById('days-filter').addEventListener('change', function() {
        state.days = parseInt(this.value);
        render();
      });

      document.querySelectorAll('.tab-link').forEach(el => {
        el.addEventListener('click', function() {
          state.tab = this.dataset.tab;
          renderDetailTable(trends);
          // re-highlight
          document.querySelectorAll('.tab-link').forEach(t => {
            t.style.color = t.dataset.tab === state.tab ? 'var(--primary)' : '';
            t.style.fontWeight = t.dataset.tab === state.tab ? '600' : '';
          });
        });
      });
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  }

  function renderMainChart(trends) {
    if (typeof Chart === 'undefined') return;
    if (chart) { chart.destroy(); chart = null; }
    const ctx = document.getElementById('trend-chart');
    if (!ctx || !trends || !trends.length) return;

    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: trends.map(t => t.date.slice(5)),
        datasets: [
          {
            label: '新增用户',
            data: trends.map(t => t.new_users),
            borderColor: '#8B5CF6',
            backgroundColor: 'rgba(139,92,246,0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 1,
            yAxisID: 'y',
          },
          {
            label: '任务数',
            data: trends.map(t => t.tasks),
            borderColor: '#4ADE80',
            backgroundColor: 'rgba(74,222,128,0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 1,
            yAxisID: 'y',
          },
          {
            label: '收入 ($)',
            data: trends.map(t => Number(t.revenue)),
            borderColor: '#D4AF37',
            backgroundColor: 'rgba(212,175,55,0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 1,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#999', font: { size: 12 }, usePointStyle: true } },
          tooltip: { backgroundColor: '#1A1A1A', titleColor: '#fff', bodyColor: '#ccc' },
        },
        scales: {
          x: {
            ticks: { color: '#999', font: { size: 10 }, maxTicksLimit: 15 },
            grid: { color: '#2A2A2A' },
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            ticks: { color: '#999', font: { size: 10 } },
            grid: { color: '#2A2A2A' },
            beginAtZero: true,
            title: { display: true, text: '数量', color: '#999' },
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            ticks: { color: '#D4AF37', font: { size: 10 } },
            grid: { drawOnChartArea: false },
            beginAtZero: true,
            title: { display: true, text: '收入 ($)', color: '#D4AF37' },
          },
        },
      },
    });
  }

  function renderUserGrowthChart(growth) {
    if (typeof Chart === 'undefined') return;
    if (userChart) { userChart.destroy(); userChart = null; }
    const ctx = document.getElementById('user-growth-chart');
    if (!ctx || !growth || !growth.length) return;

    userChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: growth.map(g => g.date.slice(5)),
        datasets: [
          {
            label: '累计用户',
            data: growth.map(g => g.cumulative),
            borderColor: '#8B5CF6',
            backgroundColor: 'rgba(139,92,246,0.15)',
            fill: true,
            tension: 0.3,
            pointRadius: 2,
          },
          {
            label: '日新增',
            data: growth.map(g => g.daily_new),
            borderColor: '#4ADE80',
            borderDash: [4, 2],
            fill: false,
            tension: 0.3,
            pointRadius: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#999', font: { size: 12 }, usePointStyle: true } },
          tooltip: { backgroundColor: '#1A1A1A', titleColor: '#fff', bodyColor: '#ccc' },
        },
        scales: {
          x: {
            ticks: { color: '#999', font: { size: 10 }, maxTicksLimit: 15 },
            grid: { color: '#2A2A2A' },
          },
          y: {
            ticks: { color: '#999', font: { size: 10 } },
            grid: { color: '#2A2A2A' },
            beginAtZero: true,
          },
        },
      },
    });
  }

  function renderDetailTable(trends) {
    const container = document.getElementById('detail-table');
    if (!container || !trends || !trends.length) return;

    const reversed = [...trends].reverse();
    let html = `<table class="data-table"><thead><tr><th>日期</th>`;

    if (state.tab === 'users' || state.tab === 'overview') {
      html += `<th>新增用户</th>`;
    }
    if (state.tab === 'tasks' || state.tab === 'overview') {
      html += `<th>任务数</th>`;
    }
    if (state.tab === 'revenue' || state.tab === 'overview') {
      html += `<th>收入</th>`;
    }
    html += `</tr></thead><tbody>`;

    html += reversed.map(t => {
      let row = `<tr><td>${t.date}</td>`;
      if (state.tab === 'users' || state.tab === 'overview') {
        row += `<td>${t.new_users.toLocaleString()}</td>`;
      }
      if (state.tab === 'tasks' || state.tab === 'overview') {
        row += `<td>${t.tasks.toLocaleString()}</td>`;
      }
      if (state.tab === 'revenue' || state.tab === 'overview') {
        row += `<td>$${Number(t.revenue).toLocaleString()}</td>`;
      }
      row += `</tr>`;
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

  return { render };
})();
