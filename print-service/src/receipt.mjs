const htmlEscape = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function currency(valueMinor, currency) {
  const digits = currency === "JPY" ? 0 : 2;
  return new Intl.NumberFormat(currency === "JPY" ? "ja-JP" : "pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format((Number(valueMinor) || 0) / (currency === "JPY" ? 1 : 100));
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

export function receiptDocument(job, copyType) {
  if (job.type === "test") {
    return documentShell({
      title: "TESTE DE IMPRESSÃO",
      body: `<div class="center"><h1>${htmlEscape(job.test.storeName)}</h1><p>${htmlEscape(job.test.message)}</p><p class="small">${new Date().toLocaleString()}</p></div>`,
      estimatedMm: 95,
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
  const estimatedMm = Math.max(150, 112 + order.items.length * 22 + optionCount * 7 + (order.note ? 24 : 0) + (!operational ? 35 : 0));
  return documentShell({ title, body, estimatedMm });
}

function documentShell({ title, body, estimatedMm }) {
  const height = Math.min(1000, Math.ceil(estimatedMm));
  return {
    heightMm: height,
    html: `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${htmlEscape(title)}</title><style>
      @page { size: 80mm ${height}mm; margin: 3mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; width: 74mm; background: white; color: black; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", "Noto Sans", Arial, sans-serif; font-size: 10.5px; line-height: 1.35; }
      h1 { margin: 0; font-size: 18px; font-weight: 900; }
      h2 { margin: 4px 0 0; font-size: 12px; letter-spacing: .08em; }
      h3 { margin: 0 0 5px; font-size: 10px; letter-spacing: .08em; }
      p { margin: 4px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
      .center { text-align: center; }
      .small { font-size: 8px; }
      .order-id { margin-top: 5px; font-size: 22px; font-weight: 900; letter-spacing: .08em; }
      .divider { border-top: 1px dashed #000; margin: 8px 0; }
      .row { display: grid; grid-template-columns: 25mm 1fr; gap: 2mm; padding: 1px 0; }
      .row b { text-align: right; overflow-wrap: anywhere; }
      .row.strong { font-size: 14px; border-top: 2px solid #000; margin-top: 4px; padding-top: 5px; }
      .item { padding: 4px 0; break-inside: avoid; }
      .item + .item { border-top: 1px dotted #777; }
      .item-main { display: flex; justify-content: space-between; align-items: flex-start; gap: 5px; }
      .item-main > div { min-width: 0; overflow-wrap: anywhere; }
      .badge { border: 1px solid #000; padding: 1px 3px; font-size: 7px; font-weight: 900; white-space: nowrap; }
      .price { font-weight: 900; white-space: nowrap; }
      .options { margin-top: 2px; padding-left: 4mm; font-size: 8px; }
      .warning { margin-top: 2px; padding-left: 4mm; font-size: 8px; font-weight: 900; }
      .thanks { margin-top: 8px; font-weight: 900; }
    </style></head><body>${body}</body></html>`,
  };
}
