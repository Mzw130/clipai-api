/**
 * 任务分析页面 — 工具使用分布图 + 排名表
 */
const TaskAnalyticsView = (() => {
  let chart = null;
  let state = { days: 30 };

  async function render() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading">加载中...</div>';

    try {
      const [distRes, rankRes, statsRes] = await Promise.all([
        AdminAPI.getTaskDistribution(state.days),
        AdminAPI.getToolUsageRanking(state.days),
        AdminAPI.getDailyTrends(Math.min(state.days, 30)),
      ]);

      const dist = distRes.data || [];
      const rank = rankRes.data || [];

      // Calculate KPIs
      const totalTasks = dist.reduce((s, d) => s + d.count, 0);
      const totalSuccess = dist.reduce((s, d) => s + d.success_count, 0);
      const totalCredits = dist.reduce((s, d) => s + d.total_credits, 0);
      const successRate = totalTasks > 0 ? (totalSuccess / totalTasks * 100).toFixed(1) : '0';
      const avgMs = dist.reduce((s, d) => s + d.avg_processing_ms * d.count, 0) / (totalTasks || 1);

      content.innerHTML = `
        <div class="page-header">
          <h1>📊 任务分析</h1>
          <div class="filters-bar" style="margin-top:8px">
            <select id="days-filter">
              <option value="7" ${state.days === 7 ? 'selected' : ''}>最近7天</option>
              <option value="30" ${state.days === 30 ? 'selected' : ''}>最近30天</option>
              <option value="90" ${state.days === 90 ? 'selected' : ''}>最近90天</option>
            </select>
          </div>
        </div>

        <div class="stats-grid compact">
          ${kpiCard('总任务数', totalTasks, 'primary')}
          ${kpiCard('成功率', successRate + '%', successRate >= 90 ? 'success' : '')}
          ${kpiCard('平均耗时', (avgMs / 1000).toFixed(1) + 's', '')}
          ${kpiCard('总消耗积分', totalCredits, 'gold')}
        </div>

        <div class="analytics-section">
          <div class="section-title">📊 工具使用分布</div>
          <div class="chart-container medium">
            <canvas id="task-dist-chart"></canvas>
          </div>
        </div>

        <div class="analytics-section">
          <div class="section-title">📋 工具排名详情</div>
          <div id="task-table"></div>
        </div>
      `;

      renderChart(dist);
      renderTable(rank);

      document.getElementById('days-filter').addEventListener('change', function() {
        state.days = parseInt(this.value);
        render();
      });
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  }

  function renderChart(distribution) {
    if (typeof Chart === 'undefined') return;
    if (chart) { chart.destroy(); chart = null; }
    const ctx = document.getElementById('task-dist-chart');
    if (!ctx || !distribution || !distribution.length) return;

    const colors = [
      '#8B5CF6', '#4ADE80', '#D4AF37', '#F87171', '#60A5FA',
      '#A78BFA', '#FBBF24', '#34D399', '#FB7185', '#38BDF8',
      '#C084FC', '#22C55E', '#EAB308', '#EF4444', '#0EA5E9',
      '#9333EA', '#16A34A', '#CA8A04', '#DC2626', '#0284C7',
    ];

    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: distribution.map(d => d.tool_type),
        datasets: [{
          label: '任务数',
          data: distribution.map(d => d.count),
          backgroundColor: distribution.map((_, i) => colors[i % colors.length]),
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1A1A1A',
            titleColor: '#fff',
            bodyColor: '#ccc',
            callbacks: {
              label: function(ctx) {
                const d = distribution[ctx.dataIndex];
                return [`任务数: ${d.count}`, `成功: ${d.success_count}`, `失败: ${d.failed_count}`, `平均耗时: ${(d.avg_processing_ms/1000).toFixed(1)}s`];
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#999', font: { size: 10 }, maxRotation: 90, minRotation: 45 },
            grid: { color: '#2A2A2A' },
          },
          y: {
            ticks: { color: '#999', font: { size: 11 } },
            grid: { color: '#2A2A2A' },
            beginAtZero: true,
          },
        },
      },
    });
  }

  function renderTable(ranking) {
    const container = document.getElementById('task-table');
    if (!container) return;
    if (!ranking || !ranking.length) {
      container.innerHTML = '<div class="empty-state">暂无数据</div>';
      return;
    }
    let html = `<table class="data-table"><thead><tr>
      <th>#</th><th>工具</th><th>任务数</th><th>成功率</th><th>消耗积分</th>
    </tr></thead><tbody>`;
    html += ranking.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(r.tool_type)}</td>
        <td>${r.count.toLocaleString()}</td>
        <td><span class="badge ${r.success_rate >= 90 ? 'badge-active' : r.success_rate >= 70 ? 'badge-processing' : 'badge-failed'}">${r.success_rate}%</span></td>
        <td>${r.credits.toLocaleString()}</td>
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
