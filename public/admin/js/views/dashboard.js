/**
 * 仪表盘页面 — 含迷你趋势图与工具分布图
 */
const DashboardView = (() => {
  let refreshTimer = null;
  let trendChart = null;
  let toolChart = null;

  async function render() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading">加载中...</div>';

    try {
      const [statsRes, trendsRes, distRes] = await Promise.all([
        AdminAPI.getStats(),
        AdminAPI.getDailyTrends(7),
        AdminAPI.getTaskDistribution(7),
      ]);
      const stats = statsRes.data;

      content.innerHTML = `
        <div class="page-header"><h1>📊 仪表盘</h1></div>
        <div class="stats-grid">
          ${card('总用户数', stats.total_users, 'primary')}
          ${card('今日活跃', stats.active_users_today, '')}
          ${card('今日新增', stats.today_new_users, 'success')}
          ${card('Pro 会员', stats.total_pro_users, 'gold')}
          ${card('总任务数', stats.total_tasks, '')}
          ${card('今日任务', stats.tasks_today, 'success')}
          ${card('月收入', '$' + Number(stats.revenue_this_month).toLocaleString(), 'gold')}
          ${card('总素材', stats.total_materials, '')}
        </div>
        <div class="chart-row">
          <div class="chart-container small">
            <div class="chart-title">📈 最近7天趋势</div>
            <canvas id="dashboard-trend-chart"></canvas>
          </div>
          <div class="chart-container small">
            <div class="chart-title">🔧 7天工具分布</div>
            <canvas id="dashboard-tool-chart"></canvas>
          </div>
        </div>
        <div style="color:var(--text-muted);font-size:12px;text-align:right;">
          总收入: $${Number(stats.total_revenue).toLocaleString()} &nbsp;|&nbsp; 自动刷新(60s)
        </div>
      `;

      renderTrendChart(trendsRes.data);
      renderToolChart(distRes.data);
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  }

  function renderTrendChart(trends) {
    if (typeof Chart === 'undefined') return;
    if (trendChart) { trendChart.destroy(); trendChart = null; }
    const ctx = document.getElementById('dashboard-trend-chart');
    if (!ctx || !trends || !trends.length) return;

    trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: trends.map(t => t.date.slice(5)),
        datasets: [
          {
            label: '新增用户',
            data: trends.map(t => t.new_users),
            borderColor: '#8B5CF6',
            backgroundColor: 'rgba(139,92,246,0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 2,
          },
          {
            label: '任务数',
            data: trends.map(t => t.tasks),
            borderColor: '#4ADE80',
            backgroundColor: 'rgba(74,222,128,0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#999', font: { size: 11 }, boxWidth: 12 } },
          tooltip: { backgroundColor: '#1A1A1A', titleColor: '#fff', bodyColor: '#ccc' },
        },
        scales: {
          x: { ticks: { color: '#999', font: { size: 10 } }, grid: { color: '#2A2A2A' } },
          y: { ticks: { color: '#999', font: { size: 10 } }, grid: { color: '#2A2A2A' }, beginAtZero: true },
        },
      },
    });
  }

  function renderToolChart(distribution) {
    if (typeof Chart === 'undefined') return;
    if (toolChart) { toolChart.destroy(); toolChart = null; }
    const ctx = document.getElementById('dashboard-tool-chart');
    if (!ctx || !distribution || !distribution.length) return;

    const top5 = distribution.slice(0, 5);
    const others = distribution.slice(5).reduce((sum, d) => sum + d.count, 0);
    const labels = top5.map(d => d.tool_type);
    const data = top5.map(d => d.count);
    if (others > 0) { labels.push('其他'); data.push(others); }

    const colors = ['#8B5CF6', '#4ADE80', '#D4AF37', '#F87171', '#60A5FA', '#666'];
    toolChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors.slice(0, labels.length),
          borderWidth: 2,
          borderColor: '#0D0D0D',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#999', font: { size: 10 }, boxWidth: 10, padding: 8 } },
        },
      },
    });
  }

  function card(label, value, colorClass) {
    return `
      <div class="stats-card">
        <div class="label">${label}</div>
        <div class="value ${colorClass}">${typeof value === 'number' ? value.toLocaleString() : value}</div>
      </div>`;
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    refreshTimer = setInterval(render, 60000);
  }

  function stopAutoRefresh() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  return { render, startAutoRefresh, stopAutoRefresh };
})();
