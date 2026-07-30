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

function defaultReceipt(copyType) {
  return {
    showLogo: true,
    logoUrl: "",
    showHeaderText: true,
    headerText: "",
    showFooterText: copyType === "customer",
    footerText: "",
    checkboxEnabled: copyType === "production",
    checkboxStyle: "square",
    qrEnabled: false,
    qrLabel: "",
    qrTargetUrl: "",
    qrImageUrl: "",
  };
}

function receiptSettings(job, copyType) {
  const raw = job?.receipt?.[copyType] ?? {};
  return { ...defaultReceipt(copyType), ...raw };
}

function checkboxGlyph(style) {
  if (style === "brackets") return "[ ]";
  if (style === "circle") return "○";
  if (style === "line") return "____";
  return "□";
}

function itemRows(order, operational, receipt) {
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
    const checklist = receipt.checkboxEnabled
      ? `<span class="item-check">${htmlEscape(checkboxGlyph(receipt.checkboxStyle))}</span>`
      : "";
    return `<div class="item"><div class="item-main"><div class="item-description">${checklist}<div><b>${htmlEscape(item.quantity)}x ${htmlEscape(item.name)}</b>${options}${shortage}</div></div>${badge}</div></div>`;
  }).join("");
}

function productionSummaryRows(summary, receipt) {
  let previousCategory = "";
  return (summary.items || []).map((item) => {
    const category = String(item.category || "").trim();
    const categoryHeading = category && category !== previousCategory
      ? `<div class="summary-category">${htmlEscape(category)}</div>`
      : "";
    if (category) previousCategory = category;
    const checklist = receipt.checkboxEnabled
      ? `<span class="item-check">${htmlEscape(checkboxGlyph(receipt.checkboxStyle))}</span>`
      : "";
    return `${categoryHeading}<div class="item summary-item"><div class="item-main"><div class="item-description">${checklist}<div><b>${htmlEscape(item.quantity)}x ${htmlEscape(item.name)}</b></div></div><span class="badge">PRODUZIR</span></div></div>`;
  }).join("");
}

function logoBlock(receipt, storeName) {
  if (!receipt.showLogo || !receipt.logoUrl) return "";
  return `<img class="receipt-logo" src="${htmlEscape(receipt.logoUrl)}" alt="${htmlEscape(storeName)}" />`;
}

function headerTextBlock(receipt) {
  return receipt.showHeaderText && receipt.headerText
    ? `<p class="receipt-header">${htmlEscape(receipt.headerText)}</p>`
    : "";
}

function footerTextBlock(receipt) {
  return receipt.showFooterText && receipt.footerText
    ? `<p class="receipt-footer">${htmlEscape(receipt.footerText)}</p>`
    : "";
}

function qrBlock(receipt) {
  if (!receipt.qrEnabled || !receipt.qrImageUrl) return "";
  return `<div class="qr-block"><img class="qr-image" src="${htmlEscape(receipt.qrImageUrl)}" alt="QR Code" />${receipt.qrLabel ? `<p class="qr-label">${htmlEscape(receipt.qrLabel)}</p>` : ""}</div>`;
}

