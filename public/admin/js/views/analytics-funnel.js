/**
 * 转化漏斗页面 — 注册→首次AI→Pro支付 转化分析
 */
const AnalyticsFunnelView = (() => {
  let funnelChart = null;
  let trendChart = null;
  let state = { days: 30 };

  async function render() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading">加载中...</div>';

    try {
      const [statsRes, trendsRes, distRes] = await Promise.all([
        AdminAPI.getStats(),
        AdminAPI.getDailyTrends(state.days),
        AdminAPI.getTaskDistribution(state.days),
      ]);

      const stats = statsRes.data;
      const trends = trendsRes.data || [];
      const dist = distRes.data || [];

      // Calculate funnel steps from existing data
      const totalUsers = stats.total_users || 0;
      const totalTasks = stats.total_tasks || 0;
      const totalPro = stats.total_pro_users || 0;
      const totalCompleted = (stats.completed_tasks || 0);
      const totalSubs = dist.reduce((s, d) => s + d.count, 0);

      // Funnel: Registered -> Used AI -> First Task Completed -> Pro -> Active Pro
      // For now, derive from aggregate stats
      const registered = totalUsers;
      const usedAI = totalTasks > 0 ? Math.round(totalUsers * 0.65) : 0; // Derive from task presence
      const completedTask = totalCompleted;
      const proUsers = totalPro;
      const activePro = stats.active_users_today || 0;

      // Better calculation: from trends data
      const totalNewUsersPeriod = trends.reduce((s, t) => s + t.new_users, 0);
      const totalTasksPeriod = trends.reduce((s, t) => s + t.tasks, 0);
      const totalRevenuePeriod = trends.reduce((s, t) => s + Number(t.revenue), 0);

      content.innerHTML = `
        <div class="page-header">
          <h1>🔽 转化漏斗</h1>
          <div class="filters-bar" style="margin-top:8px">
            <select id="days-filter">
              <option value="7" ${state.days === 7 ? 'selected' : ''}>最近7天</option>
              <option value="30" ${state.days === 30 ? 'selected' : ''}>最近30天</option>
              <option value="90" ${state.days === 90 ? 'selected' : ''}>最近90天</option>
            </select>
          </div>
        </div>

        <div class="analytics-section">
          <div class="section-title">📊 ${state.days}天转化漏斗</div>
          <div class="funnel-container" id="funnel-viz"></div>
        </div>

        <div class="stats-grid compact" style="margin-bottom:24px">
          ${kpiCard('总转化率', (totalNewUsersPeriod > 0 ? (totalRevenuePeriod > 0 ? ((registered > 0 && proUsers > 0) ? ((proUsers / Math.max(registered, 1)) * 100).toFixed(2) : '0') + '%' : '0%') : '0%'), 'primary')}
          ${kpiCard('注册用户', totalNewUsersPeriod, '')}
          ${kpiCard('AI使用', totalTasksPeriod, 'success')}
          ${kpiCard('付费用户', proUsers, 'gold')}
        </div>

        <div class="analytics-section">
          <div class="section-title">📈 每日转化趋势</div>
          <div class="chart-container medium">
            <canvas id="funnel-trend-chart"></canvas>
          </div>
        </div>

        <div class="analytics-section">
          <div class="section-title">📋 工具转化详情</div>
          <div id="tool-funnel-table"></div>
        </div>
      `;

      renderFunnelViz(totalNewUsersPeriod, totalTasksPeriod, proUsers, totalRevenuePeriod);
      renderTrendChart(trends);
      renderToolFunnelTable(dist);

      document.getElementById('days-filter').addEventListener('change', function() {
        state.days = parseInt(this.value);
        render();
      });
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  }

  function renderFunnelViz(registered, usedAI, proUsers, revenue) {
    const container = document.getElementById('funnel-viz');
    if (!container) return;

    const steps = [
      { label: '注册用户', count: registered, color: '#8B5CF6', width: 100 },
      { label: '使用 AI 工具', count: usedAI, color: '#60A5FA', width: 0 },
      { label: 'Pro 付费', count: proUsers, color: '#4ADE80', width: 0 },
      { label: '产生收入', count: revenue > 0 ? 1 : 0, color: '#D4AF37', width: 0, unit: '$' + revenue.toLocaleString() },
    ];

    // Calculate relative widths
    const maxCount = Math.max(registered, 1);
    steps.forEach(s => {
      if (s.unit) {
        s.width = Math.max(20, (revenue > 0 ? 100 : 20));
      } else {
        s.width = Math.max(20, Math.round(s.count / maxCount * 100));
      }
    });

    let html = '<div class="funnel-stages">';
    steps.forEach((step, i) => {
      const isLast = i === steps.length - 1;
      html += `
        <div class="funnel-step">
          <div class="funnel-bar-wrap">
            <div class="funnel-bar" style="width:${step.width}%;background:${step.color}">
              ${step.unit || step.count.toLocaleString()}
            </div>
            <div class="funnel-label">${step.label}</div>
          </div>
        </div>`;

      if (!isLast) {
        const nextCount = steps[i + 1].count;
        const rate = step.count > 0 ? ((nextCount / step.count) * 100).toFixed(1) : '0';
        const drop = step.count > 0 ? (((step.count - nextCount) / step.count) * 100).toFixed(1) : '0';
        html += `
        <div class="funnel-arrow">
          <span>⬇</span>
          <span class="conv-rate">${rate}% 转化</span>
          <span class="drop-rate">流失 ${drop}%</span>
        </div>`;
      }
    });
    html += '</div>';
    container.innerHTML = html;
  }

  function renderTrendChart(trends) {
    if (typeof Chart === 'undefined') return;
    if (trendChart) { trendChart.destroy(); trendChart = null; }
    const ctx = document.getElementById('funnel-trend-chart');
    if (!ctx || !trends || !trends.length) return;

    // Calculate conversion rates per day
    const regToTask = trends.map(t => t.new_users > 0 ? (t.tasks / t.new_users * 100) : 0);
    const taskToRev = trends.map(t => t.tasks > 0 ? (Number(t.revenue) > 0 ? 100 : 0) : 0);

    trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: trends.map(t => t.date.slice(5)),
        datasets: [
          {
            label: '注册→使用AI (%)',
            data: regToTask,
            borderColor: '#8B5CF6',
            backgroundColor: 'rgba(139,92,246,0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 1,
          },
          {
            label: '新增用户',
            data: trends.map(t => t.new_users),
            borderColor: '#60A5FA',
            borderDash: [4, 2],
            fill: false,
            tension: 0.3,
            pointRadius: 1,
            yAxisID: 'y1',
          },
          {
            label: '任务数',
            data: trends.map(t => t.tasks),
            borderColor: '#4ADE80',
            borderDash: [4, 2],
            fill: false,
            tension: 0.3,
            pointRadius: 1,
            yAxisID: 'y1',
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
            type: 'linear',
            position: 'left',
            ticks: { color: '#8B5CF6', font: { size: 10 }, callback: v => v.toFixed(0) + '%' },
            grid: { color: '#2A2A2A' },
            beginAtZero: true,
          },
          y1: {
            type: 'linear',
            position: 'right',
            ticks: { color: '#999', font: { size: 10 } },
            grid: { drawOnChartArea: false },
            beginAtZero: true,
          },
        },
      },
    });
  }

  function renderToolFunnelTable(distribution) {
    const container = document.getElementById('tool-funnel-table');
    if (!container) return;
    if (!distribution || !distribution.length) {
      container.innerHTML = '<div class="empty-state">暂无数据</div>';
      return;
    }

    const topTools = distribution.slice(0, 10);
    let html = `<table class="data-table"><thead><tr>
      <th>#</th><th>工具</th><th>总任务</th><th>成功</th><th>失败</th><th>成功率</th><th>积分消耗</th>
    </tr></thead><tbody>`;

    html += topTools.map((t, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${esc(t.tool_type)}</strong></td>
        <td>${t.count.toLocaleString()}</td>
        <td><span style="color:var(--success)">${t.success_count.toLocaleString()}</span></td>
        <td><span style="color:var(--error)">${t.failed_count.toLocaleString()}</span></td>
        <td>
          <span class="badge ${t.success_count / Math.max(t.count, 1) * 100 >= 90 ? 'badge-active' : t.success_count / Math.max(t.count, 1) * 100 >= 70 ? 'badge-processing' : 'badge-failed'}">
            ${t.count > 0 ? (t.success_count / t.count * 100).toFixed(1) + '%' : '-'}
          </span>
        </td>
        <td>${t.total_credits.toLocaleString()}</td>
      </tr>
    `).join('');

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
