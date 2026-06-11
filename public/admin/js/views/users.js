/**
 * 用户管理页面
 */
const UsersView = (() => {
  let state = {
    page: 1,
    page_size: 20,
    search: '',
    role: '',
    status: '',
    sort_by: 'created_at',
    sort_order: 'desc',
  };

  async function render() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading">加载中...</div>';

    try {
      const res = await AdminAPI.listUsers(state);
      const { items, pagination } = res.data;

      content.innerHTML = `
        <div class="page-header">
          <h1>👥 用户管理</h1>
          <span style="color:var(--text-muted);font-size:13px;">共 ${pagination.total} 个用户</span>
        </div>
        <div class="filters-bar">
          <input type="text" id="filter-search" placeholder="搜索手机号/昵称..." value="${state.search}">
          <select id="filter-role">
            <option value="">全部角色</option>
            <option value="free" ${state.role === 'free' ? 'selected' : ''}>免费</option>
            <option value="pro" ${state.role === 'pro' ? 'selected' : ''}>Pro</option>
            <option value="admin" ${state.role === 'admin' ? 'selected' : ''}>管理员</option>
          </select>
          <select id="filter-status">
            <option value="">全部状态</option>
            <option value="active" ${state.status === 'active' ? 'selected' : ''}>正常</option>
            <option value="banned" ${state.status === 'banned' ? 'selected' : ''}>已封禁</option>
          </select>
          <button class="btn btn-outline btn-sm" id="filter-reset">重置</button>
        </div>
        <div id="users-table"></div>
      `;

      const columns = [
        { key: 'phone', label: '手机号', sortable: false },
        { key: 'nickname', label: '昵称', sortable: false },
        {
          key: 'role', label: '角色', sortable: false,
          render: (r) => `<span class="badge badge-${r.role}">${roleLabel(r.role)}</span>`,
        },
        { key: 'credits', label: '积分', sortable: true },
        {
          key: 'status', label: '状态', sortable: false,
          render: (r) => `<span class="badge badge-${r.status}">${r.status === 'active' ? '正常' : '已封禁'}</span>`,
        },
        {
          key: 'proExpiresAt', label: 'Pro 到期', sortable: false,
          render: (r) => r.proExpiresAt ? new Date(r.proExpiresAt).toLocaleDateString('zh-CN') : '-',
        },
        {
          key: 'createdAt', label: '注册时间', sortable: true,
          render: (r) => new Date(r.createdAt).toLocaleDateString('zh-CN'),
        },
        {
          key: 'actions', label: '操作', sortable: false,
          render: (r) => `
            <div class="actions-cell">
              <button class="btn btn-outline btn-sm view-user" data-id="${r.id}">详情</button>
              <button class="btn btn-outline btn-sm edit-role" data-id="${r.id}" data-role="${r.role}">角色</button>
              <button class="btn btn-outline btn-sm edit-credits" data-id="${r.id}" data-credits="${r.credits}">积分</button>
              <button class="btn btn-sm ${r.status === 'banned' ? 'btn-primary' : 'btn-danger'} toggle-status" data-id="${r.id}" data-status="${r.status}">
                ${r.status === 'banned' ? '解封' : '封禁'}
              </button>
            </div>`,
        },
      ];

      DataTable.render(document.getElementById('users-table'), {
        columns,
        data: items,
        pagination,
        onPageChange: (p) => { state.page = p; render(); },
        onSort: (key, order) => { state.sort_by = key; state.sort_order = order; state.page = 1; render(); },
        sortBy: state.sort_by,
        sortOrder: state.sort_order,
      });

      bindEvents();
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  }

  function bindEvents() {
    // 搜索
    const searchInput = document.getElementById('filter-search');
    if (searchInput) {
      searchInput.addEventListener('input', debounce(() => {
        state.search = searchInput.value;
        state.page = 1;
        render();
      }, 400));
    }

    // 角色筛选
    const roleSelect = document.getElementById('filter-role');
    if (roleSelect) {
      roleSelect.addEventListener('change', () => {
        state.role = roleSelect.value;
        state.page = 1;
        render();
      });
    }

    // 状态筛选
    const statusSelect = document.getElementById('filter-status');
    if (statusSelect) {
      statusSelect.addEventListener('change', () => {
        state.status = statusSelect.value;
        state.page = 1;
        render();
      });
    }

    // 重置
    const resetBtn = document.getElementById('filter-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        state = { page: 1, page_size: 20, search: '', role: '', status: '', sort_by: 'created_at', sort_order: 'desc' };
        render();
      });
    }

    // 查看详情
    document.querySelectorAll('.view-user').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await AdminAPI.getUserDetail(btn.dataset.id);
          showUserDetail(res.data);
        } catch (e) {
          Toast.error(e.message);
        }
      });
    });

    // 修改角色
    document.querySelectorAll('.edit-role').forEach((btn) => {
      btn.addEventListener('click', () => {
        Modal.form('修改用户角色', [
          { name: 'role', label: '角色', type: 'select', value: btn.dataset.role, options: [
            { value: 'free', label: '免费用户' },
            { value: 'pro', label: 'Pro 会员' },
            { value: 'admin', label: '管理员' },
          ]},
        ], async (values) => {
          try {
            await AdminAPI.updateUserRole(btn.dataset.id, values.role);
            Toast.success('角色已更新');
            render();
          } catch (e) { Toast.error(e.message); }
        });
      });
    });

    // 修改积分
    document.querySelectorAll('.edit-credits').forEach((btn) => {
      btn.addEventListener('click', () => {
        Modal.form('修改用户积分', [
          { name: 'credits', label: '积分数量', type: 'number', value: btn.dataset.credits, placeholder: '输入积分数' },
        ], async (values) => {
          try {
            await AdminAPI.updateUserCredits(btn.dataset.id, values.credits);
            Toast.success('积分已更新');
            render();
          } catch (e) { Toast.error(e.message); }
        });
      });
    });

    // 封禁/解封
    document.querySelectorAll('.toggle-status').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const newStatus = btn.dataset.status === 'banned' ? 'active' : 'banned';
        const action = newStatus === 'banned' ? '封禁' : '解封';
        const ok = await Modal.confirm(
          `${action}用户`,
          `确定要${action}该用户吗？${newStatus === 'banned' ? '封禁后用户将无法登录使用任何功能。' : ''}`,
        );
        if (ok) {
          try {
            await AdminAPI.updateUserStatus(btn.dataset.id, newStatus);
            Toast.success(`用户已${action}`);
            render();
          } catch (e) { Toast.error(e.message); }
        }
      });
    });
  }

  function showUserDetail(user) {
    const panel = document.createElement('div');
    panel.className = 'detail-panel';
    panel.id = 'user-detail-panel';
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3>用户详情</h3>
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('user-detail-panel').remove()">关闭</button>
      </div>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">ID</div><div class="value" style="font-size:12px;">${user.id}</div></div>
        <div class="detail-item"><div class="label">手机号</div><div class="value">${user.phone || '-'}</div></div>
        <div class="detail-item"><div class="label">昵称</div><div class="value">${user.nickname || '-'}</div></div>
        <div class="detail-item"><div class="label">角色</div><div class="value"><span class="badge badge-${user.role}">${roleLabel(user.role)}</span></div></div>
        <div class="detail-item"><div class="label">积分</div><div class="value">${user.credits}</div></div>
        <div class="detail-item"><div class="label">状态</div><div class="value"><span class="badge badge-${user.status}">${user.status === 'active' ? '正常' : '已封禁'}</span></div></div>
        <div class="detail-item"><div class="label">今日免费用量</div><div class="value">${user.freeDailyUsed || 0}</div></div>
        <div class="detail-item"><div class="label">Pro 到期</div><div class="value">${user.proExpiresAt ? new Date(user.proExpiresAt).toLocaleString('zh-CN') : '未开通'}</div></div>
        <div class="detail-item"><div class="label">注册时间</div><div class="value">${new Date(user.createdAt).toLocaleString('zh-CN')}</div></div>
        <div class="detail-item"><div class="label">最后登录</div><div class="value">${new Date(user.lastLoginAt).toLocaleString('zh-CN')}</div></div>
      </div>
      ${user.subscription ? `
        <h3 style="margin-top:20px;">订阅信息</h3>
        <div class="detail-grid">
          <div class="detail-item"><div class="label">方案</div><div class="value">${user.subscription.planId}</div></div>
          <div class="detail-item"><div class="label">状态</div><div class="value"><span class="badge badge-${user.subscription.status}">${user.subscription.status}</span></div></div>
          <div class="detail-item"><div class="label">到期</div><div class="value">${user.subscription.expiresAt ? new Date(user.subscription.expiresAt).toLocaleString('zh-CN') : '-'}</div></div>
          <div class="detail-item"><div class="label">自动续费</div><div class="value">${user.subscription.autoRenew ? '是' : '否'}</div></div>
        </div>
      ` : '<p style="color:var(--text-muted);margin-top:16px;">暂无订阅记录</p>'}
      <h3 style="margin-top:20px;">最近任务</h3>
      ${user.recent_tasks && user.recent_tasks.length > 0 ? `
        <table class="data-table">
          <thead><tr><th>工具</th><th>状态</th><th>积分</th><th>时间</th></tr></thead>
          <tbody>
            ${user.recent_tasks.map((t) => `
              <tr>
                <td>${t.toolType}</td>
                <td><span class="badge badge-${t.status}">${t.status}</span></td>
                <td>${t.creditsUsed}</td>
                <td>${new Date(t.createdAt).toLocaleString('zh-CN')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p style="color:var(--text-muted);">暂无任务记录</p>'}
    `;

    const content = document.getElementById('content');
    const tableContainer = document.getElementById('users-table');
    if (tableContainer) {
      tableContainer.parentNode.insertBefore(panel, tableContainer);
    }
  }

  function roleLabel(role) {
    const map = { free: '免费', pro: 'Pro', admin: '管理员' };
    return map[role] || role;
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  }

  return { render };
})();
