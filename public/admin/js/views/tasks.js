/**
 * 任务列表页面
 */
const TasksView = (() => {
  let state = {
    page: 1,
    page_size: 20,
    status: '',
    tool_type: '',
    user_id: '',
    date_from: '',
    date_to: '',
  };

  async function render() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading">加载中...</div>';

    try {
      const res = await AdminAPI.listTasks(state);
      const { items, pagination } = res.data;

      content.innerHTML = `
        <div class="page-header"><h1>📋 任务列表</h1></div>
        <div class="filters-bar">
          <select id="filter-status">
            <option value="">全部状态</option>
            <option value="pending" ${state.status === 'pending' ? 'selected' : ''}>等待中</option>
            <option value="processing" ${state.status === 'processing' ? 'selected' : ''}>处理中</option>
            <option value="completed" ${state.status === 'completed' ? 'selected' : ''}>已完成</option>
            <option value="failed" ${state.status === 'failed' ? 'selected' : ''}>失败</option>
          </select>
          <select id="filter-tool">
            <option value="">全部工具</option>
            <option value="reshape" ${state.tool_type === 'reshape' ? 'selected' : ''}>重塑</option>
            <option value="hd_repair" ${state.tool_type === 'hd_repair' ? 'selected' : ''}>高清修复</option>
            <option value="bg_remove" ${state.tool_type === 'bg_remove' ? 'selected' : ''}>背景移除</option>
            <option value="obj_remove" ${state.tool_type === 'obj_remove' ? 'selected' : ''}>物体消除</option>
            <option value="super_realistic" ${state.tool_type === 'super_realistic' ? 'selected' : ''}>超级写实</option>
            <option value="ai_edit" ${state.tool_type === 'ai_edit' ? 'selected' : ''}>AI编辑</option>
            <option value="video_generate" ${state.tool_type === 'video_generate' ? 'selected' : ''}>图生视频</option>
            <option value="beauty" ${state.tool_type === 'beauty' ? 'selected' : ''}>美颜</option>
            <option value="color_grade" ${state.tool_type === 'color_grade' ? 'selected' : ''}>调色</option>
          </select>
          <input type="date" id="filter-date-from" value="${state.date_from}" style="width:140px;">
          <span style="color:var(--text-muted);">至</span>
          <input type="date" id="filter-date-to" value="${state.date_to}" style="width:140px;">
          <button class="btn btn-outline btn-sm" id="filter-reset">重置</button>
        </div>
        <div id="tasks-table"></div>
      `;

      const columns = [
        { key: 'id', label: '任务ID', sortable: false, render: (r) => r.id.slice(0, 8) + '...' },
        { key: 'user', label: '用户', sortable: false, render: (r) => r.user?.phone || '-' },
        { key: 'toolType', label: '工具', sortable: false },
        { key: 'status', label: '状态', sortable: false, render: (r) => `<span class="badge badge-${r.status}">${statusLabel(r.status)}</span>` },
        { key: 'creditsUsed', label: '消耗积分', sortable: false },
        { key: 'createdAt', label: '创建时间', sortable: false, render: (r) => new Date(r.createdAt).toLocaleString('zh-CN') },
      ];

      DataTable.render(document.getElementById('tasks-table'), {
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
    document.getElementById('filter-tool')?.addEventListener('change', function () { state.tool_type = this.value; state.page = 1; render(); });
    document.getElementById('filter-date-from')?.addEventListener('change', function () { state.date_from = this.value; state.page = 1; render(); });
    document.getElementById('filter-date-to')?.addEventListener('change', function () { state.date_to = this.value; state.page = 1; render(); });
    document.getElementById('filter-reset')?.addEventListener('click', () => {
      state = { page: 1, page_size: 20, status: '', tool_type: '', user_id: '', date_from: '', date_to: '' };
      render();
    });
  }

  function statusLabel(s) {
    const map = { pending: '等待中', processing: '处理中', completed: '已完成', failed: '失败' };
    return map[s] || s;
  }

  return { render };
})();
