/**
 * 通用分页表格
 */
const DataTable = (() => {
  function render(container, config) {
    const { columns, data, pagination, onPageChange, onSort, sortBy, sortOrder } = config;

    let html = '<table class="data-table"><thead><tr>';

    columns.forEach((col) => {
      const sortable = col.sortable ? ' style="cursor:pointer"' : '';
      const arrow = col.sortable && sortBy === col.key
        ? `<span class="sort-arrow">${sortOrder === 'asc' ? '▲' : '▼'}</span>`
        : '';
      html += `<th${sortable} data-sort="${col.key}">${col.label}${arrow}</th>`;
    });

    html += '</tr></thead><tbody>';

    if (!data || data.length === 0) {
      const colspan = columns.length;
      html += `<tr><td colspan="${colspan}" style="text-align:center;padding:40px;color:var(--text-muted);">暂无数据</td></tr>`;
    } else {
      data.forEach((row) => {
        html += '<tr>';
        columns.forEach((col) => {
          const value = col.render ? col.render(row) : (row[col.key] || '-');
          html += `<td>${value}</td>`;
        });
        html += '</tr>';
      });
    }

    html += '</tbody></table>';

    // Pagination
    if (pagination && pagination.total_pages > 1) {
      html += '<div class="pagination">';
      html += `<span>共 ${pagination.total} 条</span>`;
      html += `<button ${pagination.page <= 1 ? 'disabled' : ''} data-page="${pagination.page - 1}">上一页</button>`;
      html += `<span>${pagination.page} / ${pagination.total_pages}</span>`;
      html += `<button ${pagination.page >= pagination.total_pages ? 'disabled' : ''} data-page="${pagination.page + 1}">下一页</button>`;
      html += '</div>';
    }

    container.innerHTML = html;

    // Events
    container.querySelectorAll('th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        const newOrder = sortBy === key && sortOrder === 'asc' ? 'desc' : 'asc';
        if (onSort) onSort(key, newOrder);
      });
    });

    container.querySelectorAll('.pagination button[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (onPageChange) onPageChange(parseInt(btn.dataset.page));
      });
    });
  }

  return { render };
})();
