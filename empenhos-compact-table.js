/* Compact expandable rows for the three Empenhos tables. */
(() => {
  const configs = [
    ['empPendTableBody', 'pendentes'],
    ['empAndTableBody', 'andamento'],
    ['empEncTableBody', 'pagos']
  ];
  const labels = ['Datas', 'Nº do empenho', 'Órgão / contrato', 'Itens empenhados', 'Valor do empenho', 'Compra', 'Custo', 'Lucro e margem', 'Status'];

  function plainSummary(cell, selector) {
    const node = selector ? cell.querySelector(selector) : null;
    return (node || cell).textContent.replace(/\s+/g, ' ').trim() || '—';
  }

  function compact(tbody, key) {
    Array.from(tbody.children).forEach((row, index) => {
      if (row.tagName !== 'TR' || row.classList.contains('emp-row-details') || row.dataset.empCompact === 'true' || row.cells.length !== 11) return;
      const cells = Array.from(row.cells);
      const summaries = {
        date: plainSummary(cells[1], '.dt-etapa') || plainSummary(cells[1]),
        number: plainSummary(cells[2]),
        organ: plainSummary(cells[3], '.con-orgao-nome'),
        company: plainSummary(cells[3], '.emp-orgao-company'),
        value: plainSummary(cells[5]),
        status: plainSummary(cells[9], '.status-wrap > span, .status-badge')
      };
      const detail = document.createElement('tr');
      detail.className = 'emp-row-details';
      detail.hidden = true;
      detail.id = 'emp-details-' + key + '-' + index;
      const detailCell = document.createElement('td');
      detailCell.colSpan = 7;
      const grid = document.createElement('div');
      grid.className = 'emp-details-grid';

      for (let i = 1; i <= 9; i++) {
        const panel = document.createElement('section');
        panel.className = 'emp-details-item';
        const title = document.createElement('div');
        title.className = 'emp-details-label';
        title.textContent = labels[i - 1];
        const content = document.createElement('div');
        content.className = 'emp-details-content';
        while (cells[i].firstChild) content.appendChild(cells[i].firstChild);
        if (!content.childNodes.length) content.textContent = '—';
        panel.append(title, content);
        grid.appendChild(panel);
      }

      detailCell.appendChild(grid);
      detail.appendChild(detailCell);

      function summaryCell(cell, primary, secondary) {
        const wrap = document.createElement('div');
        wrap.className = 'emp-main-summary';
        const main = document.createElement('div');
        main.className = 'emp-main-primary';
        main.textContent = primary || '—';
        wrap.appendChild(main);
        if (secondary && secondary !== '—') {
          const sub = document.createElement('div');
          sub.className = 'emp-main-secondary';
          sub.textContent = secondary;
          wrap.appendChild(sub);
        }
        cell.replaceChildren(wrap);
      }
      summaryCell(cells[1], summaries.date);
      summaryCell(cells[2], summaries.number);
      summaryCell(cells[3], summaries.organ, summaries.company);
      summaryCell(cells[5], summaries.value);
      summaryCell(cells[9], summaries.status);

      const expand = document.createElement('button');
      expand.type = 'button';
      expand.className = 'emp-expand-btn';
      expand.textContent = '+';
      expand.setAttribute('aria-label', 'Expandir informações do empenho');
      expand.setAttribute('aria-controls', detail.id);
      expand.setAttribute('aria-expanded', 'false');
      expand.addEventListener('click', event => {
        event.stopPropagation();
        detail.hidden = !detail.hidden;
        expand.textContent = detail.hidden ? '+' : '−';
        expand.setAttribute('aria-expanded', String(!detail.hidden));
        expand.setAttribute('aria-label', detail.hidden ? 'Expandir informações do empenho' : 'Recolher informações do empenho');
      });
      cells[0].appendChild(expand);
      row.classList.add('emp-compact-main');
      row.dataset.empCompact = 'true';
      row.dataset.empTable = key;
      row.parentNode.insertBefore(detail, row.nextSibling);
    });
  }

  const style = document.createElement('style');
  style.id = 'emp-compact-expandable-styles';
  style.textContent = `
    .emp-table-pend,.emp-table-and,.emp-table-pagos{table-layout:fixed!important;width:100%!important}
    .emp-table-pend th:nth-child(5),.emp-table-and th:nth-child(5),.emp-table-pagos th:nth-child(5),
    .emp-table-pend td:nth-child(5),.emp-table-and td:nth-child(5),.emp-table-pagos td:nth-child(5),
    .emp-table-pend th:nth-child(7),.emp-table-and th:nth-child(7),.emp-table-pagos th:nth-child(7),
    .emp-table-pend td:nth-child(7),.emp-table-and td:nth-child(7),.emp-table-pagos td:nth-child(7),
    .emp-table-pend th:nth-child(8),.emp-table-and th:nth-child(8),.emp-table-pagos th:nth-child(8),
    .emp-table-pend td:nth-child(8),.emp-table-and td:nth-child(8),.emp-table-pagos td:nth-child(8),
    .emp-table-pend th:nth-child(9),.emp-table-and th:nth-child(9),.emp-table-pagos th:nth-child(9),
    .emp-table-pend td:nth-child(9),.emp-table-and td:nth-child(9),.emp-table-pagos td:nth-child(9){display:none!important}
    .emp-table-pend th:nth-child(1),.emp-table-and th:nth-child(1),.emp-table-pagos th:nth-child(1),
    .emp-table-pend td:nth-child(1),.emp-table-and td:nth-child(1),.emp-table-pagos td:nth-child(1){width:52px!important;min-width:52px!important;max-width:52px!important}
    .emp-table-pend th:nth-child(2),.emp-table-and th:nth-child(2),.emp-table-pagos th:nth-child(2),
    .emp-table-pend td:nth-child(2),.emp-table-and td:nth-child(2),.emp-table-pagos td:nth-child(2){width:18%!important}
    .emp-table-pend th:nth-child(3),.emp-table-and th:nth-child(3),.emp-table-pagos th:nth-child(3),
    .emp-table-pend td:nth-child(3),.emp-table-and td:nth-child(3),.emp-table-pagos td:nth-child(3){width:11%!important}
    .emp-table-pend th:nth-child(4),.emp-table-and th:nth-child(4),.emp-table-pagos th:nth-child(4),
    .emp-table-pend td:nth-child(4),.emp-table-and td:nth-child(4),.emp-table-pagos td:nth-child(4){width:34%!important}
    .emp-table-pend th:nth-child(6),.emp-table-and th:nth-child(6),.emp-table-pagos th:nth-child(6),
    .emp-table-pend td:nth-child(6),.emp-table-and td:nth-child(6),.emp-table-pagos td:nth-child(6){width:16%!important}
    .emp-table-pend th:nth-child(10),.emp-table-and th:nth-child(10),.emp-table-pagos th:nth-child(10),
    .emp-table-pend td:nth-child(10),.emp-table-and td:nth-child(10),.emp-table-pagos td:nth-child(10){width:13%!important}
    .emp-table-pend th:nth-child(11),.emp-table-and th:nth-child(11),.emp-table-pagos th:nth-child(11),
    .emp-table-pend td:nth-child(11),.emp-table-and td:nth-child(11),.emp-table-pagos td:nth-child(11){width:52px!important;min-width:52px!important;max-width:52px!important}
    .emp-compact-main{height:54px!important;max-height:54px!important}
    .emp-compact-main>td{height:54px!important;max-height:54px!important;padding:5px 8px!important;vertical-align:middle!important;overflow:hidden!important;white-space:nowrap!important;text-overflow:ellipsis}
    .emp-compact-main>td:first-child,.emp-compact-main>td:last-child{overflow:visible!important;text-align:center}
    .emp-compact-main>td:nth-child(4){white-space:normal!important}
    .emp-main-summary{min-width:0;overflow:hidden}
    .emp-main-primary{font-size:10px;font-weight:700;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .emp-main-secondary{font-size:9px;line-height:1.2;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .emp-expand-btn{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;margin:4px 0 0;border:1px solid var(--primary-border);border-radius:6px;background:var(--primary-soft);color:var(--primary-dark);font-size:15px;font-weight:700;line-height:1;cursor:pointer}
    .emp-expand-btn:hover{background:var(--primary);color:#fff}
    .emp-row-details[hidden]{display:none!important}
    .emp-row-details>td{padding:10px 12px!important;background:var(--bg)!important;border-bottom:1px solid var(--line)}
    .emp-details-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px}
    .emp-details-item{min-width:0;padding:9px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);overflow-wrap:anywhere}
    .emp-details-label{margin-bottom:5px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
    .emp-details-content{font-size:10px;line-height:1.45;color:var(--text);white-space:normal}
    .emp-details-content .dt-wrap{gap:3px}
    .emp-details-content .row-menu-wrap{position:relative}
    @media(max-width:700px){.emp-table-pend th:nth-child(2),.emp-table-and th:nth-child(2),.emp-table-pagos th:nth-child(2),.emp-table-pend td:nth-child(2),.emp-table-and td:nth-child(2),.emp-table-pagos td:nth-child(2){width:23%!important}.emp-table-pend th:nth-child(4),.emp-table-and th:nth-child(4),.emp-table-pagos th:nth-child(4),.emp-table-pend td:nth-child(4),.emp-table-and td:nth-child(4),.emp-table-pagos td:nth-child(4){width:29%!important}}
  `;
  document.head.appendChild(style);

  configs.forEach(([id, key]) => {
    const tbody = document.getElementById(id);
    if (!tbody) return;
    compact(tbody, key);
    new MutationObserver(() => compact(tbody, key)).observe(tbody, {childList: true});
  });
})();