export function receiptDocument(job, copyType, profile = {}) {
  const shellProfile = {
    paperWidthMm: Number(profile.paperWidthMm) === 58 ? 58 : 80,
    dpi: Number(profile.dpi) || 203,
    dotsPerLine: Number(profile.dotsPerLine) || (Number(profile.paperWidthMm) === 58 ? 384 : 576),
    intensity: Number.isFinite(Number(profile.intensity)) ? Number(profile.intensity) : 55,
  };
  const receipt = receiptSettings(job, copyType);

  if (job.type === "test") {
    const body = `<div class="center">${logoBlock(receipt, job.test.storeName)}<h1>${htmlEscape(job.test.storeName)}</h1>${headerTextBlock(receipt)}<p>${htmlEscape(job.test.message)}</p><p class="small">${new Date().toLocaleString()}</p><div class="test-bars"><i></i><i></i><i></i><i></i><i></i></div>${qrBlock(receipt)}${footerTextBlock(receipt)}</div>`;
    return documentShell({
      title: "TESTE DE IMPRESSÃO",
      body,
      estimatedMm: 100 + (receipt.qrEnabled ? 50 : 0) + (receipt.logoUrl ? 20 : 0),
      profile: shellProfile,
    });
  }

  if (job.type === "event_production_summary") {
    const summary = job.eventProduction;
    const filterLabel = summary.deliveryDate || "Todas as datas";
    const generatedAt = summary.generatedAt
      ? new Date(summary.generatedAt).toLocaleString()
      : new Date().toLocaleString();
    const body = `
      <div class="center">
        ${logoBlock(receipt, summary.storeName)}
        <h1>${htmlEscape(summary.storeName)}</h1>
        ${headerTextBlock(receipt)}
        <h2>RESUMO DE PRODUÇÃO</h2>
        <div class="order-id">${htmlEscape(summary.eventTitle)}</div>
      </div>
      <div class="divider"></div>
      ${line("Evento", summary.eventTitle)}
      ${line("Data", filterLabel)}
      ${line("Pedidos", summary.orderCount)}
      ${line("Total de unidades", summary.totalUnits, true)}
      <div class="divider"></div>
      <h3>ITENS PARA PRODUÇÃO</h3>
      ${productionSummaryRows(summary, receipt)}
      ${qrBlock(receipt)}
      ${footerTextBlock(receipt)}
      <div class="divider"></div>
      <div class="center small">Resumo gerado em ${htmlEscape(generatedAt)}</div>
    `;
    const categoryCount = new Set((summary.items || []).map((item) => item.category).filter(Boolean)).size;
    const narrowExtra = shellProfile.paperWidthMm === 58 ? 30 : 0;
    const customExtra = (receipt.qrEnabled ? 52 : 0) + (receipt.logoUrl ? 22 : 0) + (receipt.headerText ? 12 : 0) + (receipt.footerText ? 18 : 0);
    const estimatedMm = Math.max(130, 98 + narrowExtra + customExtra + (summary.items?.length || 0) * 17 + categoryCount * 8);
    return documentShell({ title: "RESUMO DE PRODUÇÃO", body, estimatedMm, profile: shellProfile });
  }

  const order = job.order;
  const operational = copyType === "production";
  const title = operational ? "VIA DE PRODUÇÃO" : "VIA DO CLIENTE";
  const source = order.source === "event" ? `Evento${order.eventTitle ? `: ${order.eventTitle}` : ""}` : "Loja permanente";
  const body = `
    <div class="center">
      ${logoBlock(receipt, order.storeName)}
      <h1>${htmlEscape(order.storeName)}</h1>
      ${headerTextBlock(receipt)}
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
    ${itemRows(order, operational, receipt)}
    ${order.note ? `<div class="divider"></div><h3>OBSERVAÇÕES</h3><p>${htmlEscape(order.note)}</p>` : ""}
    ${!operational ? `
      <div class="divider"></div>
      ${line("Subtotal", currency(order.subtotalMinor, order.currency))}
      ${order.discountMinor > 0 ? line("Desconto", `- ${currency(order.discountMinor, order.currency)}`) : ""}
      ${order.shippingFeeMinor > 0 ? line("Frete", currency(order.shippingFeeMinor, order.currency)) : ""}
      ${line("TOTAL", currency(order.totalAmountMinor, order.currency), true)}
      ${line("Pagamento", order.paymentMethod)}
      <div class="center thanks">Obrigado pela preferência!</div>
    ` : ""}
    ${qrBlock(receipt)}
    ${footerTextBlock(receipt)}
    <div class="divider"></div>
    <div class="center small">Impresso em ${htmlEscape(new Date().toLocaleString())}</div>
  `;

  const optionCount = order.items.reduce((sum, item) => sum + (item.options?.length || 0), 0);
  const narrowExtra = shellProfile.paperWidthMm === 58 ? 35 : 0;
  const customExtra = (receipt.qrEnabled ? 52 : 0) + (receipt.logoUrl ? 22 : 0) + (receipt.headerText ? 12 : 0) + (receipt.footerText ? 18 : 0);
  const estimatedMm = Math.max(150, 112 + narrowExtra + customExtra + order.items.length * 22 + optionCount * 7 + (order.note ? 24 : 0) + (!operational ? 35 : 0));
  return documentShell({ title, body, estimatedMm, profile: shellProfile });
}

