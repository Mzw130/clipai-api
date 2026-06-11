/**
 * 模型配置 + 消耗监测页面
 */
const ModelsView = (() => {
  async function render() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="loading">加载中...</div>';

    try {
      const res = await AdminAPI.request('GET', '/admin/models');
      const { configs, usage } = res.data;

      content.innerHTML = `
        <div class="page-header">
          <h1>⚙️ 模型配置</h1>
          <button class="btn btn-primary" id="add-model-btn">+ 添加模型</button>
        </div>

        <!-- 消耗监测 -->
        <div class="stats-grid" style="margin-bottom:24px;">
          <div class="stats-card">
            <div class="label">今日 API 调用</div>
            <div class="value primary">${usage.today_total_calls}</div>
          </div>
          <div class="stats-card">
            <div class="label">今日消耗积分</div>
            <div class="value gold">${usage.today_total_credits}</div>
          </div>
        </div>

        ${usage.by_model && usage.by_model.length > 0 ? renderUsageTable(usage) : ''}

        <h3 style="margin:24px 0 16px;font-size:16px;">已配置模型（修改后实时生效）</h3>
        <div id="models-cards">
          ${configs.length === 0
            ? '<div class="empty-state"><div class="icon">📭</div><p>暂无模型配置，点击"+ 添加模型"开始</p></div>'
            : configs.map((cfg) => renderModelCard(cfg)).join('')}
        </div>
      `;

      bindEvents();
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>${e.message}</div>`;
    }
  }

  function renderUsageTable(usage) {
    return `
      <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;margin-bottom:8px;">
        <h3 style="font-size:14px;margin-bottom:12px;color:var(--text-secondary);">📈 各模型消耗统计</h3>
        <table class="data-table">
          <thead><tr><th>模型</th><th>调用次数</th><th>消耗积分</th></tr></thead>
          <tbody>
            ${usage.by_model.map((m) => `
              <tr>
                <td><span class="badge badge-pro">${esc(m.model)}</span></td>
                <td>${m.calls}</td>
                <td>${m.credits}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderModelCard(cfg) {
    const statusBadge = cfg.isActive
      ? '<span class="badge badge-active">启用</span>'
      : '<span class="badge badge-banned">禁用</span>';
    const maskedKey = cfg.apiKey
      ? cfg.apiKey.slice(0, 8) + '...' + cfg.apiKey.slice(-4)
      : '未设置';

    return `
      <div class="detail-panel" style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <h3 style="margin:0;">${esc(cfg.displayName)}</h3>
            <code style="background:var(--bg-secondary);padding:2px 8px;border-radius:4px;font-size:12px;color:var(--text-muted);">${esc(cfg.name)}</code>
            ${statusBadge}
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-outline btn-sm edit-model" data-name="${esc(cfg.name)}"
              data-display="${esc(cfg.displayName)}" data-endpoint="${esc(cfg.endpoint)}"
              data-apikey="${esc(cfg.apiKey)}" data-model="${esc(cfg.modelName)}"
              data-active="${cfg.isActive}">✏️ 编辑</button>
            <button class="btn btn-danger btn-sm delete-model" data-name="${esc(cfg.name)}">🗑</button>
          </div>
        </div>
        <div class="detail-grid">
          <div class="detail-item">
            <div class="label">API 端点</div>
            <div class="value" style="font-size:12px;word-break:break-all;">${esc(cfg.endpoint) || '未配置'}</div>
          </div>
          <div class="detail-item">
            <div class="label">API Key</div>
            <div class="value" style="font-size:12px;">${maskedKey}</div>
          </div>
          <div class="detail-item">
            <div class="label">模型 ID</div>
            <div class="value" style="font-size:12px;">${esc(cfg.modelName) || '未配置'}</div>
          </div>
        </div>
      </div>`;
  }

  function bindEvents() {
    // 添加模型
    document.getElementById('add-model-btn')?.addEventListener('click', () => {
      Modal.form('添加新模型', [
        { name: 'name', label: '标识（英文）', type: 'text', placeholder: '如: seedance, my_model' },
        { name: 'display_name', label: '显示名称', type: 'text', placeholder: '如: Seedance 图生视频' },
        { name: 'endpoint', label: 'API 端点 URL', type: 'text', placeholder: 'https://ark.cn-beijing.volces.com/api/v3/...' },
        { name: 'api_key', label: 'API Key', type: 'text', placeholder: '输入 API Key' },
        { name: 'model_name', label: '模型 ID', type: 'text', placeholder: '如: doubao-seedance-1-5-pro-251215' },
      ], async (values) => {
        try {
          await AdminAPI.request('POST', '/admin/models', {
            name: values.name,
            display_name: values.display_name,
            endpoint: values.endpoint,
            api_key: values.api_key,
            model_name: values.model_name,
          });
          Toast.success('模型已添加');
          render();
        } catch (e) { Toast.error(e.message); }
      });
    });

    // 编辑模型
    document.querySelectorAll('.edit-model').forEach((btn) => {
      btn.addEventListener('click', () => {
        const { name, display, endpoint, apikey, model, active } = btn.dataset;
        Modal.form(`编辑: ${display}`, [
          { name: 'display_name', label: '显示名称', type: 'text', value: display },
          { name: 'endpoint', label: 'API 端点 URL', type: 'text', value: endpoint },
          { name: 'api_key', label: 'API Key', type: 'text', value: apikey },
          { name: 'model_name', label: '模型 ID', type: 'text', value: model },
          { name: 'is_active', label: '状态', type: 'select', value: active === 'true' ? 'true' : 'false', options: [
            { value: 'true', label: '启用' },
            { value: 'false', label: '禁用' },
          ]},
        ], async (values) => {
          try {
            await AdminAPI.request('PATCH', `/admin/models/${name}`, {
              display_name: values.display_name,
              endpoint: values.endpoint,
              api_key: values.api_key,
              model_name: values.model_name,
              is_active: values.is_active === 'true',
            });
            Toast.success('已更新，实时生效');
            render();
          } catch (e) { Toast.error(e.message); }
        });
      });
    });

    // 删除模型
    document.querySelectorAll('.delete-model').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await Modal.confirm('删除模型', `确定要删除模型 "${btn.dataset.name}" 吗？此操作不可撤销。`);
        if (ok) {
          try {
            await AdminAPI.request('DELETE', `/admin/models/${btn.dataset.name}`);
            Toast.success('模型已删除');
            render();
          } catch (e) { Toast.error(e.message); }
        }
      });
    });
  }

  function esc(s) {
    if (!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { render };
})();
