const htmlEscape = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function currency(valueMinor, currencyCode) {
  const digits = currencyCode === "JPY" ? 0 : 2;
  return new Intl.NumberFormat(currencyCode === "JPY" ? "ja-JP" : "pt-BR", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format((Number(valueMinor) || 0) / (currencyCode === "JPY" ? 1 : 100));
}

function deliveryLabel(mode) {
  return ({ pickup: "Retirada", delivery: "Entrega", postal: "Correio", none: "A combinar" })[mode] || "A combinar";
}

function line(label, value, strong = false) {
  if (!value) return "";
  return `<div class="row${strong ? " strong" : ""}"><span>${htmlEscape(label)}</span><b>${htmlEscape(value)}</b></div>`;
}

function itemRows(order, operational) {
  return order.items.map((item) => {
    const options = item.options?.length
      ? `<div class="options">${item.options.map((option) => `${htmlEscape(option.quantity)}x ${htmlEscape(option.name)}`).join(" · ")}</div>`
      : "";
    const badge = operational
      ? `<span class="badge">${item.needsProduction || item.shortageQuantity > 0 ? "PRODUZIR" : "SEPARAR"}</span>`
      : `<span class="price">${htmlEscape(currency(item.subtotalMinor, order.currency))}</span>`;
    const shortage = operational && item.shortageQuantity > 0
      ? `<div class="warning">Falta no estoque: ${htmlEscape(item.shortageQuantity)}</div>`
      : "";
    return `<div class="item"><div class="item-main"><div><b>${htmlEscape(item.quantity)}x ${htmlEscape(item.name)}</b>${options}${shortage}</div>${badge}</div></div>`;
  }).join("");
}

export function receiptDocument(job, copyType, profile = {}) {
  const shellProfile = {
    paperWidthMm: Number(profile.paperWidthMm) === 58 ? 58 : 80,
    dpi: Number(profile.dpi) || 203,
    dotsPerLine: Number(profile.dotsPerLine) || (Number(profile.paperWidthMm) === 58 ? 384 : 576),
    intensity: Number.isFinite(Number(profile.intensity)) ? Number(profile.intensity) : 55,
  };

  if (job.type === "test") {
    return documentShell({
      title: "TESTE DE IMPRESSÃO",
      body: `<div class="center"><h1>${htmlEscape(job.test.storeName)}</h1><p>${htmlEscape(job.test.message)}</p><p class="small">${new Date().toLocaleString()}</p><div class="test-bars"><i></i><i></i><i></i><i></i><i></i></div></div>`,
      estimatedMm: 100,
      profile: shellProfile,
    });
  }

  const order = job.order;
  const operational = copyType === "production";
  const title = operational ? "VIA DE PRODUÇÃO" : "VIA DO CLIENTE";
  const source = order.source === "event" ? `Evento${order.eventTitle ? `: ${order.eventTitle}` : ""}` : "Loja permanente";
  const body = `
    <div class="center">
      <h1>${htmlEscape(order.storeName)}</h1>
      <h2>${title}</h2>
      <div class="order-id">#${htmlEscape(order.shortId)}</div>
    </div>
    <div class="divider"></div>
    ${line("Origem", source)}
    ${line("Cliente", order.customerName)}
    ${line("Telefone", order.customerPhone)}
    ${line("Recebimento", deliveryLabel(order.deliveryMode))}
    ${line("Data", order.deliveryDate || "A combinar")}
    ${line("Horário", order.deliveryTime || "A combinar")}
    ${line("Endereço", order.address)}
    <div class="divider"></div>
    <h3>ITENS</h3>
    ${itemRows(order, operational)}
    ${order.note ? `<div class="divider"></div><h3>OBSERVAÇÕES</h3><p>${htmlEscape(order.note)}</p>` : ""}
    ${!operational ? `
      <div class="divider"></div>
      ${line("Subtotal", currency(order.subtotalMinor, order.currency))}
      ${order.discountMinor > 0 ? line("Desconto", `- ${currency(order.discountMinor, order.currency)}`) : ""}
      ${order.shippingFeeMinor > 0 ? line("Frete", currency(order.shippingFeeMinor, order.currency)) : ""}
      ${line("TOTAL", currency(order.totalAmountMinor, order.currency), true)}
      <div class="center thanks">Obrigado pela preferência!</div>
    ` : ""}
    <div class="divider"></div>
    <div class="center small">Impresso em ${htmlEscape(new Date().toLocaleString())}</div>
  `;

  const optionCount = order.items.reduce((sum, item) => sum + (item.options?.length || 0), 0);
  const narrowExtra = shellProfile.paperWidthMm === 58 ? 35 : 0;
  const estimatedMm = Math.max(150, 112 + narrowExtra + order.items.length * 22 + optionCount * 7 + (order.note ? 24 : 0) + (!operational ? 35 : 0));
  return documentShell({ title, body, estimatedMm, profile: shellProfile });
}

function sharedCss({ width, padding, base, h1, h2, h3, small, orderId, gap, rowLabel, divider, itemPadding, badge, optionIndent }) {
  return `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: white; color: black; }
    body { width: ${width}; padding: ${padding}; font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", "Noto Sans", Arial, sans-serif; font-size: ${base}; line-height: 1.35; }
    h1 { margin: 0; font-size: ${h1}; font-weight: 900; }
    h2 { margin: 4px 0 0; font-size: ${h2}; letter-spacing: .08em; }
    h3 { margin: 0 0 5px; font-size: ${h3}; letter-spacing: .08em; }
    p { margin: 4px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .center { text-align: center; }
    .small { font-size: ${small}; }
    .order-id { margin-top: 5px; font-size: ${orderId}; font-weight: 900; letter-spacing: .08em; }
    .divider { border-top: ${divider} dashed #000; margin: 8px 0; }
    .row { display: grid; grid-template-columns: ${rowLabel} 1fr; gap: ${gap}; padding: 1px 0; }
    .row b { text-align: right; overflow-wrap: anywhere; }
    .row.strong { font-size: 1.32em; border-top: ${divider} solid #000; margin-top: 4px; padding-top: 5px; }
    .item { padding: ${itemPadding} 0; break-inside: avoid; }
    .item + .item { border-top: 1px dotted #777; }
    .item-main { display: flex; justify-content: space-between; align-items: flex-start; gap: 5px; }
    .item-main > div { min-width: 0; overflow-wrap: anywhere; }
    .badge { border: ${divider} solid #000; padding: 1px 3px; font-size: ${badge}; font-weight: 900; white-space: nowrap; }
    .price { font-weight: 900; white-space: nowrap; }
    .options { margin-top: 2px; padding-left: ${optionIndent}; font-size: ${small}; }
    .warning { margin-top: 2px; padding-left: ${optionIndent}; font-size: ${small}; font-weight: 900; }
    .thanks { margin-top: 8px; font-weight: 900; }
    .test-bars { display:flex; height: 14px; margin-top: 12px; }
    .test-bars i { flex:1; display:block; }
    .test-bars i:nth-child(1) { background:#111; }
    .test-bars i:nth-child(2) { background:#444; }
    .test-bars i:nth-child(3) { background:#777; }
    .test-bars i:nth-child(4) { background:#aaa; }
    .test-bars i:nth-child(5) { background:#ddd; }
  `;
}

function documentShell({ title, body, estimatedMm, profile }) {
  const heightMm = Math.min(1000, Math.ceil(estimatedMm));
  const pageMarginMm = profile.paperWidthMm === 58 ? 2 : 3;
  const contentWidthMm = profile.paperWidthMm - pageMarginMm * 2;
  const dots = profile.dotsPerLine;
  const rasterPadding = Math.max(8, Math.round(dots * pageMarginMm / profile.paperWidthMm));
  const contentDots = dots - rasterPadding * 2;
  const cssPxPerMm = 96 / 25.4;
  const rasterScale = dots / (profile.paperWidthMm * cssPxPerMm);
  const px = (value) => `${Math.max(1, Math.round(value * rasterScale))}px`;

  const pdfCss = sharedCss({
    width: `${contentWidthMm}mm`, padding: "0", base: "10.5px", h1: "18px", h2: "12px", h3: "10px", small: "8px", orderId: "22px", gap: "2mm", rowLabel: profile.paperWidthMm === 58 ? "18mm" : "25mm", divider: "1px", itemPadding: "4px", badge: "7px", optionIndent: "4mm",
  });
  const rasterCss = sharedCss({
    width: `${dots}px`, padding: `${rasterPadding}px`, base: px(10.5), h1: px(18), h2: px(12), h3: px(10), small: px(8), orderId: px(22), gap: px(7.5), rowLabel: `${Math.round(contentDots * (profile.paperWidthMm === 58 ? 0.34 : 0.36))}px`, divider: Math.max(1, Math.round(rasterScale)) + "px", itemPadding: px(4), badge: px(7), optionIndent: px(15),
  });

  return {
    heightMm,
    rasterHeightDots: Math.ceil(heightMm * profile.dpi / 25.4),
    html: `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${htmlEscape(title)}</title><style>@page { size: ${profile.paperWidthMm}mm ${heightMm}mm; margin: ${pageMarginMm}mm; }${pdfCss}</style></head><body>${body}</body></html>`,
    rasterHtml: `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${htmlEscape(title)}</title><style>${rasterCss}</style></head><body>${body}</body></html>`,
  };
}
