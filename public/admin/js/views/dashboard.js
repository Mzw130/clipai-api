/**
 * 仪表盘页面
 */
const DashboardView = (() => {
  let refreshTimer = null;

  async function render() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading">加载中...</div>';

    try {
      const res = await AdminAPI.getStats();
      const stats = res.data;

      content.innerHTML = `
        <div class="page-header"><h1>📊 仪表盘</h1></div>
        <div class="stats-grid">
          ${card('总用户数', stats.total_users, 'primary')}
          ${card('今日活跃', stats.active_users_today, '')}
          ${card('Pro 会员', stats.total_pro_users, 'gold')}
          ${card('总任务数', stats.total_tasks, '')}
          ${card('今日任务', stats.tasks_today, 'success')}
          ${card('月收入', '$' + stats.revenue_this_month, 'gold')}
        </div>
        <div style="color:var(--text-muted);font-size:12px;text-align:right;">
          总收入: $${stats.total_revenue} &nbsp;|&nbsp; 自动刷新(60s)
        </div>
      `;
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
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
