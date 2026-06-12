/**
 * 管理员登录页面
 */
const LoginView = (() => {
  function render() {
    const app = document.getElementById('app');

    // 隐藏布局框架，全屏显示登录页
    document.getElementById('sidebar').style.display = 'none';
    document.getElementById('main-area').style.display = 'none';

    // 检查是否已有登录容器
    let container = document.getElementById('login-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'login-container';
      app.appendChild(container);
    }
    container.style.display = 'flex';

    const date = new Date().getFullYear();

    container.innerHTML = `
      <div class="login-wrapper">
        <div class="login-bg-shape"></div>
        <div class="login-card">
          <div class="login-header">
            <div class="login-logo">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect width="48" height="48" rx="12" fill="url(#logo-grad)"/>
                <path d="M14 32V16l10 8-10 8z" fill="#fff" opacity="0.9"/>
                <path d="M24 32V16l10 8-10 8z" fill="#fff" opacity="0.6"/>
                <defs>
                  <linearGradient id="logo-grad" x1="0" y1="0" x2="48" y2="48">
                    <stop offset="0%" stop-color="#8B5CF6"/>
                    <stop offset="100%" stop-color="#6366F1"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <h1>Clip<span>AI</span></h1>
            <p>管理后台</p>
          </div>

          <div class="login-body">
            <div class="login-form">
              <div class="input-group">
                <span class="input-icon">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="1" width="12" height="16" rx="2"/>
                    <line x1="7" y1="13" x2="11" y2="13"/>
                  </svg>
                </span>
                <input type="text" id="login-phone" placeholder="管理员手机号" value="13800138000" autocomplete="off">
              </div>

              <div class="input-group">
                <span class="input-icon">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="5" width="12" height="8" rx="1"/>
                    <circle cx="9" cy="9" r="2"/>
                    <line x1="9" y1="11" x2="9" y2="13"/>
                  </svg>
                </span>
                <input type="password" id="login-code" placeholder="验证码" autocomplete="off">
                <button type="button" class="input-btn" id="send-code-btn">获取</button>
              </div>

              <button class="login-btn" id="login-btn">
                <span id="login-btn-text">登 录</span>
                <span id="login-btn-spinner" style="display:none;">
                  <svg width="20" height="20" viewBox="0 0 20 20" class="spinner">
                    <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="40" stroke-linecap="round"/>
                  </svg>
                </span>
              </button>
            </div>
          </div>

          <div class="login-footer">
            <span class="hint">💡 开发环境验证码：<code>123456</code></span>
          </div>
        </div>

        <p class="login-copyright">© ${date} ClipAI. All rights reserved.</p>
      </div>
    `;

    // --- 事件绑定 ---
    const loginBtn = document.getElementById('login-btn');
    const sendCodeBtn = document.getElementById('send-code-btn');
    const phoneInput = document.getElementById('login-phone');
    const codeInput = document.getElementById('login-code');

    // 发送验证码
    sendCodeBtn.addEventListener('click', async () => {
      const phone = phoneInput.value.trim();
      if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
        Toast.error('请输入正确的手机号');
        return;
      }
      sendCodeBtn.disabled = true;
      sendCodeBtn.textContent = '发送中';
      try {
        await AdminAPI.sendCode(phone);
        Toast.success('验证码已发送');
        // 倒计时
        let sec = 60;
        sendCodeBtn.textContent = sec + 's';
        const timer = setInterval(() => {
          sec--;
          if (sec <= 0) {
            clearInterval(timer);
            sendCodeBtn.textContent = '获取';
            sendCodeBtn.disabled = false;
          } else {
            sendCodeBtn.textContent = sec + 's';
          }
        }, 1000);
      } catch (e) {
        Toast.error(e.message || '发送失败');
        sendCodeBtn.disabled = false;
        sendCodeBtn.textContent = '获取';
      }
    });

    // 回车登录
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loginBtn.click();
    });
    phoneInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') codeInput.focus();
    });

    // 登录
    loginBtn.addEventListener('click', async () => {
      const phone = phoneInput.value.trim();
      const code = codeInput.value.trim();

      if (!phone) { Toast.error('请输入手机号'); shakeInput(phoneInput); return; }
      if (!code) { Toast.error('请输入验证码'); shakeInput(codeInput); return; }

      setLoading(true);

      try {
        const res = await AdminAPI.verifyCode(phone, code);
        if (res.code === 0 && res.data) {
          const user = res.data.user;
          if (user.role !== 'admin') {
            Toast.error('该账号不是管理员，无法登录后台');
            setLoading(false);
            return;
          }
          AdminAPI.setToken(res.data.token);
          AdminAPI.setUser(user);

          // 清理登录页
          container.style.display = 'none';

          // 恢复布局并跳转
          document.getElementById('app').style.display = 'flex';
          document.getElementById('sidebar').style.display = '';
          document.getElementById('main-area').style.display = '';
          window.location.hash = '#/dashboard';
        } else {
          Toast.error(res.message || '登录失败');
          setLoading(false);
        }
      } catch (e) {
        Toast.error(e.message || '登录失败，请检查网络');
        setLoading(false);
      }
    });
  }

  function setLoading(loading) {
    const btn = document.getElementById('login-btn');
    const text = document.getElementById('login-btn-text');
    const spinner = document.getElementById('login-btn-spinner');
    if (loading) {
      btn.disabled = true;
      text.style.display = 'none';
      spinner.style.display = '';
    } else {
      btn.disabled = false;
      text.style.display = '';
      spinner.style.display = 'none';
    }
  }

  function shakeInput(el) {
    el.style.borderColor = 'var(--error)';
    el.classList.add('shake');
    setTimeout(() => {
      el.style.borderColor = '';
      el.classList.remove('shake');
    }, 400);
  }

  return { render };
})();