function sharedCss({ width, padding, base, h1, h2, h3, small, orderId, gap, rowLabel, divider, itemPadding, badge, optionIndent, logoHeight, qrSize }) {
  return `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: white; color: black; }
    body { width: ${width}; padding: ${padding}; font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", "Noto Sans", Arial, sans-serif; font-size: ${base}; line-height: 1.35; }
    h1 { margin: 0; font-size: ${h1}; font-weight: 900; overflow-wrap: anywhere; }
    h2 { margin: 4px 0 0; font-size: ${h2}; letter-spacing: .08em; }
    h3 { margin: 0 0 5px; font-size: ${h3}; letter-spacing: .08em; }
    p { margin: 4px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .center { text-align: center; }
    .small { font-size: ${small}; }
    .receipt-logo { display:block; max-width: 80%; height: auto; max-height: ${logoHeight}; margin: 0 auto 5px; object-fit: contain; filter: grayscale(1) contrast(1.15); }
    .receipt-header, .receipt-footer { margin: 5px 0; text-align:center; font-size: ${small}; font-weight: 700; white-space: pre-wrap; }
    .receipt-footer { margin-top: 9px; }
    .order-id { margin-top: 5px; font-size: ${orderId}; font-weight: 900; letter-spacing: .08em; }
    .divider { border-top: ${divider} dashed #000; margin: 8px 0; }
    .row { display: grid; grid-template-columns: ${rowLabel} 1fr; gap: ${gap}; padding: 1px 0; }
    .row b { text-align: right; overflow-wrap: anywhere; }
    .row.strong { font-size: 1.32em; border-top: ${divider} solid #000; margin-top: 4px; padding-top: 5px; }
    .item { padding: ${itemPadding} 0; break-inside: avoid; }
    .item + .item { border-top: 1px dotted #777; }
    .item-main { display: flex; justify-content: space-between; align-items: flex-start; gap: 5px; }
    .item-main > div { min-width: 0; overflow-wrap: anywhere; }
    .item-description { display:flex; align-items:flex-start; gap:5px; }
    .item-check { flex:0 0 auto; min-width: 1.6em; font-weight:900; white-space:nowrap; }
    .badge { border: ${divider} solid #000; padding: 1px 3px; font-size: ${badge}; font-weight: 900; white-space: nowrap; }
    .price { font-weight: 900; white-space: nowrap; }
    .options { margin-top: 2px; padding-left: ${optionIndent}; font-size: ${small}; }
    .warning { margin-top: 2px; padding-left: ${optionIndent}; font-size: ${small}; font-weight: 900; }
    .summary-category { margin: 8px 0 2px; padding: 3px 4px; border-top: ${divider} solid #000; border-bottom: 1px solid #777; font-size: ${small}; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }
    .summary-item .badge { min-width: 4.8em; text-align: center; }
    .thanks { margin-top: 8px; font-weight: 900; }
    .qr-block { margin: 10px auto 2px; text-align:center; break-inside:avoid; }
    .qr-image { display:block; width:${qrSize}; height:${qrSize}; margin:0 auto; object-fit:contain; image-rendering:pixelated; }
    .qr-label { margin:3px auto 0; max-width:90%; font-size:${small}; font-weight:900; }
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
    width: `${contentWidthMm}mm`, padding: "0", base: "10.5px", h1: "18px", h2: "12px", h3: "10px", small: "8px", orderId: "22px", gap: "2mm", rowLabel: profile.paperWidthMm === 58 ? "18mm" : "25mm", divider: "1px", itemPadding: "4px", badge: "7px", optionIndent: "4mm", logoHeight: profile.paperWidthMm === 58 ? "13mm" : "17mm", qrSize: profile.paperWidthMm === 58 ? "27mm" : "32mm",
  });
  const rasterCss = sharedCss({
    width: `${dots}px`, padding: `${rasterPadding}px`, base: px(10.5), h1: px(18), h2: px(12), h3: px(10), small: px(8), orderId: px(22), gap: px(7.5), rowLabel: `${Math.round(contentDots * (profile.paperWidthMm === 58 ? 0.34 : 0.36))}px`, divider: Math.max(1, Math.round(rasterScale)) + "px", itemPadding: px(4), badge: px(7), optionIndent: px(15), logoHeight: `${Math.round(contentDots * 0.25)}px`, qrSize: `${Math.round(contentDots * (profile.paperWidthMm === 58 ? 0.58 : 0.5))}px`,
  });

  return {
    heightMm,
    rasterHeightDots: Math.ceil(heightMm * profile.dpi / 25.4),
    html: `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${htmlEscape(title)}</title><style>@page { size: ${profile.paperWidthMm}mm ${heightMm}mm; margin: ${pageMarginMm}mm; }${pdfCss}</style></head><body>${body}</body></html>`,
    rasterHtml: `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${htmlEscape(title)}</title><style>${rasterCss}</style></head><body>${body}</body></html>`,
  };
}
