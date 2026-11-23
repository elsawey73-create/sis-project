// Copy each column title onto its cells so a narrow screen can stack the row
// as a card without losing the header.
export function labelResponsiveTables(root) {
  if (!root) return;
  root.querySelectorAll('table.table').forEach((table) => {
    const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.replace(/\s+/g, ' ').trim());
    table.querySelectorAll('tbody tr').forEach((tr) => {
      [...tr.children].forEach((cell, index) => {
        if (cell.tagName !== 'TD' || cell.hasAttribute('colspan')) {
          cell.removeAttribute('data-label');
          return;
        }
        const label = heads[index] || '';
        if (label) cell.dataset.label = label;
        else cell.removeAttribute('data-label');
      });
    });
  });
}
