(function(root) {
  'use strict';
  const num = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
  const money = v => Math.round((v + Number.EPSILON) * 100) / 100;
  function estimate(e, contracts) {
    const candidates = contracts.filter(c => c.id === e.contratoId && String(c.empresa||'').trim().toUpperCase() === String(e.empresa||'').trim().toUpperCase());
    if (!candidates.length) return null;
    const c = candidates[0];
    // Conflicting archived/active copies must not silently select a proposal.
    const signature = x => JSON.stringify([x.compra,x.valor,x.impostoPct,x.royaltiesPct,x.itensLotes]);
    if (candidates.some(x => signature(x) !== signature(c))) return null;
    const tax = num(c.impostoPct), royalty = num(c.royaltiesPct), revenue = num(e.valor);
    if (tax === null || royalty === null || tax < 0 || royalty < 0 || revenue === null || revenue < 0) return null;
    const items = e.itensEmpenhados || [];
    let purchase = 0, itemRevenue = 0;
    if (items.length) {
      for (const ie of items) {
        const found = (c.itensLotes || []).filter(it => it.id && it.id === ie.itemId);
        if (found.length !== 1) return null;
        const unit = num(found[0].compraUnit), qty = num(ie.qtdEmp), sale = num(ie.vlUnit);
        // Zero is the existing form's default for an unfilled purchase price.
        if (unit === null || unit <= 0 || qty === null || qty <= 0 || sale === null || sale < 0) return null;
        purchase += unit * qty;
        itemRevenue += sale * qty;
      }
      if (Math.abs(itemRevenue - revenue) > 0.02) return null;
    } else {
      const total = num(c.valor), buy = num(c.compra);
      if (!(total > 0) || !(buy > 0) || revenue > total) return null;
      purchase = buy * revenue / total;
    }
    const cost = money(revenue * (tax + royalty) / 100);
    return {vlCompraReal:money(purchase), custoReal:cost, lucroReal:money(revenue-money(purchase)-cost), vlEmpTotal:revenue, estimado:true};
  }
  root.KMProposalEstimate = {estimate};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KMProposalEstimate;
})(typeof window !== 'undefined' ? window : globalThis);
