/**
 * 侧边导航栏 — 从 API 获取管理员实时信息
 */
const Sidebar = (() => {
  async function render() {
    const el = document.getElementById('sidebar');
    if (!el) return;

    const current = window.location.hash.replace('#', '') || '/dashboard';

    const navItems = [
      { href: '#/dashboard', icon: '📊', label: '仪表盘' },
      { href: '#/users', icon: '👥', label: '用户管理' },
      { href: '#/tasks', icon: '📋', label: '任务列表' },
      { href: '#/subscriptions', icon: '💳', label: '订阅管理' },
      { href: '#/models', icon: '⚙️', label: '模型配置' },
      { href: '#/analytics/tasks', icon: '📊', label: '任务分析' },
      { href: '#/analytics/funnel', icon: '🔽', label: '转化漏斗' },
      { href: '#/analytics/trends', icon: '📈', label: '趋势图表' },
      { href: '#/analytics/revenue', icon: '💰', label: '收入分析' },
    ];

    // 从 API 获取管理员实时信息
    const cached = AdminAPI.getUser();
    let nickname = cached?.nickname || '管理员';
    let phone = cached?.phone || '';

    if (cached?.id) {
      try {
        const res = await AdminAPI.getUserDetail(cached.id);
        if (res.code === 0 && res.data) {
          nickname = res.data.nickname || nickname;
          phone = res.data.phone || phone;
          // 更新缓存
          AdminAPI.setUser({ ...cached, nickname, phone });
        }
      } catch {
        // API 失败时使用缓存数据
      }
    }

    el.innerHTML = `
      <div class="logo">Clip<span>AI</span></div>
      <nav>
        ${navItems.map((item) => `
          <a href="${item.href}" class="${current === item.href.slice(1) ? 'active' : ''}">
            <span class="icon">${item.icon}</span>
            ${item.label}
          </a>
        `).join('')}
      </nav>
      <div class="user-info">
        <div>${maskPhone(phone)}</div>
        <div>${nickname}</div>
        <div class="role">超级管理员</div>
      </div>
      <button class="logout-btn" id="logout-btn">退出登录</button>
    `;

    document.getElementById('logout-btn').onclick = () => {
      AdminAPI.clearToken();
      AdminAPI.clearUser();
      window.location.hash = '#/login';
    };
  }

  function maskPhone(p) {
    if (!p || p.length < 7) return p;
    return p.slice(0, 3) + '****' + p.slice(-4);
  }

  return { render };
})();
