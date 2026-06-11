/**
 * 订阅管理页面
 */
const SubscriptionsView = (() => {
  let state = {
    page: 1,
    page_size: 20,
    status: '',
    user_id: '',
  };

  async function render() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading">加载中...</div>';

    try {
      const res = await AdminAPI.listSubscriptions(state);
      const { items, pagination } = res.data;

      content.innerHTML = `
        <div class="page-header"><h1>💳 订阅管理</h1></div>
        <div class="filters-bar">
          <select id="filter-status">
            <option value="">全部状态</option>
            <option value="active" ${state.status === 'active' ? 'selected' : ''}>活跃</option>
            <option value="expired" ${state.status === 'expired' ? 'selected' : ''}>已过期</option>
            <option value="cancelled" ${state.status === 'cancelled' ? 'selected' : ''}>已取消</option>
            <option value="grace_period" ${state.status === 'grace_period' ? 'selected' : ''}>宽限期</option>
          </select>
          <button class="btn btn-outline btn-sm" id="filter-reset">重置</button>
        </div>
        <div id="subs-table"></div>
      `;

      const columns = [
        { key: 'user', label: '用户', sortable: false, render: (r) => r.user?.phone || '-' },
        { key: 'user', label: '昵称', sortable: false, render: (r) => r.user?.nickname || '-' },
        { key: 'plan', label: '方案', sortable: false, render: (r) => `${r.plan?.name || r.planId} ($${r.plan?.price || '-'})` },
        { key: 'status', label: '状态', sortable: false, render: (r) => `<span class="badge badge-${statusBadge(r.status)}">${statusLabel(r.status)}</span>` },
        { key: 'autoRenew', label: '自动续费', sortable: false, render: (r) => r.autoRenew ? '✅ 是' : '❌ 否' },
        { key: 'expiresAt', label: '到期时间', sortable: false, render: (r) => r.expiresAt ? new Date(r.expiresAt).toLocaleString('zh-CN') : '-' },
        { key: 'createdAt', label: '创建时间', sortable: false, render: (r) => new Date(r.createdAt).toLocaleString('zh-CN') },
      ];

      DataTable.render(document.getElementById('subs-table'), {
        columns,
        data: items,
        pagination,
        onPageChange: (p) => { state.page = p; render(); },
      });

      bindEvents();
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  }

  function bindEvents() {
    document.getElementById('filter-status')?.addEventListener('change', function () { state.status = this.value; state.page = 1; render(); });
    document.getElementById('filter-reset')?.addEventListener('click', () => {
      state = { page: 1, page_size: 20, status: '', user_id: '' };
      render();
    });
  }

  function statusLabel(s) {
    const map = { active: '活跃', expired: '已过期', cancelled: '已取消', grace_period: '宽限期' };
    return map[s] || s;
  }

  function statusBadge(s) {
    const map = { active: 'active', expired: 'failed', cancelled: 'pending', grace_period: 'processing' };
    return map[s] || 'pending';
  }

  return { render };
})();
