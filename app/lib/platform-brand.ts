function cleanPublicValue(value: string | undefined, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

/**
 * Identidade neutra da plataforma compartilhada.
 *
 * A marca comercial exibida nas lojas e eventos deve sempre vir do documento
 * sellers/{sellerId}. Estes valores são usados apenas em telas sem um seller
 * definido, como login, administração e instalação global da PWA.
 */
export const PLATFORM_NAME =
  cleanPublicValue(process.env.NEXT_PUBLIC_PLATFORM_NAME, 80) || "Order Portal";

export const PLATFORM_SHORT_NAME =
  cleanPublicValue(process.env.NEXT_PUBLIC_PLATFORM_SHORT_NAME, 30) || "Orders";

export const PLATFORM_DESCRIPTION =
  cleanPublicValue(process.env.NEXT_PUBLIC_PLATFORM_DESCRIPTION, 180) ||
  "Pedidos, eventos e acompanhamento de produção.";

export const PLATFORM_LOGO_PATH = "/platform-logo.png";
export const DEFAULT_PUBLIC_STORE_NAME = "Loja online";
export const PRINT_SERVICE_NAME = "Order Print Service";
