/**
 * Hash SPA Router
 */
const Router = (() => {
  const routes = {
    '/dashboard': DashboardView,
    '/users': UsersView,
    '/tasks': TasksView,
    '/subscriptions': SubscriptionsView,
    '/models': ModelsView,
    '/login': LoginView,
  };

  function init() {
    const token = AdminAPI.getToken();
    const user = AdminAPI.getUser();

    if (!token || !user || user.role !== 'admin') {
      window.location.hash = '#/login';
    } else {
      if (!window.location.hash || window.location.hash === '#/' || window.location.hash === '#/login') {
        window.location.hash = '#/dashboard';
      }
    }

    handleRoute();
    window.addEventListener('hashchange', handleRoute);
  }

  function handleRoute() {
    const hash = window.location.hash.replace('#', '') || '/dashboard';
    const token = AdminAPI.getToken();
    const user = AdminAPI.getUser();
    const sidebar = document.getElementById('sidebar');
    const mainArea = document.getElementById('main-area');
    const loginContainer = document.getElementById('login-container');

    // 未登录 → 强制跳转登录
    if ((!token || !user || user.role !== 'admin') && hash !== '/login') {
      window.location.hash = '#/login';
      return;
    }

    // 已登录但访问 login → 跳转仪表盘
    if (token && user?.role === 'admin' && hash === '/login') {
      window.location.hash = '#/dashboard';
      return;
    }

    const view = routes[hash];
    if (!view) {
      window.location.hash = '#/dashboard';
      return;
    }

    // 登录页：隐藏布局框架，显示全屏登录
    if (hash === '/login') {
      DashboardView.stopAutoRefresh();
      if (loginContainer) loginContainer.style.display = '';
      if (sidebar) sidebar.style.display = 'none';
      if (mainArea) mainArea.style.display = 'none';
      view.render();
      return;
    }

    // 其他页面：隐藏登录容器，显示正常布局
    if (loginContainer) loginContainer.style.display = 'none';
    if (sidebar) sidebar.style.display = '';
    if (mainArea) mainArea.style.display = '';

    Sidebar.render();
    document.getElementById('topbar').innerHTML = topbarTitle(hash);
    view.render();

    if (hash === '/dashboard') {
      DashboardView.startAutoRefresh();
    } else {
      DashboardView.stopAutoRefresh();
    }
  }

  function topbarTitle(hash) {
    const titles = {
      '/dashboard': '📊 仪表盘',
      '/users': '👥 用户管理',
      '/tasks': '📋 任务列表',
      '/subscriptions': '💳 订阅管理',
      '/models': '⚙️ 模型配置',
    };
    return titles[hash] || '';
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  Router.init();
});
