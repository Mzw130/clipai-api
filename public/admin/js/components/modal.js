/**
 * Modal 弹窗组件
 */
const Modal = (() => {
  const overlay = document.getElementById('modal-overlay');

  function show(html) {
    overlay.innerHTML = `<div class="modal-box">${html}</div>`;
    overlay.classList.remove('hidden');
  }

  function hide() {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  }

  function confirm(title, message) {
    return new Promise((resolve) => {
      show(`
        <h3>${title}</h3>
        <p style="color:var(--text-secondary);font-size:14px;margin-bottom:20px;">${message}</p>
        <div class="modal-actions">
          <button class="btn btn-outline" id="modal-cancel">取消</button>
          <button class="btn btn-danger" id="modal-confirm">确认</button>
        </div>
      `);
      document.getElementById('modal-cancel').onclick = () => { hide(); resolve(false); };
      document.getElementById('modal-confirm').onclick = () => { hide(); resolve(true); };
    });
  }

  function form(title, fields, onSubmit) {
    const fieldsHtml = fields.map((f) => `
      <div class="form-group">
        <label>${f.label}</label>
        ${f.type === 'select'
          ? `<select id="field-${f.name}">${f.options.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}</select>`
          : `<input type="${f.type || 'text'}" id="field-${f.name}" placeholder="${f.placeholder || ''}" value="${f.value || ''}">`}
      </div>
    `).join('');

    show(`
      <h3>${title}</h3>
      ${fieldsHtml}
      <div class="modal-actions">
        <button class="btn btn-outline" id="modal-cancel">取消</button>
        <button class="btn btn-primary" id="modal-submit">确认</button>
      </div>
    `);

    document.getElementById('modal-cancel').onclick = hide;
    document.getElementById('modal-submit').onclick = () => {
      const values = {};
      fields.forEach((f) => {
        const el = document.getElementById(`field-${f.name}`);
        values[f.name] = f.type === 'number' ? Number(el.value) : el.value;
      });
      hide();
      onSubmit(values);
    };
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hide();
  });

  return { show, hide, confirm, form };
})();
