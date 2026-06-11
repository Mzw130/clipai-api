/**
 * Toast 通知组件
 */
const Toast = (() => {
  let container;

  function getContainer() {
    if (!container) {
      container = document.getElementById('toast-container');
    }
    return container;
  }

  function show(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    getContainer().appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  return {
    success(msg) { show(msg, 'success'); },
    error(msg) { show(msg, 'error'); },
    info(msg) { show(msg, 'info'); },
  };
})();
