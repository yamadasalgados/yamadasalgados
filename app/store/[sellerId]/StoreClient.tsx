"use client";

import type {
  ReactNode,
} from "react";

import Link from "next/link";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  collection,
  doc,
  onSnapshot,
} from "firebase/firestore";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Gift,
  ImageIcon,
  Loader2,
  MapPin,
  Mail,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store,
  X,
} from "lucide-react";

import {
  db,
} from "@/app/lib/firebase";

import CustomerAccountBar from "@/app/_components/CustomerAccountBar";
import useCustomerSession from "@/app/hooks/useCustomerSession";
import {
  readLocalDraft,
  readStoredCustomerProfile,
  removeLocalDraft,
  storeDraftKey,
  writeLocalDraft,
  writeStoredCustomerProfile,
} from "@/app/lib/customer-storage";

import {
  createPublicOrder,
  getPublicOrderErrorCode,
} from "@/app/lib/public-order-client";

import {
  accessIsActive,
} from "@/app/lib/access-control";

import {
  useI18n,
} from "@/app/lib/i18n";

import {
  formatMoneyMajor,
  formatMoneyMinor,
  minorToMajor,
} from "@/app/lib/money";
import {
  normalizeInventory,
  normalizeProductPriceMajor,
  normalizeProductPriceMinor,
  resolveLocalizedProductText,
} from "@/app/lib/product-schema";
import {
  evaluateOfferForCart,
  normalizeOffer,
  offerIsCurrentlyActive,
  resolveLocalizedOfferText,
  type OfferDoc,
  type OfferEvaluation,
} from "@/app/lib/offer-schema";
import {
  DEFAULT_SELLER_SHIPPING_SETTINGS,
  evaluatePostalShipping,
  formatWeightGrams,
  normalizeProductShipping,
  normalizeSellerShippingSettings,
  type ProductShipping,
  type SellerShippingSettings,
} from "@/app/lib/shipping-schema";
import {
  isSupportedCurrency,
  type RegionalLocale,
  type SupportedCurrency,
} from "@/app/types/regional";

type Language =
  | "pt"
  | "en"
  | "ja";

type ProductAvailabilityStatus =
  | "active"
  | "made_to_order";

type CheckoutStep =
  | "products"
  | "customer"
  | "delivery"
  | "success";

type DeliveryMode =
  | "pickup"
  | "delivery"
  | "postal"
  | "none";

type StoreProfile = {
  name: string;
  description: string;
  logoUrl: string;
  bannerUrl: string;
  pickupNote: string;
  currency: SupportedCurrency;
  regionalLocale: RegionalLocale;
  available: boolean;
};

type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  imageUrl: string;
  extraImageUrls: string[];
  price: number;
  priceMinor: number;
  availabilityStatus: ProductAvailabilityStatus;
  stock?: number;
  stockField?:
    | "stockQty"
    | "stock"
    | "inventory"
    | "quantity";
  shipping: ProductShipping;
};

type CartItem = Product & {
  qty: number;
  subtotal: number;
};

type CustomerForm = {
  name: string;
  phone: string;
  email: string;
};

type DeliveryForm = {
  mode: DeliveryMode;
  date: string;
  time: string;
  address: string;
  locationLink: string;
  note: string;
  recipientName: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
  addressLine2: string;
};

function storedProfileFromCheckout(customer: CustomerForm, delivery: DeliveryForm) {
  return {
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    address: {
      deliveryAddress: delivery.address,
      locationLink: delivery.locationLink,
      recipientName: delivery.recipientName || customer.name,
      postalCode: delivery.postalCode,
      prefecture: delivery.prefecture,
      city: delivery.city,
      addressLine1: delivery.addressLine1,
      addressLine2: delivery.addressLine2,
    },
  };
}

const TEXT = {
  pt: {
    loading: "Carregando loja...",
    storeUnavailable:
      "Loja indisponível",
    storeUnavailableBody:
      "Não foi possível carregar esta loja. Verifique o link ou tente novamente.",
    retry: "Tentar novamente",
    search: "Buscar produtos",
    all: "Todos",
    emptyProducts:
      "Nenhum produto disponível.",
    emptySearch:
      "Nenhum produto corresponde à busca.",
    outOfStock: "Esgotado — novas vendas estão bloqueadas.",
    lastUnits: "Últimas {count} unidades — garanta a sua.",
    stock: "Estoque",
    add: "Adicionar",
    cart: "Carrinho",
    emptyCart:
      "Seu carrinho está vazio.",
    item: "item",
    items: "itens",
    total: "Total",
    continue: "Continuar",
    back: "Voltar",
    productsStep: "Produtos",
    customerStep: "Cliente",
    deliveryStep: "Entrega",
    customerTitle: "Seus dados",
    customerHelp:
      "Informe os dados para identificar o pedido.",
    name: "Nome",
    phone: "Telefone",
    email: "E-mail (opcional)",
    requiredName:
      "Informe seu nome.",
    requiredPhone:
      "Informe seu telefone.",
    deliveryTitle:
      "Entrega e horário",
    deliveryHelp:
      "Escolha como deseja receber o pedido.",
    pickup: "Retirada",
    delivery: "Entrega",
    arrange: "A combinar",
    postal: "Correio",
    postalHelp: "Receba o pedido no endereço informado.",
    postalUnavailable: "O correio não está disponível para os produtos atuais.",
    postalProductBlocked: "Não pode ser enviado: {products}",
    postalWeightMissing: "Há produto sem peso cadastrado para calcular o frete.",
    postalWeightExceeded: "O peso excede as faixas de frete configuradas.",
    postalRequired: "Preencha os dados obrigatórios do endereço postal.",
    recipientName: "Nome do destinatário",
    postalCode: "Código postal / CEP",
    prefecture: "Província / Estado",
    city: "Cidade",
    addressLine1: "Endereço",
    addressLine2: "Complemento (opcional)",
    shippingTitle: "Envio por correio",
    shippingCollect: "Frete a cobrar no recebimento",
    shippingArrange: "Frete a combinar com o seller",
    shippingCalculated: "Frete calculado",
    shippingFee: "Frete",
    totalWeight: "Peso estimado",
    postalInstructions: "Instruções de envio",
    date: "Data",
    time: "Horário",
    address: "Endereço",
    locationLink:
      "Link da localização (opcional)",
    note:
      "Observações (opcional)",
    placeOrder:
      "Finalizar pedido",
    sending:
      "Enviando pedido...",
    orderError:
      "Não foi possível enviar o pedido. Verifique a conexão e tente novamente.",
    permissionError:
      "A criação do pedido foi bloqueada pelas permissões do Firestore.",
    stockError:
      "Um dos produtos ficou sem estoque ou foi alterado. Revise o carrinho.",
    successTitle:
      "Pedido enviado!",
    successBody:
      "Seu pedido foi registrado e enviado ao vendedor.",
    orderNumber:
      "Número do pedido",
    newOrder:
      "Fazer novo pedido",
    trackOrder: "Acompanhar pedido",
    myOrders: "Meus pedidos",
    visitStore: "Voltar à loja",
    registeredOrderHelp: "Este pedido foi salvo na sua conta e continuará disponível em Meus pedidos.",
    guestOrderHelp: "Cadastre-se nas próximas compras para acompanhar seus pedidos pelo aplicativo.",
    closeCart:
      "Fechar carrinho",
    remove: "Remover",
    quantity: "Quantidade",
    pickupNote: "Informação de retirada",
    productDetails: "Detalhes do produto",
    close: "Fechar",
    chooseCategory:
      "Escolha uma categoria",
    chooseCategoryHelp:
      "Vá direto aos produtos que você procura.",
    backToCategories:
      "Voltar às categorias",
    categoryProducts:
      "produtos",
    categoryProduct:
      "produto",
    searchResults:
      "Resultados da busca",
    offersTitle: "Ofertas e kits",
    offersHelp:
      "Escolha uma oferta e combine os produtos participantes.",
    useOffer: "Usar oferta",
    selectedOffer: "Oferta selecionada",
    removeOffer: "Remover oferta",
    requiredOfferQuantity: "Quantidade do kit",
    offerProducts: "Produtos participantes",
    offerRemaining: "Faltam {count} itens para ativar",
    offerReady: "Oferta aplicada ao carrinho",
    offerBundles: "kits aplicados",
    offerSavings: "Você economiza",
    offerUnavailable:
      "A oferta selecionada não está mais disponível.",
    subtotal: "Subtotal",
    discount: "Desconto",
    availableProductsTitle: "Produtos disponíveis",
    availableProductsHelp: "Itens para compra normal conforme o estoque atual.",
    madeToOrderTitle: "Itens sob encomenda",
    madeToOrderHelp: "Reserve com antecedência para garantir a produção e a entrega.",
    madeToOrderBadge: "Sob encomenda",
    madeToOrderNotice: "Produzido mediante reserva antecipada",
  },

  en: {
    loading: "Loading store...",
    storeUnavailable:
      "Store unavailable",
    storeUnavailableBody:
      "This store could not be loaded. Check the link or try again.",
    retry: "Try again",
    search: "Search products",
    all: "All",
    emptyProducts:
      "No products are available.",
    emptySearch:
      "No products match your search.",
    outOfStock: "Sold out — new purchases are blocked.",
    lastUnits: "Only {count} left — get yours now.",
    stock: "Stock",
    add: "Add",
    cart: "Cart",
    emptyCart:
      "Your cart is empty.",
    item: "item",
    items: "items",
    total: "Total",
    continue: "Continue",
    back: "Back",
    productsStep: "Products",
    customerStep: "Customer",
    deliveryStep: "Delivery",
    customerTitle:
      "Your details",
    customerHelp:
      "Enter the information used to identify the order.",
    name: "Name",
    phone: "Phone",
    email: "Email (optional)",
    requiredName:
      "Enter your name.",
    requiredPhone:
      "Enter your phone number.",
    deliveryTitle:
      "Delivery and time",
    deliveryHelp:
      "Choose how you would like to receive the order.",
    pickup: "Pickup",
    delivery: "Delivery",
    arrange: "To be arranged",
    postal: "Postal shipping",
    postalHelp: "Receive the order at the address provided.",
    postalUnavailable: "Postal shipping is not available for the current products.",
    postalProductBlocked: "Cannot be shipped: {products}",
    postalWeightMissing: "A product has no shipping weight for freight calculation.",
    postalWeightExceeded: "The order exceeds the configured shipping weight bands.",
    postalRequired: "Complete the required postal address fields.",
    recipientName: "Recipient name",
    postalCode: "Postal code",
    prefecture: "State / Prefecture",
    city: "City",
    addressLine1: "Street address",
    addressLine2: "Address details (optional)",
    shippingTitle: "Postal shipping",
    shippingCollect: "Shipping paid on delivery",
    shippingArrange: "Shipping arranged with the seller",
    shippingCalculated: "Calculated shipping",
    shippingFee: "Shipping",
    totalWeight: "Estimated weight",
    postalInstructions: "Shipping instructions",
    date: "Date",
    time: "Time",
    address: "Address",
    locationLink:
      "Location link (optional)",
    note: "Notes (optional)",
    placeOrder: "Place order",
    sending: "Sending order...",
    orderError:
      "The order could not be sent. Check your connection and try again.",
    permissionError:
      "Firestore permissions blocked the order creation.",
    stockError:
      "A product is no longer available or its stock changed. Review the cart.",
    successTitle: "Order sent!",
    successBody:
      "Your order was registered and sent to the seller.",
    orderNumber: "Order number",
    newOrder:
      "Create another order",
    trackOrder: "Track order",
    myOrders: "My orders",
    visitStore: "Back to store",
    registeredOrderHelp: "This order was saved to your account and will remain available under My orders.",
    guestOrderHelp: "Register on future purchases to track orders in the app.",
    closeCart: "Close cart",
    remove: "Remove",
    quantity: "Quantity",
    pickupNote: "Pickup information",
    productDetails: "Product details",
    close: "Close",
    chooseCategory:
      "Choose a category",
    chooseCategoryHelp:
      "Go directly to the products you are looking for.",
    backToCategories:
      "Back to categories",
    categoryProducts:
      "products",
    categoryProduct:
      "product",
    searchResults:
      "Search results",
    offersTitle: "Offers and kits",
    offersHelp:
      "Select an offer and combine eligible products.",
    useOffer: "Use offer",
    selectedOffer: "Selected offer",
    removeOffer: "Remove offer",
    requiredOfferQuantity: "Bundle quantity",
    offerProducts: "Eligible products",
    offerRemaining: "Add {count} more items to activate",
    offerReady: "Offer applied to cart",
    offerBundles: "bundles applied",
    offerSavings: "You save",
    offerUnavailable:
      "The selected offer is no longer available.",
    subtotal: "Subtotal",
    discount: "Discount",
    availableProductsTitle: "Available products",
    availableProductsHelp: "Items available for normal purchase based on current stock.",
    madeToOrderTitle: "Made-to-order items",
    madeToOrderHelp: "Order in advance to secure production and delivery.",
    madeToOrderBadge: "Made to order",
    madeToOrderNotice: "Prepared by advance reservation",
  },

  ja: {
    loading:
      "店舗を読み込んでいます...",
    storeUnavailable:
      "店舗を表示できません",
    storeUnavailableBody:
      "店舗を読み込めませんでした。リンクを確認するか、もう一度お試しください。",
    retry: "再試行",
    search: "商品を検索",
    all: "すべて",
    emptyProducts:
      "販売中の商品はありません。",
    emptySearch:
      "検索条件に一致する商品はありません。",
    outOfStock: "売り切れ — 新しい注文は受け付けていません。",
    lastUnits: "残り{count}点 — お早めにご注文ください。",
    stock: "在庫",
    add: "追加",
    cart: "カート",
    emptyCart:
      "カートは空です。",
    item: "点",
    items: "点",
    total: "合計",
    continue: "次へ",
    back: "戻る",
    productsStep: "商品",
    customerStep: "お客様",
    deliveryStep: "受取方法",
    customerTitle: "お客様情報",
    customerHelp:
      "注文を確認するための情報を入力してください。",
    name: "名前",
    phone: "電話番号",
    email: "メール（任意）",
    requiredName:
      "名前を入力してください。",
    requiredPhone:
      "電話番号を入力してください。",
    deliveryTitle:
      "受取方法と時間",
    deliveryHelp:
      "注文の受取方法を選択してください。",
    pickup: "受取",
    delivery: "配達",
    arrange: "要相談",
    postal: "郵送",
    postalHelp: "入力した住所へ商品を発送します。",
    postalUnavailable: "現在の商品は郵送できません。",
    postalProductBlocked: "郵送対象外: {products}",
    postalWeightMissing: "送料計算に必要な商品重量が未登録です。",
    postalWeightExceeded: "注文重量が設定された送料区分を超えています。",
    postalRequired: "郵送先の必須項目を入力してください。",
    recipientName: "受取人名",
    postalCode: "郵便番号",
    prefecture: "都道府県 / 州",
    city: "市区町村",
    addressLine1: "住所",
    addressLine2: "建物名・部屋番号（任意）",
    shippingTitle: "郵送",
    shippingCollect: "送料は着払い",
    shippingArrange: "送料は販売者と相談",
    shippingCalculated: "計算済み送料",
    shippingFee: "送料",
    totalWeight: "推定重量",
    postalInstructions: "発送案内",
    date: "日付",
    time: "時間",
    address: "住所",
    locationLink:
      "位置情報リンク（任意）",
    note: "備考（任意）",
    placeOrder: "注文を確定",
    sending:
      "注文を送信しています...",
    orderError:
      "注文を送信できませんでした。接続を確認して、もう一度お試しください。",
    permissionError:
      "Firestore の権限により注文の作成がブロックされました。",
    stockError:
      "商品の在庫または内容が変更されました。カートを確認してください。",
    successTitle:
      "注文を送信しました！",
    successBody:
      "注文が登録され、販売者に送信されました。",
    orderNumber: "注文番号",
    newOrder:
      "新しい注文を作成",
    trackOrder: "注文を確認",
    myOrders: "注文履歴",
    visitStore: "ショップに戻る",
    registeredOrderHelp: "この注文はアカウントに保存され、注文履歴からいつでも確認できます。",
    guestOrderHelp: "次回はアカウント登録すると、アプリで注文状況を確認できます。",
    closeCart:
      "カートを閉じる",
    remove: "削除",
    quantity: "数量",
    pickupNote: "受取案内",
    productDetails: "商品詳細",
    close: "閉じる",
    chooseCategory:
      "カテゴリーを選択",
    chooseCategoryHelp:
      "お探しの商品カテゴリーからすぐに確認できます。",
    backToCategories:
      "カテゴリーに戻る",
    categoryProducts:
      "商品",
    categoryProduct:
      "商品",
    searchResults:
      "検索結果",
    offersTitle: "オファーとセット",
    offersHelp:
      "オファーを選び、対象商品を組み合わせてください。",
    useOffer: "オファーを使う",
    selectedOffer: "選択中のオファー",
    removeOffer: "オファーを外す",
    requiredOfferQuantity: "セット数量",
    offerProducts: "対象商品",
    offerRemaining: "あと{count}点で適用されます",
    offerReady: "オファーがカートに適用されました",
    offerBundles: "セット適用",
    offerSavings: "割引額",
    offerUnavailable:
      "選択したオファーは利用できません。",
    subtotal: "小計",
    discount: "割引",
    availableProductsTitle: "通常商品",
    availableProductsHelp: "現在の在庫から通常購入できる商品です。",
    madeToOrderTitle: "受注生産の商品",
    madeToOrderHelp: "製造と受け取りを確実にするため、事前にご予約ください。",
    madeToOrderBadge: "受注生産",
    madeToOrderNotice: "事前予約後に製造します",
  },
} as const;

function asRecord(
  value: unknown,
): Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
    ? value as Record<
        string,
        unknown
      >
    : {};
}

function asString(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function asNumber(
  value: unknown,
): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(
      value.replace(",", "."),
    );

    return Number.isFinite(parsed)
      ? parsed
      : 0;
  }

  return 0;
}

function optionalFiniteNumber(
  value: unknown,
): number | undefined {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(
      value.replace(",", "."),
    );

    if (
      Number.isFinite(parsed)
    ) {
      return parsed;
    }
  }

  return undefined;
}

function normalizeImageList(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(asString)
    .filter(Boolean);
}

function normalizeProduct(
  id: string,
  rawValue: unknown,
  language: Language,
  currency: SupportedCurrency,
): Product | null {
  const raw =
    asRecord(rawValue);

  const status =
    asString(raw.status)
      .toLowerCase();

  const availabilityStatus: ProductAvailabilityStatus =
    status === "made_to_order" || status === "preorder"
      ? "made_to_order"
      : "active";

  if (
    status === "inactive" ||
    status === "archived" ||
    status === "cancelled" ||
    raw.active === false
  ) {
    return null;
  }

  const localized = resolveLocalizedProductText(
    raw.content,
    language,
    language,
    asString(raw.name) || asString(raw.title) || asString(raw.productName),
    asString(raw.description),
  );
  const name = localized.name;

  if (!name) {
    return null;
  }

  const priceMinor = normalizeProductPriceMinor(raw, currency);
  const price = normalizeProductPriceMajor(raw, currency);

  let stock:
    | number
    | undefined;

  let stockField:
    | Product["stockField"];

  /*
   * Esquema atual:
   * - sellPrice: preço de venda
   * - stockQty: estoque disponível
   *
   * Campos antigos ficam como fallback para documentos legados.
   * stockQty tem prioridade mesmo quando vale 0.
   */
  const v2Inventory = normalizeInventory(raw.inventory, raw.stockQty ?? raw.stock, raw.lowStockThreshold);
  if (raw.inventory && typeof raw.inventory === "object") {
    stock = v2Inventory.tracked ? v2Inventory.available : undefined;
    stockField = "inventory";
  }

  const stockCandidates: Array<{
    field:
      NonNullable<
        Product["stockField"]
      >;
    value: unknown;
  }> = [
    {
      field: "stockQty",
      value: raw.stockQty,
    },
    {
      field: "stock",
      value: raw.stock,
    },
    {
      field: "inventory",
      value: raw.inventory,
    },
    {
      field: "quantity",
      value: raw.quantity,
    },
  ];

  for (
    const candidate
    of stockCandidates
  ) {
    if (stockField === "inventory") break;
    const normalized =
      optionalFiniteNumber(
        candidate.value,
      );

    if (
      normalized !== undefined
    ) {
      stock =
        Math.max(
          0,
          normalized,
        );
      stockField =
        candidate.field;
      break;
    }
  }

  if (availabilityStatus === "made_to_order") {
    stock = undefined;
    stockField = undefined;
  }

  const imageUrl =
    asString(raw.imageUrl) ||
    asString(raw.image) ||
    asString(raw.photoUrl);

  const extraImageUrls =
    normalizeImageList(
      raw.extraImageUrls ??
        raw.images,
    ).filter(
      (image) =>
        image !== imageUrl,
    );

  return {
    id,
    name,
    description:
      asString(
        raw.description,
      ) ||
      asString(raw.details),
    category:
      asString(raw.category) ||
      asString(
        raw.categoryName,
      ) ||
      "Outros",
    imageUrl,
    extraImageUrls,
    price,
    priceMinor,
    availabilityStatus,
    stock,
    stockField,
    shipping: normalizeProductShipping(
      raw.shipping,
      raw.postalEligible,
      raw.shippingWeightGrams,
    ),
  };
}

function normalizeStoreProfile(
  rawValue: unknown,
): StoreProfile {
  const raw =
    asRecord(rawValue);
  const regional =
    asRecord(raw.regional);
  const currencyCandidate =
    regional.currency ??
    raw.currency;
  const localeCandidate =
    regional.locale ??
    raw.regionalLocale;
  const currency =
    isSupportedCurrency(
      currencyCandidate,
    )
      ? currencyCandidate
      : "JPY";
  const regionalLocale:
    RegionalLocale =
    localeCandidate === "pt-BR" ||
    localeCandidate === "en-US" ||
    localeCandidate === "ja-JP"
      ? localeCandidate
      : currency === "BRL"
        ? "pt-BR"
        : currency === "USD"
          ? "en-US"
          : "ja-JP";

  return {
    name:
      asString(raw.storeName) ||
      asString(
        raw.businessName,
      ) ||
      asString(raw.name) ||
      "Yamada",
    description:
      asString(
        raw.storeDescription,
      ) ||
      asString(
        raw.description,
      ),
    logoUrl:
      asString(raw.logoUrl) ||
      asString(raw.photoUrl),
    bannerUrl:
      asString(
        raw.bannerUrl,
      ) ||
      asString(
        raw.coverUrl,
      ),
    pickupNote:
      asString(
        raw.pickupNote,
      ) ||
      asString(
        raw.storePickupNote,
      ),
    currency,
    regionalLocale,
    available:
      accessIsActive(raw),
  };
}

function formatCurrency(
  value: number,
  locale: string,
  currency: SupportedCurrency,
): string {
  return formatMoneyMajor(
    value,
    currency,
    locale,
  );
}

export default function StoreClient({
  sellerId,
}: {
  sellerId: string;
}) {
  const {
    lang,
  } = useI18n();

  const language: Language =
    lang === "en" ||
    lang === "ja"
      ? lang
      : "pt";

  const locale =
    language === "ja"
      ? "ja-JP"
      : language === "en"
        ? "en-US"
        : "pt-BR";

  const text =
    TEXT[language];

  const customerSession =
    useCustomerSession();
  const customerDraftReadyRef =
    useRef(false);
  const customerDraftKey =
    useMemo(
      () => storeDraftKey(sellerId),
      [sellerId],
    );

  const [storeProfile, setStoreProfile] =
    useState<StoreProfile>({
      name: "Yamada",
      description: "",
      logoUrl: "",
      bannerUrl: "",
      pickupNote: "",
      currency: "JPY",
      regionalLocale: "ja-JP",
      available: false,
    });

  const [shippingSettings, setShippingSettings] =
    useState<SellerShippingSettings>(DEFAULT_SELLER_SHIPPING_SETTINGS);

  const [products, setProducts] =
    useState<Product[]>([]);

  const [offers, setOffers] =
    useState<OfferDoc[]>([]);

  const [selectedOfferId, setSelectedOfferId] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [loadError, setLoadError] =
    useState("");

  const [reloadKey, setReloadKey] =
    useState(0);

  const [search, setSearch] =
    useState("");

  const [
    selectedCategory,
    setSelectedCategory,
  ] = useState<string | null>(
    null,
  );

  const [cart, setCart] =
    useState<Record<string, number>>(
      {},
    );

  const [cartOpen, setCartOpen] =
    useState(false);

  const [step, setStep] =
    useState<CheckoutStep>(
      "products",
    );

  const [customer, setCustomer] =
    useState<CustomerForm>({
      name: "",
      phone: "",
      email: "",
    });

  const [delivery, setDelivery] =
    useState<DeliveryForm>({
      mode: "pickup",
      date: "",
      time: "",
      address: "",
      locationLink: "",
      note: "",
      recipientName: "",
      postalCode: "",
      prefecture: "",
      city: "",
      addressLine1: "",
      addressLine2: "",
    });

  const [formError, setFormError] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);

  const [createdOrderId, setCreatedOrderId] =
    useState("");

  const [createdCustomerOrderRefId, setCreatedCustomerOrderRefId] =
    useState("");

  const [
    selectedProduct,
    setSelectedProduct,
  ] = useState<Product | null>(
    null,
  );

  const [
    selectedImageIndex,
    setSelectedImageIndex,
  ] = useState(0);

  useEffect(() => {
    customerDraftReadyRef.current = false;
    if (!sellerId.trim()) return;

    const storedProfile =
      readStoredCustomerProfile();
    const draft =
      readLocalDraft<{
        cart?: Record<string, number>;
        customer?: Partial<CustomerForm>;
        delivery?: Partial<DeliveryForm>;
        selectedOfferId?: string;
        step?: CheckoutStep;
      }>(customerDraftKey);

    setCustomer((current) => ({
      ...current,
      name: draft?.customer?.name || storedProfile.name || current.name,
      phone: draft?.customer?.phone || storedProfile.phone || current.phone,
      email: draft?.customer?.email || storedProfile.email || current.email,
    }));

    setDelivery((current) => ({
      ...current,
      ...(draft?.delivery && typeof draft.delivery === "object" ? draft.delivery : {}),
      address: draft?.delivery?.address || storedProfile.address.deliveryAddress || current.address,
      locationLink: draft?.delivery?.locationLink || storedProfile.address.locationLink || current.locationLink,
      recipientName:
        draft?.delivery?.recipientName ||
        storedProfile.address.recipientName ||
        storedProfile.name ||
        current.recipientName,
      postalCode: draft?.delivery?.postalCode || storedProfile.address.postalCode || current.postalCode,
      prefecture: draft?.delivery?.prefecture || storedProfile.address.prefecture || current.prefecture,
      city: draft?.delivery?.city || storedProfile.address.city || current.city,
      addressLine1: draft?.delivery?.addressLine1 || storedProfile.address.addressLine1 || current.addressLine1,
      addressLine2: draft?.delivery?.addressLine2 || storedProfile.address.addressLine2 || current.addressLine2,
    }));

    if (draft?.cart && typeof draft.cart === "object") {
      setCart(draft.cart);
    }
    if (typeof draft?.selectedOfferId === "string") {
      setSelectedOfferId(draft.selectedOfferId);
    }
    if (
      draft?.step === "customer" ||
      draft?.step === "delivery"
    ) {
      setStep(draft.step);
    }

    customerDraftReadyRef.current = true;
  }, [customerDraftKey, sellerId]);

  useEffect(() => {
    const profile = customerSession.profile;
    if (!profile) return;

    setCustomer((current) => ({
      name: current.name || profile.name,
      phone: current.phone || profile.phone,
      email: current.email || profile.email,
    }));
    setDelivery((current) => ({
      ...current,
      address: current.address || profile.address.deliveryAddress,
      locationLink: current.locationLink || profile.address.locationLink,
      recipientName: current.recipientName || profile.address.recipientName || profile.name,
      postalCode: current.postalCode || profile.address.postalCode,
      prefecture: current.prefecture || profile.address.prefecture,
      city: current.city || profile.address.city,
      addressLine1: current.addressLine1 || profile.address.addressLine1,
      addressLine2: current.addressLine2 || profile.address.addressLine2,
    }));
  }, [customerSession.profile]);

  useEffect(() => {
    if (!customerDraftReadyRef.current || step === "success") return;

    const timer = window.setTimeout(() => {
      writeStoredCustomerProfile(storedProfileFromCheckout(customer, delivery));
      writeLocalDraft(customerDraftKey, {
        cart,
        customer,
        delivery,
        selectedOfferId,
        step,
        updatedAt: Date.now(),
      });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [
    cart,
    customer,
    customerDraftKey,
    delivery,
    selectedOfferId,
    step,
  ]);

  useEffect(() => {
    if (loading) return;

    const productMap = new Map(products.map((product) => [product.id, product]));
    setCart((current) => {
      let changed = false;
      const next: Record<string, number> = {};

      for (const [productId, rawQuantity] of Object.entries(current)) {
        const product = productMap.get(productId);
        if (!product) {
          changed = true;
          continue;
        }

        const quantity = Math.max(0, Math.floor(Number(rawQuantity) || 0));
        const safeQuantity =
          product.availabilityStatus === "made_to_order" ||
          typeof product.stock !== "number"
            ? quantity
            : Math.min(quantity, Math.max(0, Math.floor(product.stock)));

        if (safeQuantity > 0) next[productId] = safeQuantity;
        if (safeQuantity !== rawQuantity) changed = true;
      }

      return changed ? next : current;
    });
  }, [loading, products]);

  useEffect(() => {
    if (!sellerId.trim()) {
      setLoading(false);
      setLoadError(
        text.storeUnavailableBody,
      );
      return;
    }

    setLoading(true);
    setLoadError("");

    let sellerResolved = false;
    let productsResolved = false;
    let offersResolved = false;
    let shippingResolved = false;

    const finishLoading = () => {
      if (
        sellerResolved &&
        productsResolved &&
        offersResolved &&
        shippingResolved
      ) {
        setLoading(false);
      }
    };

    const sellerReference =
      doc(
        db,
        "sellers",
        sellerId,
      );

    const productsReference =
      collection(
        db,
        "sellers",
        sellerId,
        "products",
      );

    const offersReference =
      collection(
        db,
        "sellers",
        sellerId,
        "offers",
      );

    const shippingReference = doc(
      db,
      "sellers",
      sellerId,
      "settings",
      "shipping",
    );

    const unsubscribeSeller =
      onSnapshot(
        sellerReference,
        (snapshot) => {
          sellerResolved = true;

          if (!snapshot.exists()) {
            setLoadError(
              text.storeUnavailableBody,
            );
            finishLoading();
            return;
          }

          const nextProfile =
            normalizeStoreProfile(
              snapshot.data(),
            );

          setStoreProfile(
            nextProfile,
          );

          setLoadError(
            nextProfile.available
              ? ""
              : text.storeUnavailableBody,
          );

          finishLoading();
        },
        (error) => {
          console.warn(
            "[StoreClient] Falha ao carregar dados da loja:",
            error,
          );
          sellerResolved = true;
          setLoadError(
            text.storeUnavailableBody,
          );
          finishLoading();
        },
      );

    const unsubscribeProducts =
      onSnapshot(
        productsReference,
        (snapshot) => {
          const loadedProducts =
            snapshot.docs
              .map((document) =>
                normalizeProduct(
                  document.id,
                  document.data(),
                  language,
                  storeProfile.currency,
                ),
              )
              .filter(
                (
                  product,
                ): product is Product =>
                  product !== null,
              )
              .sort((a, b) =>
                a.name.localeCompare(
                  b.name,
                  locale,
                ),
              );

          setProducts(
            loadedProducts,
          );

          productsResolved = true;
          finishLoading();
        },
        (error) => {
          console.error(
            "[StoreClient] Falha ao carregar produtos:",
            error,
          );

          productsResolved = true;
          setLoadError(
            text.storeUnavailableBody,
          );
          finishLoading();
        },
      );

    const unsubscribeOffers =
      onSnapshot(
        offersReference,
        (snapshot) => {
          const now = new Date();
          const loadedOffers =
            snapshot.docs
              .map((document) =>
                normalizeOffer(
                  document.id,
                  document.data(),
                  storeProfile.currency,
                ),
              )
              .filter(
                (
                  offer,
                ): offer is OfferDoc =>
                  offer !== null &&
                  offerIsCurrentlyActive(
                    offer,
                    now,
                  ),
              );

          setOffers(loadedOffers);
          setSelectedOfferId((current) =>
            current &&
            !loadedOffers.some(
              (offer) =>
                offer.id === current,
            )
              ? ""
              : current,
          );

          offersResolved = true;
          finishLoading();
        },
        (error) => {
          console.warn(
            "[StoreClient] Falha ao carregar ofertas:",
            error,
          );
          setOffers([]);
          offersResolved = true;
          finishLoading();
        },
      );

    const unsubscribeShipping = onSnapshot(
      shippingReference,
      (snapshot) => {
        setShippingSettings(
          normalizeSellerShippingSettings(
            snapshot.exists()
              ? snapshot.data()
              : DEFAULT_SELLER_SHIPPING_SETTINGS,
          ),
        );
        shippingResolved = true;
        finishLoading();
      },
      (error) => {
        console.warn(
          "[StoreClient] Falha ao carregar configuração de correio:",
          error,
        );
        setShippingSettings(DEFAULT_SELLER_SHIPPING_SETTINGS);
        shippingResolved = true;
        finishLoading();
      },
    );

    return () => {
      unsubscribeSeller();
      unsubscribeProducts();
      unsubscribeOffers();
      unsubscribeShipping();
    };
  }, [
    language,
    locale,
    reloadKey,
    sellerId,
    storeProfile.currency,
    text.storeUnavailableBody,
  ]);


  const selectedOffer =
    useMemo(
      () =>
        offers.find(
          (offer) =>
            offer.id === selectedOfferId,
        ) ?? null,
      [offers, selectedOfferId],
    );

const categorySummaries =
  useMemo(() => {
    const grouped =
      new Map<
        string,
        {
          name: string;
          count: number;
          imageUrl: string;
          availableCount: number;
        }
      >();

    for (
      const product
      of products
    ) {
      const current =
        grouped.get(
          product.category,
        );

      const available =
        product.availabilityStatus === "made_to_order" ||
        typeof product.stock !== "number" ||
        product.stock > 0;

      if (current) {
        current.count += 1;

        if (available) {
          current.availableCount +=
            1;
        }

        if (
          !current.imageUrl &&
          product.imageUrl
        ) {
          current.imageUrl =
            product.imageUrl;
        }

        continue;
      }

      grouped.set(
        product.category,
        {
          name:
            product.category,
          count: 1,
          imageUrl:
            product.imageUrl,
          availableCount:
            available ? 1 : 0,
        },
      );
    }

    return Array.from(
      grouped.values(),
    ).sort((a, b) =>
      a.name.localeCompare(
        b.name,
        locale,
      ),
    );
  }, [
    locale,
    products,
  ]);

const visibleProducts =
  useMemo(() => {
    const normalizedSearch =
      search
        .trim()
        .toLocaleLowerCase(
          locale,
        );

    return products.filter(
      (product) => {
        if (
          selectedCategory &&
          product.category !==
            selectedCategory
        ) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        return [
          product.name,
          product.description,
          product.category,
        ]
          .join(" ")
          .toLocaleLowerCase(
            locale,
          )
          .includes(
            normalizedSearch,
          );
      },
    );
  }, [
    locale,
    products,
    search,
    selectedCategory,
  ]);

const showingProducts =
  selectedCategory !== null ||
  search.trim().length > 0;

  const normalProducts = useMemo(
    () => products.filter((product) => product.availabilityStatus === "active"),
    [products],
  );

  const madeToOrderProducts = useMemo(
    () => products.filter((product) => product.availabilityStatus === "made_to_order"),
    [products],
  );

  const visibleNormalProducts = useMemo(
    () => visibleProducts.filter((product) => product.availabilityStatus === "active"),
    [visibleProducts],
  );

  const visibleMadeToOrderProducts = useMemo(
    () => visibleProducts.filter((product) => product.availabilityStatus === "made_to_order"),
    [visibleProducts],
  );

  const cartItems =
    useMemo<CartItem[]>(() => {
      return products
        .map((product) => {
          const qty =
            cart[product.id] ??
            0;

          if (qty <= 0) {
            return null;
          }

          return {
            ...product,
            qty,
            subtotal:
              qty * product.price,
          };
        })
        .filter(
          (
            item,
          ): item is CartItem =>
            item !== null,
        );
    }, [
      cart,
      products,
    ]);

  const totalItems =
    useMemo(
      () =>
        cartItems.reduce(
          (sum, item) =>
            sum + item.qty,
          0,
        ),
      [cartItems],
    );

  const subtotal =
    useMemo(
      () =>
        cartItems.reduce(
          (sum, item) =>
            sum +
            item.subtotal,
          0,
        ),
      [cartItems],
    );

  const selectedOfferEvaluation:
    OfferEvaluation | null =
    useMemo(() => {
      if (!selectedOffer) {
        return null;
      }

      return evaluateOfferForCart(
        selectedOffer,
        cartItems.map((item) => ({
          productId: item.id,
          quantity: item.qty,
          priceMinor: item.priceMinor,
        })),
      );
    }, [cartItems, selectedOffer]);

  const discountMinor =
    selectedOfferEvaluation?.applicable
      ? selectedOfferEvaluation
          .discountAmountMinor
      : 0;

  const discount = minorToMajor(
    discountMinor,
    storeProfile.currency,
  );

  const productsTotal = Math.max(
    0,
    subtotal - discount,
  );

  const postalBlockedItems = useMemo(
    () =>
      cartItems.filter(
        (item) => !item.shipping.postalEligible,
      ),
    [cartItems],
  );

  const postalEvaluation = useMemo(
    () =>
      evaluatePostalShipping({
        settings: shippingSettings,
        products: cartItems.map((item) => ({
          quantity: item.qty,
          shipping: item.shipping,
        })),
      }),
    [cartItems, shippingSettings],
  );

  const shippingFeeMinor =
    delivery.mode === "postal" && postalEvaluation.available
      ? postalEvaluation.shippingFeeMinor ?? 0
      : 0;

  const shippingFee = minorToMajor(
    shippingFeeMinor,
    storeProfile.currency,
  );

  const total = Math.max(
    0,
    productsTotal + shippingFee,
  );

  const postalUnavailableMessage = useMemo(() => {
    if (postalEvaluation.available) return "";

    if (postalEvaluation.reason === "product_not_eligible") {
      const names = postalBlockedItems.map((item) => item.name).join(", ");
      return names
        ? text.postalProductBlocked.replace("{products}", names)
        : text.postalUnavailable;
    }

    if (postalEvaluation.reason === "weight_missing") {
      return text.postalWeightMissing;
    }

    if (postalEvaluation.reason === "weight_limit_exceeded") {
      return text.postalWeightExceeded;
    }

    return text.postalUnavailable;
  }, [postalBlockedItems, postalEvaluation, text]);

  const setQuantity =
    useCallback(
      (
        product: Product,
        requestedQty: number,
      ) => {
        const requestedSafeQty = Math.max(0, Math.floor(requestedQty));
        const safeQty =
          product.availabilityStatus === "made_to_order" ||
          typeof product.stock !== "number"
            ? requestedSafeQty
            : Math.min(requestedSafeQty, Math.max(0, Math.floor(product.stock)));

        setCart(
          (current) => {
            const next = {
              ...current,
            };

            if (safeQty <= 0) {
              delete next[
                product.id
              ];
            } else {
              next[product.id] =
                safeQty;
            }

            return next;
          },
        );
      },
      [],
    );

  function goToTop() {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function continueToCustomer() {
    if (
      cartItems.length === 0
    ) {
      setCartOpen(true);
      return;
    }

    setFormError("");
    setCartOpen(false);
    setStep("customer");
    goToTop();
  }

  function continueToDelivery() {
    if (
      !customer.name.trim()
    ) {
      setFormError(
        text.requiredName,
      );
      return;
    }

    if (
      !customer.phone.trim()
    ) {
      setFormError(
        text.requiredPhone,
      );
      return;
    }

    setFormError("");
    setStep("delivery");
    goToTop();
  }

  async function submitOrder() {
    if (
      submitting ||
      cartItems.length === 0
    ) {
      return;
    }

    if (
      !customer.name.trim()
    ) {
      setStep("customer");
      setFormError(
        text.requiredName,
      );
      goToTop();
      return;
    }

    if (
      !customer.phone.trim()
    ) {
      setStep("customer");
      setFormError(
        text.requiredPhone,
      );
      goToTop();
      return;
    }

    if (delivery.mode === "postal") {
      if (!postalEvaluation.available) {
        setFormError(postalUnavailableMessage);
        return;
      }

      const requiredPostalFields = [
        delivery.recipientName,
        delivery.postalCode,
        delivery.prefecture,
        delivery.city,
        delivery.addressLine1,
      ];

      if (requiredPostalFields.some((value) => !value.trim())) {
        setFormError(text.postalRequired);
        return;
      }
    }

    setSubmitting(true);
    setFormError("");

    try {
      const quantities = Object.fromEntries(
        cartItems.map((item) => [
          item.id,
          Math.max(0, Math.floor(item.qty)),
        ]),
      );

      const result = await createPublicOrder({
        source: "store",
        sellerId,
        language,
        selectedOfferId:
          selectedOfferId || undefined,
        customerClientId:
          customerSession.clientId || undefined,
        quantities,
        customer: {
          name: customer.name,
          phone: customer.phone,
          email:
            customer.email || undefined,
        },
        delivery: {
          mode: delivery.mode,
          date:
            delivery.date || undefined,
          time:
            delivery.time || undefined,
          address:
            delivery.address || undefined,
          locationLink:
            delivery.locationLink ||
            undefined,
          note:
            delivery.note || undefined,
          shipping:
            delivery.mode === "postal"
              ? {
                  recipientName: delivery.recipientName,
                  postalCode: delivery.postalCode,
                  prefecture: delivery.prefecture,
                  city: delivery.city,
                  addressLine1: delivery.addressLine1,
                  addressLine2: delivery.addressLine2 || undefined,
                }
              : undefined,
        },
      });

      setCreatedOrderId(
        result.orderId,
      );
      setCreatedCustomerOrderRefId(result.customerOrderRefId || "");

      writeStoredCustomerProfile(storedProfileFromCheckout(customer, delivery));
      removeLocalDraft(customerDraftKey);

      setStep("success");
      setCartOpen(false);
      goToTop();
    } catch (error) {
      console.error(
        "[StoreClient] Falha ao criar pedido:",
        error,
      );

      const errorCode =
        getPublicOrderErrorCode(
          error,
        );

      const message =
        errorCode === "AUTH_REQUIRED"
          ? language === "ja"
            ? "セッションの有効期限が切れました。再度ログインしてください。"
            : language === "en"
              ? "Your session expired. Sign in again before placing the order."
              : "Sua sessão expirou. Entre novamente antes de finalizar o pedido."
          : errorCode ===
          "PRODUCT_UNAVAILABLE"
          ? text.stockError
          : errorCode ===
              "OFFER_UNAVAILABLE"
            ? text.offerUnavailable
            : errorCode ===
                "SHIPPING_UNAVAILABLE"
              ? postalUnavailableMessage || text.postalUnavailable
              : errorCode ===
                    "SELLER_UNAVAILABLE" ||
                  errorCode ===
                    "EVENT_UNAVAILABLE"
                ? text.permissionError
                : text.orderError;

      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  function resetOrder() {
    setCart({});
    writeStoredCustomerProfile(storedProfileFromCheckout(customer, delivery));
    removeLocalDraft(customerDraftKey);

    setDelivery({
      mode: "pickup",
      date: "",
      time: "",
      address: "",
      locationLink: "",
      note: "",
      recipientName: "",
      postalCode: "",
      prefecture: "",
      city: "",
      addressLine1: "",
      addressLine2: "",
    });

    setCreatedOrderId("");
    setCreatedCustomerOrderRefId("");
    setFormError("");
    setSearch("");
    setSelectedCategory(null);
    setSelectedOfferId("");
    setStep("products");
    goToTop();
  }

  const productGallery =
    selectedProduct
      ? [
          selectedProduct.imageUrl,
          ...selectedProduct.extraImageUrls,
        ].filter(Boolean)
      : [];

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
          <div className="h-36 animate-pulse rounded-3xl bg-neutral-200 dark:bg-neutral-800" />

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({
              length: 6,
            }).map(
              (_, index) => (
                <div
                  key={index}
                  className="h-72 animate-pulse rounded-3xl bg-neutral-200 dark:bg-neutral-800"
                />
              ),
            )}
          </div>

          <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
            {text.loading}
          </p>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
        <section className="w-full max-w-lg rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm dark:border-red-900/60 dark:bg-neutral-900">
          <Store
            className="mx-auto text-red-600 dark:text-red-300"
            size={42}
          />

          <h1 className="mt-4 text-2xl font-black">
            {
              text.storeUnavailable
            }
          </h1>

          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
            {loadError}
          </p>

          <button
            type="button"
            onClick={() =>
              setReloadKey(
                (current) =>
                  current + 1,
              )
            }
            className="mt-6 rounded-xl bg-neutral-950 px-5 py-3 font-bold text-white dark:bg-white dark:text-neutral-950"
          >
            {text.retry}
          </button>
        </section>
      </main>
    );
  }

  if (step === "success") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
        <section className="w-full max-w-xl rounded-3xl border border-green-200 bg-white p-8 text-center shadow-sm dark:border-green-900/60 dark:bg-neutral-900">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300">
            <Check size={40} />
          </div>

          <h1 className="mt-6 text-3xl font-black">
            {text.successTitle}
          </h1>

          <p className="mt-3 text-neutral-600 dark:text-neutral-300">
            {text.successBody}
          </p>

          <div className="mt-6 rounded-2xl bg-neutral-100 p-4 dark:bg-neutral-800">
            <p className="text-xs font-bold uppercase text-neutral-500 dark:text-neutral-400">
              {text.orderNumber}
            </p>

            <p className="mt-1 break-all font-mono text-lg font-black">
              {createdOrderId}
            </p>
          </div>

          <p className="mt-4 text-sm font-medium text-neutral-500 dark:text-neutral-400">
            {createdCustomerOrderRefId ? text.registeredOrderHelp : text.guestOrderHelp}
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {createdCustomerOrderRefId && (
              <Link
                href={`/customer/orders/${encodeURIComponent(createdCustomerOrderRefId)}`}
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 font-black text-white transition hover:bg-emerald-700"
              >
                {text.trackOrder}
              </Link>
            )}
            {customerSession.registered && (
              <Link
                href="/customer/orders"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-neutral-300 px-5 py-3 font-black dark:border-neutral-700"
              >
                {text.myOrders}
              </Link>
            )}
            <button
              type="button"
              onClick={resetOrder}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-neutral-950 px-5 py-3 font-black text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
            >
              {text.newOrder}
            </button>
            <Link
              href={`/store/${encodeURIComponent(sellerId)}`}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-neutral-300 px-5 py-3 font-black dark:border-neutral-700"
            >
              {text.visitStore}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 pb-28 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100 lg:pb-10">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          {storeProfile.bannerUrl && (
            <div className="h-36 sm:h-48">
              <img
                src={
                  storeProfile.bannerUrl
                }
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          )}

          <div className="p-5 sm:p-7">
            <div className="flex items-center gap-4">
              {storeProfile.logoUrl ? (
                <img
                  src={
                    storeProfile.logoUrl
                  }
                  alt={
                    storeProfile.name
                  }
                  className="h-16 w-16 rounded-2xl object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                  <Store size={32} />
                </div>
              )}

              <div className="min-w-0">
                <h1 className="break-words text-2xl font-black sm:text-3xl">
                  {
                    storeProfile.name
                  }
                </h1>

                {storeProfile.description && (
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                    {
                      storeProfile.description
                    }
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2">
              {[
                text.productsStep,
                text.customerStep,
                text.deliveryStep,
              ].map(
                (
                  label,
                  index,
                ) => {
                  const currentIndex =
                    step === "products"
                      ? 0
                      : step ===
                          "customer"
                        ? 1
                        : 2;

                  const active =
                    index <=
                    currentIndex;

                  return (
                    <div
                      key={label}
                      className={[
                        "rounded-xl border px-2 py-2 text-center text-xs font-bold sm:px-3 sm:text-sm",
                        active
                          ? "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200"
                          : "border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950/50 dark:text-neutral-400",
                      ].join(" ")}
                    >
                      {index + 1}.{" "}
                      {label}
                    </div>
                  );
                },
              )}
            </div>
          </div>
        </header>

        <div className="mt-4">
          <CustomerAccountBar
            session={customerSession}
            returnTo={`/store/${sellerId}`}
            language={language}
          />
        </div>

{step === "products" && (
  <>
    <StoreOffersSection
      offers={offers}
      selectedOfferId={selectedOfferId}
      evaluation={selectedOfferEvaluation}
      products={products}
      language={language}
      locale={storeProfile.regionalLocale}
      currency={storeProfile.currency}
      text={text}
      onSelect={(offerId) => {
        setSelectedOfferId(offerId);
      }}
    />

    <section className="mt-6 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-5">
      <label className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-950/50">
        <Search
          className="shrink-0 text-neutral-400"
          size={20}
        />

        <input
          value={search}
          onChange={(
            event,
          ) =>
            setSearch(
              event.target
                .value,
            )
          }
          placeholder={
            text.search
          }
          className="w-full bg-transparent outline-none placeholder:text-neutral-400"
        />

        {search && (
          <button
            type="button"
            onClick={() =>
              setSearch("")
            }
            className="rounded-lg p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800"
            aria-label={
              text.close
            }
          >
            <X size={17} />
          </button>
        )}
      </label>
    </section>

    {!showingProducts ? (
      <>
        <section className="mt-8">
          <h2 className="text-2xl font-black sm:text-3xl">
            {
              text.chooseCategory
            }
          </h2>

          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
            {
              text.chooseCategoryHelp
            }
          </p>
        </section>

        {products.length === 0 ? (
          <EmptyState
            icon={
              <Package
                size={40}
              />
            }
            message={
              text.emptyProducts
            }
          />
        ) : (
          <section className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {categorySummaries.map(
              (
                categoryItem,
              ) => (
                <button
                  key={
                    categoryItem.name
                  }
                  type="button"
                  onClick={() => {
                    setSelectedCategory(
                      categoryItem.name,
                    );
                    setSearch("");
                    window.scrollTo({
                      top: 0,
                      behavior:
                        "smooth",
                    });
                  }}
                  className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-900 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-neutral-700"
                >
                  {categoryItem.imageUrl ? (
                    <img
                      src={
                        categoryItem.imageUrl
                      }
                      alt={
                        categoryItem.name
                      }
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-neutral-200 dark:bg-neutral-800">
                      <Package
                        className="text-neutral-500"
                        size={40}
                      />
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

                  <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                    <h3 className="break-words text-base font-black sm:text-lg">
                      {
                        categoryItem.name
                      }
                    </h3>

                    <p className="mt-1 text-xs font-semibold text-white/80">
                      {
                        categoryItem.count
                      }{" "}
                      {categoryItem.count ===
                      1
                        ? text.categoryProduct
                        : text.categoryProducts}
                    </p>
                  </div>
                </button>
              ),
            )}
          </section>
        )}

        <StoreProductGrid
          title={text.availableProductsTitle}
          help={text.availableProductsHelp}
          products={normalProducts}
          cart={cart}
          text={text}
          locale={storeProfile.regionalLocale}
          currency={storeProfile.currency}
          onOpen={(product) => {
            setSelectedProduct(product);
            setSelectedImageIndex(0);
          }}
          onSetQuantity={setQuantity}
        />

        <StoreProductGrid
          title={text.madeToOrderTitle}
          help={text.madeToOrderHelp}
          products={madeToOrderProducts}
          cart={cart}
          text={text}
          locale={storeProfile.regionalLocale}
          currency={storeProfile.currency}
          madeToOrder
          onOpen={(product) => {
            setSelectedProduct(product);
            setSelectedImageIndex(0);
          }}
          onSetQuantity={setQuantity}
        />
      </>
    ) : (
      <>
        <section className="mt-6 flex flex-col gap-4 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-orange-700 dark:text-orange-300">
              {search.trim()
                ? text.searchResults
                : text.productsStep}
            </p>

            <h2 className="mt-1 text-2xl font-black">
              {selectedCategory ??
                (selectedOffer
                  ? resolveLocalizedOfferText(
                      selectedOffer.content,
                      language,
                      language,
                    ).name
                  : text.searchResults)}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedCategory(
                null,
              );
              setSearch("");
              window.scrollTo({
                top: 0,
                behavior:
                  "smooth",
              });
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 font-bold transition hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            <ChevronLeft
              size={18}
            />
            {
              text.backToCategories
            }
          </button>
        </section>

        {visibleProducts.length === 0 ? (
          <EmptyState
            icon={<Search size={40} />}
            message={text.emptySearch}
          />
        ) : (
          <>
            <StoreProductGrid
              title={text.availableProductsTitle}
              help={text.availableProductsHelp}
              products={visibleNormalProducts}
              cart={cart}
              text={text}
              locale={storeProfile.regionalLocale}
              currency={storeProfile.currency}
              onOpen={(product) => {
                setSelectedProduct(product);
                setSelectedImageIndex(0);
              }}
              onSetQuantity={setQuantity}
            />
            <StoreProductGrid
              title={text.madeToOrderTitle}
              help={text.madeToOrderHelp}
              products={visibleMadeToOrderProducts}
              cart={cart}
              text={text}
              locale={storeProfile.regionalLocale}
              currency={storeProfile.currency}
              madeToOrder
              onOpen={(product) => {
                setSelectedProduct(product);
                setSelectedImageIndex(0);
              }}
              onSetQuantity={setQuantity}
            />
          </>
        )}
      </>
    )}
  </>
)}

        {step === "customer" && (
          <section className="mx-auto mt-6 max-w-2xl rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
            <BackButton
              label={text.back}
              onClick={() =>
                setStep(
                  "products",
                )
              }
            />

            <h2 className="mt-6 text-2xl font-black">
              {text.customerTitle}
            </h2>

            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              {text.customerHelp}
            </p>

            <FormError
              message={formError}
            />

            <div className="mt-6 space-y-4">
              <Field
                label={text.name}
                value={
                  customer.name
                }
                onChange={(
                  value,
                ) =>
                  setCustomer(
                    (current) => ({
                      ...current,
                      name: value,
                    }),
                  )
                }
                required
              />

              <Field
                label={text.phone}
                value={
                  customer.phone
                }
                onChange={(
                  value,
                ) =>
                  setCustomer(
                    (current) => ({
                      ...current,
                      phone: value,
                    }),
                  )
                }
                inputMode="tel"
                required
              />

              <Field
                label={text.email}
                value={
                  customer.email
                }
                onChange={(
                  value,
                ) =>
                  setCustomer(
                    (current) => ({
                      ...current,
                      email: value,
                    }),
                  )
                }
                inputMode="email"
              />
            </div>

            <button
              type="button"
              onClick={
                continueToDelivery
              }
              className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 px-5 py-3 font-bold text-white transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
            >
              {text.continue}
              <ChevronRight
                size={18}
              />
            </button>
          </section>
        )}

        {step === "delivery" && (
          <section className="mx-auto mt-6 max-w-2xl rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
            <BackButton
              label={text.back}
              onClick={() =>
                setStep(
                  "customer",
                )
              }
            />

            <h2 className="mt-6 text-2xl font-black">
              {text.deliveryTitle}
            </h2>

            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              {text.deliveryHelp}
            </p>

            <FormError
              message={formError}
            />

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  value: "pickup" as const,
                  label: text.pickup,
                  disabled: false,
                },
                {
                  value: "delivery" as const,
                  label: text.delivery,
                  disabled: false,
                },
                {
                  value: "none" as const,
                  label: text.arrange,
                  disabled: false,
                },
                ...(shippingSettings.postalEnabled
                  ? [
                      {
                        value: "postal" as const,
                        label: text.postal,
                        disabled: !postalEvaluation.available,
                      },
                    ]
                  : []),
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.disabled}
                  onClick={() =>
                    setDelivery((current) => ({
                      ...current,
                      mode: option.value,
                    }))
                  }
                  className={[
                    "rounded-2xl border p-4 text-left font-black transition disabled:cursor-not-allowed disabled:opacity-45",
                    delivery.mode === option.value
                      ? "border-orange-400 bg-orange-50 text-orange-900 ring-2 ring-orange-200 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-200 dark:ring-orange-900"
                      : "border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950/40 dark:hover:bg-neutral-800",
                  ].join(" ")}
                >
                  <span className="flex items-center gap-2">
                    {option.value === "postal" && <Mail size={17} />}
                    {option.label}
                  </span>
                </button>
              ))}
            </div>

            {shippingSettings.postalEnabled && !postalEvaluation.available && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                {postalUnavailableMessage}
              </p>
            )}

            {delivery.mode ===
              "pickup" &&
              storeProfile.pickupNote && (
                <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
                  <p className="text-xs font-bold uppercase">
                    {
                      text.pickupNote
                    }
                  </p>

                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    {
                      storeProfile.pickupNote
                    }
                  </p>
                </div>
              )}

            {delivery.mode !== "postal" && (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Field
                  label={text.date}
                  value={delivery.date}
                  type="date"
                  onChange={(value) =>
                    setDelivery((current) => ({
                      ...current,
                      date: value,
                    }))
                  }
                />

                <Field
                  label={text.time}
                  value={delivery.time}
                  type="time"
                  onChange={(value) =>
                    setDelivery((current) => ({
                      ...current,
                      time: value,
                    }))
                  }
                />
              </div>
            )}

            {delivery.mode ===
              "delivery" && (
              <div className="mt-4 space-y-4">
                <Field
                  label={
                    text.address
                  }
                  value={
                    delivery.address
                  }
                  onChange={(
                    value,
                  ) =>
                    setDelivery(
                      (current) => ({
                        ...current,
                        address:
                          value,
                      }),
                    )
                  }
                />

                <Field
                  label={
                    text.locationLink
                  }
                  value={
                    delivery.locationLink
                  }
                  onChange={(
                    value,
                  ) =>
                    setDelivery(
                      (current) => ({
                        ...current,
                        locationLink:
                          value,
                      }),
                    )
                  }
                  leadingIcon={
                    <MapPin
                      size={18}
                    />
                  }
                />
              </div>
            )}

            {delivery.mode === "postal" && (
              <div className="mt-5 space-y-5">
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-100">
                  <div className="flex items-center gap-2 font-black">
                    <Mail size={19} />
                    {text.shippingTitle}
                  </div>

                  <p className="mt-2 text-sm font-bold">
                    {postalEvaluation.pricingMode === "collect"
                      ? text.shippingCollect
                      : postalEvaluation.pricingMode === "arrange"
                        ? text.shippingArrange
                        : text.shippingCalculated}
                  </p>

                  {postalEvaluation.totalWeightGrams !== null && (
                    <p className="mt-2 text-xs">
                      {text.totalWeight}: {formatWeightGrams(postalEvaluation.totalWeightGrams)}
                    </p>
                  )}

                  {postalEvaluation.quoteStatus === "calculated" && (
                    <p className="mt-2 text-sm font-black">
                      {text.shippingFee}: {formatCurrency(
                        shippingFee,
                        storeProfile.regionalLocale,
                        storeProfile.currency,
                      )}
                    </p>
                  )}

                  {shippingSettings.instructions && (
                    <div className="mt-3 border-t border-sky-200 pt-3 dark:border-sky-900/60">
                      <p className="text-[10px] font-black uppercase tracking-wider opacity-70">
                        {text.postalInstructions}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs">
                        {shippingSettings.instructions}
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={text.recipientName}
                    value={delivery.recipientName}
                    required
                    onChange={(value) =>
                      setDelivery((current) => ({
                        ...current,
                        recipientName: value,
                      }))
                    }
                  />

                  <Field
                    label={text.postalCode}
                    value={delivery.postalCode}
                    required
                    onChange={(value) =>
                      setDelivery((current) => ({
                        ...current,
                        postalCode: value,
                      }))
                    }
                  />

                  <Field
                    label={text.prefecture}
                    value={delivery.prefecture}
                    required
                    onChange={(value) =>
                      setDelivery((current) => ({
                        ...current,
                        prefecture: value,
                      }))
                    }
                  />

                  <Field
                    label={text.city}
                    value={delivery.city}
                    required
                    onChange={(value) =>
                      setDelivery((current) => ({
                        ...current,
                        city: value,
                      }))
                    }
                  />
                </div>

                <Field
                  label={text.addressLine1}
                  value={delivery.addressLine1}
                  required
                  onChange={(value) =>
                    setDelivery((current) => ({
                      ...current,
                      addressLine1: value,
                    }))
                  }
                />

                <Field
                  label={text.addressLine2}
                  value={delivery.addressLine2}
                  onChange={(value) =>
                    setDelivery((current) => ({
                      ...current,
                      addressLine2: value,
                    }))
                  }
                />
              </div>
            )}

            <label className="mt-4 block">
              <span className="text-sm font-bold">
                {text.note}
              </span>

              <textarea
                value={
                  delivery.note
                }
                onChange={(
                  event,
                ) =>
                  setDelivery(
                    (current) => ({
                      ...current,
                      note:
                        event.target
                          .value,
                    }),
                  )
                }
                rows={4}
                className="mt-2 w-full resize-none rounded-xl border border-neutral-200 bg-white px-4 py-3 outline-none focus:border-orange-400 dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>

            <OrderSummary
              items={cartItems}
              subtotal={subtotal}
              discount={discount}
              shippingFee={shippingFee}
              showShipping={delivery.mode === "postal"}
              shippingLabel={
                postalEvaluation.quoteStatus === "collect"
                  ? text.shippingCollect
                  : postalEvaluation.quoteStatus === "pending"
                    ? text.shippingArrange
                    : text.shippingFee
              }
              total={total}
              locale={storeProfile.regionalLocale}
              currency={storeProfile.currency}
              totalLabel={text.total}
              subtotalLabel={text.subtotal}
              discountLabel={text.discount}
              offerEvaluation={selectedOfferEvaluation}
              language={language}
            />

            <button
              type="button"
              onClick={() =>
                void submitOrder()
              }
              disabled={submitting}
              className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-green-700 px-5 py-3 font-bold text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2
                    className="animate-spin"
                    size={18}
                  />
                  {text.sending}
                </>
              ) : (
                <>
                  <ShoppingBag
                    size={18}
                  />
                  {text.placeOrder}
                </>
              )}
            </button>
          </section>
        )}
      </div>

      {step === "products" &&
        totalItems > 0 && (
          <>
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 p-3 shadow-2xl backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95 lg:hidden">
              <button
                type="button"
                onClick={() =>
                  setCartOpen(true)
                }
                className="mx-auto flex min-h-14 w-full max-w-6xl items-center justify-between rounded-xl bg-neutral-950 px-5 py-3 font-bold text-white dark:bg-white dark:text-neutral-950"
              >
                <span className="flex items-center gap-2">
                  <ShoppingCart
                    size={20}
                  />
                  {totalItems}{" "}
                  {totalItems === 1
                    ? text.item
                    : text.items}
                </span>

                <span>
                  {formatCurrency(
                    productsTotal,
                    storeProfile.regionalLocale,
                    storeProfile.currency,
                  )}
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                setCartOpen(true)
              }
              className="fixed bottom-6 right-6 z-30 hidden min-h-14 items-center gap-3 rounded-full bg-neutral-950 px-6 py-3 font-bold text-white shadow-xl transition hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200 lg:flex"
            >
              <ShoppingCart
                size={20}
              />
              {totalItems}{" "}
              {totalItems === 1
                ? text.item
                : text.items}
              <span>
                {formatCurrency(
                  productsTotal,
                  storeProfile.regionalLocale,
                  storeProfile.currency,
                )}
              </span>
            </button>
          </>
        )}

      {cartOpen && (
        <CartDrawer
          items={cartItems}
          totalItems={totalItems}
          subtotal={subtotal}
          discount={discount}
          total={productsTotal}
          locale={storeProfile.regionalLocale}
          currency={storeProfile.currency}
          text={text}
          offerEvaluation={selectedOfferEvaluation}
          language={language}
          onClose={() =>
            setCartOpen(false)
          }
          onContinue={
            continueToCustomer
          }
          onChangeQuantity={
            setQuantity
          }
        />
      )}

      {selectedProduct && (
        <ProductModal
          product={
            selectedProduct
          }
          images={
            productGallery
          }
          imageIndex={
            selectedImageIndex
          }
          locale={storeProfile.regionalLocale}
          currency={storeProfile.currency}
          text={text}
          onImageIndexChange={
            setSelectedImageIndex
          }
          onClose={() =>
            setSelectedProduct(
              null,
            )
          }
        />
      )}
    </main>
  );
}

function EmptyState({
  icon,
  message,
}: {
  icon: ReactNode;
  message: string;
}) {
  return (
    <section className="mt-6 rounded-3xl border border-dashed border-neutral-300 bg-white p-12 text-center dark:border-neutral-700 dark:bg-neutral-900">
      <div className="mx-auto w-fit text-neutral-400">
        {icon}
      </div>

      <p className="mt-4 font-bold text-neutral-600 dark:text-neutral-300">
        {message}
      </p>
    </section>
  );
}

function QuantitySelector({
  qty,
  onDecrease,
  onIncrease,
  disableIncrease = false,
}: {
  qty: number;
  onDecrease: () => void;
  onIncrease: () => void;
  disableIncrease?: boolean;
}) {
  return (
    <div className="mt-5 flex items-center justify-between rounded-xl border border-neutral-200 p-2 dark:border-neutral-700">
      <button
        type="button"
        onClick={onDecrease}
        className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
      >
        <Minus size={18} />
      </button>

      <span className="min-w-10 text-center text-lg font-black">
        {qty}
      </span>

      <button
        type="button"
        onClick={onIncrease}
        disabled={disableIncrease}
        className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-950 text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
      >
        <Plus size={18} />
      </button>
    </div>
  );
}

function BackButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 font-bold transition hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
    >
      <ChevronLeft size={18} />
      {label}
    </button>
  );
}

function FormError({
  message,
}: {
  message: string;
}) {
  if (!message) {
    return null;
  }

  return (
    <p
      role="alert"
      className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
    >
      {message}
    </p>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  required = false,
  leadingIcon,
}: {
  label: string;
  value: string;
  onChange: (
    value: string,
  ) => void;
  type?: string;
  inputMode?:
    | "text"
    | "tel"
    | "email"
    | "numeric";
  required?: boolean;
  leadingIcon?: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold">
        {label}
        {required && (
          <span className="ml-1 text-red-600">
            *
          </span>
        )}
      </span>

      <span className="mt-2 flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 focus-within:border-orange-400 dark:border-neutral-700 dark:bg-neutral-950">
        {leadingIcon && (
          <span className="text-neutral-400">
            {leadingIcon}
          </span>
        )}

        <input
          type={type}
          value={value}
          onChange={(event) =>
            onChange(
              event.target.value,
            )
          }
          inputMode={inputMode}
          required={required}
          className="w-full bg-transparent outline-none"
        />
      </span>
    </label>
  );
}

function StoreProductGrid({
  title,
  help,
  products,
  cart,
  text,
  locale,
  currency,
  madeToOrder = false,
  onOpen,
  onSetQuantity,
}: {
  title: string;
  help: string;
  products: Product[];
  cart: Record<string, number>;
  text: (typeof TEXT)[Language];
  locale: RegionalLocale;
  currency: SupportedCurrency;
  madeToOrder?: boolean;
  onOpen: (product: Product) => void;
  onSetQuantity: (product: Product, quantity: number) => void;
}) {
  if (products.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="mb-4">
        <h2 className="text-2xl font-black sm:text-3xl">{title}</h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{help}</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => {
          const qty = cart[product.id] ?? 0;
          const soldOut =
            !madeToOrder &&
            typeof product.stock === "number" &&
            product.stock <= 0;
          const lastUnits =
            !madeToOrder &&
            typeof product.stock === "number" &&
            product.stock > 0 &&
            product.stock <= 10;
          const reachedCartLimit =
            !madeToOrder &&
            typeof product.stock === "number" &&
            qty >= product.stock;

          return (
            <article
              key={product.id}
              className={[
                "overflow-hidden rounded-3xl border bg-white shadow-sm transition dark:bg-neutral-900",
                madeToOrder
                  ? "border-violet-200 dark:border-violet-900/60"
                  : soldOut
                    ? "border-red-300 bg-red-50/40 opacity-80 dark:border-red-900/70 dark:bg-red-950/10"
                    : lastUnits
                      ? "border-amber-400 bg-amber-50/50 shadow-amber-100 dark:border-amber-700 dark:bg-amber-950/10"
                      : "border-neutral-200 dark:border-neutral-800",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => onOpen(product)}
                className="relative block aspect-[4/3] w-full bg-neutral-100 text-left dark:bg-neutral-800"
              >
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <ImageIcon className="text-neutral-400" size={44} />
                  </div>
                )}

                {madeToOrder && (
                  <span className="absolute left-3 top-3 rounded-full bg-violet-600 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-lg">
                    {text.madeToOrderBadge}
                  </span>
                )}

                {!madeToOrder && lastUnits && (
                  <span className="absolute left-3 top-3 rounded-full bg-amber-500 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-lg">
                    {text.lastUnits.replace("{count}", String(product.stock))}
                  </span>
                )}

                {!madeToOrder && soldOut && (
                  <span className="absolute left-3 top-3 rounded-full bg-red-600 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-lg">
                    {text.outOfStock}
                  </span>
                )}

                {product.extraImageUrls.length > 0 && (
                  <span className="absolute bottom-3 right-3 rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-white">
                    +{product.extraImageUrls.length}
                  </span>
                )}
              </button>

              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={[
                      "text-xs font-bold uppercase",
                      madeToOrder
                        ? "text-violet-700 dark:text-violet-300"
                        : "text-orange-700 dark:text-orange-300",
                    ].join(" ")}>{product.category}</p>
                    <h3 className="mt-1 break-words text-lg font-black">{product.name}</h3>
                  </div>
                  <p className="shrink-0 text-lg font-black">
                    {formatMoneyMajor(product.price, currency, locale)}
                  </p>
                </div>

                {product.description && (
                  <p className="mt-3 line-clamp-3 text-sm text-neutral-600 dark:text-neutral-300">
                    {product.description}
                  </p>
                )}

                {madeToOrder ? (
                  <p className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/20 dark:text-violet-300">
                    {text.madeToOrderNotice}
                  </p>
                ) : lastUnits ? (
                  <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                    {text.lastUnits.replace("{count}", String(product.stock))}
                  </p>
                ) : soldOut ? (
                  <p className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-black text-red-800 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
                    {text.outOfStock}
                  </p>
                ) : null}

                {qty > 0 ? (
                  <QuantitySelector
                    qty={qty}
                    onDecrease={() => onSetQuantity(product, qty - 1)}
                    onIncrease={() => onSetQuantity(product, qty + 1)}
                    disableIncrease={reachedCartLimit}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => onSetQuantity(product, 1)}
                    disabled={soldOut}
                    className={[
                      "mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40",
                      madeToOrder
                        ? "bg-violet-600 hover:bg-violet-700"
                        : "bg-neutral-950 hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200",
                    ].join(" ")}
                  >
                    <Plus size={18} />
                    {text.add}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StoreOffersSection({
  offers,
  selectedOfferId,
  evaluation,
  products,
  language,
  locale,
  currency,
  text,
  onSelect,
}: {
  offers: OfferDoc[];
  selectedOfferId: string;
  evaluation: OfferEvaluation | null;
  products: Product[];
  language: Language;
  locale: string;
  currency: SupportedCurrency;
  text: (typeof TEXT)[Language];
  onSelect: (offerId: string) => void;
}) {
  if (offers.length === 0) {
    return null;
  }

  const productById = new Map(
    products.map((product) => [
      product.id,
      product,
    ]),
  );

  return (
    <section className="mt-6 space-y-4">
      <div>
        <h2 className="text-2xl font-black sm:text-3xl">
          {text.offersTitle}
        </h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
          {text.offersHelp}
        </p>
      </div>

      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 scrollbar-none">
        {offers.map((offer) => {
          const localized =
            resolveLocalizedOfferText(
              offer.content,
              language,
              language,
            );
          const selected =
            offer.id === selectedOfferId;
          const currentEvaluation =
            selected ? evaluation : null;
          const eligibleNames =
            offer.eligibleProductIds
              .map((id) =>
                productById.get(id)?.name,
              )
              .filter(
                (name): name is string =>
                  Boolean(name),
              );

          let priceLabel = "";

          if (
            offer.pricing.mode ===
            "fixed_total"
          ) {
            priceLabel = `${formatMoneyMinor(
              offer.pricing
                .regularTotalMinor ?? 0,
              currency,
              locale,
            )} → ${formatMoneyMinor(
              offer.pricing
                .promotionalTotalMinor ?? 0,
              currency,
              locale,
            )}`;
          } else if (
            offer.pricing.mode ===
            "fixed_discount"
          ) {
            priceLabel = `- ${formatMoneyMinor(
              offer.pricing
                .discountMinor ?? 0,
              currency,
              locale,
            )}`;
          } else {
            priceLabel = `${offer.pricing.percentage ?? 0}%`;
          }

          const progressLabel =
            currentEvaluation
              ? currentEvaluation.applicable
                ? `${text.offerReady} · ${currentEvaluation.bundleCount} ${text.offerBundles}`
                : text.offerRemaining.replace(
                    "{count}",
                    String(
                      currentEvaluation.nextBundleRemaining,
                    ),
                  )
              : "";

          return (
            <article
              key={offer.id}
              className={[
                "min-w-[min(88vw,420px)] snap-start overflow-hidden rounded-3xl border bg-white shadow-sm transition dark:bg-neutral-900",
                selected
                  ? "border-orange-500 ring-2 ring-orange-500/20"
                  : "border-neutral-200 dark:border-neutral-800",
              ].join(" ")}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wider text-orange-700 dark:text-orange-300">
                      {text.requiredOfferQuantity}: {offer.requiredQuantity}
                    </p>
                    <h3 className="mt-2 break-words text-xl font-black">
                      {localized.name}
                    </h3>
                  </div>

                  <Gift
                    size={28}
                    className="shrink-0 text-orange-500"
                  />
                </div>

                {localized.description && (
                  <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
                    {localized.description}
                  </p>
                )}

                <p className="mt-4 text-lg font-black">
                  {priceLabel}
                </p>

                {eligibleNames.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                      {text.offerProducts}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                      {eligibleNames.join(" · ")}
                    </p>
                  </div>
                )}

                {selected && currentEvaluation && (
                  <div
                    className={[
                      "mt-4 rounded-2xl border p-4 text-sm font-bold",
                      currentEvaluation.applicable
                        ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-300"
                        : "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-200",
                    ].join(" ")}
                  >
                    <p>{progressLabel}</p>

                    {currentEvaluation.applicable && (
                      <p className="mt-2 text-xs font-black">
                        {text.offerSavings}: {formatMoneyMinor(
                          currentEvaluation.discountAmountMinor,
                          currency,
                          locale,
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  onSelect(
                    selected ? "" : offer.id,
                  )
                }
                className={[
                  "flex min-h-12 w-full items-center justify-center border-t px-4 text-sm font-black transition",
                  selected
                    ? "border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-200"
                    : "border-neutral-200 bg-neutral-950 text-white hover:bg-neutral-800 dark:border-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200",
                ].join(" ")}
              >
                {selected
                  ? text.removeOffer
                  : text.useOffer}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function OrderSummary({
  items,
  subtotal,
  discount,
  shippingFee,
  showShipping,
  shippingLabel,
  total,
  locale,
  currency,
  totalLabel,
  subtotalLabel,
  discountLabel,
  offerEvaluation,
  language,
}: {
  items: CartItem[];
  subtotal: number;
  discount: number;
  shippingFee: number;
  showShipping: boolean;
  shippingLabel: string;
  total: number;
  locale: string;
  currency: SupportedCurrency;
  totalLabel: string;
  subtotalLabel: string;
  discountLabel: string;
  offerEvaluation: OfferEvaluation | null;
  language: Language;
}) {
  return (
    <section className="mt-6 rounded-2xl bg-neutral-100 p-5 dark:bg-neutral-800">
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-4 text-sm"
          >
            <span className="min-w-0 break-words">
              {item.qty}× {item.name}
            </span>

            <span className="shrink-0 font-bold">
              {formatCurrency(item.subtotal, locale, currency)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2 border-t border-neutral-300 pt-4 text-sm dark:border-neutral-700">
        <div className="flex items-center justify-between gap-4">
          <span className="text-neutral-500">{subtotalLabel}</span>
          <span className="font-bold">
            {formatCurrency(subtotal, locale, currency)}
          </span>
        </div>

        {discount > 0 && (
          <>
            {offerEvaluation?.applicable && (
              <p className="text-xs font-bold text-orange-700 dark:text-orange-300">
                {resolveLocalizedOfferText(
                  offerEvaluation.offer.content,
                  language,
                  language,
                ).name}
              </p>
            )}

            <div className="flex items-center justify-between gap-4 text-green-700 dark:text-green-300">
              <span>{discountLabel}</span>
              <span className="font-black">
                - {formatCurrency(discount, locale, currency)}
              </span>
            </div>
          </>
        )}

        {showShipping && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-neutral-500">{shippingLabel}</span>
            <span className="font-bold">
              {shippingFee > 0
                ? formatCurrency(shippingFee, locale, currency)
                : "—"}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-neutral-300 pt-4 text-xl font-black dark:border-neutral-700">
        <span>{totalLabel}</span>
        <span>{formatCurrency(total, locale, currency)}</span>
      </div>
    </section>
  );
}

function CartDrawer({
  items,
  totalItems,
  subtotal,
  discount,
  total,
  locale,
  currency,
  text,
  offerEvaluation,
  language,
  onClose,
  onContinue,
  onChangeQuantity,
}: {
  items: CartItem[];
  totalItems: number;
  subtotal: number;
  discount: number;
  total: number;
  locale: string;
  currency: SupportedCurrency;
  text: (typeof TEXT)[Language];
  offerEvaluation: OfferEvaluation | null;
  language: Language;
  onClose: () => void;
  onContinue: () => void;
  onChangeQuantity: (
    product: Product,
    qty: number,
  ) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        aria-label={
          text.closeCart
        }
      />

      <aside className="relative flex h-full w-full max-w-md flex-col bg-white text-neutral-950 shadow-2xl dark:bg-neutral-900 dark:text-neutral-100">
        <header className="flex items-center justify-between border-b border-neutral-200 p-5 dark:border-neutral-800">
          <div>
            <h2 className="text-2xl font-black">
              {text.cart}
            </h2>

            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {totalItems}{" "}
              {totalItems === 1
                ? text.item
                : text.items}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-200 p-2 transition hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            aria-label={
              text.closeCart
            }
          >
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {items.length === 0 ? (
            <p className="rounded-2xl bg-neutral-100 p-6 text-center text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
              {text.emptyCart}
            </p>
          ) : (
            <div className="space-y-4">
              {items.map(
                (item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-700"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words font-black">
                          {item.name}
                        </h3>

                        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                          {formatCurrency(
                            item.price,
                            locale,
                            currency,
                          )}
                        </p>
                      </div>

                      <p className="shrink-0 font-black">
                        {formatCurrency(
                          item.subtotal,
                          locale,
                          currency,
                        )}
                      </p>
                    </div>

                    <QuantitySelector
                      qty={item.qty}
                      onDecrease={() =>
                        onChangeQuantity(
                          item,
                          item.qty - 1,
                        )
                      }
                      onIncrease={() =>
                        onChangeQuantity(
                          item,
                          item.qty + 1,
                        )
                      }
                    />
                  </article>
                ),
              )}
            </div>
          )}
        </div>

        <footer className="border-t border-neutral-200 p-5 dark:border-neutral-800">
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-neutral-500">{text.subtotal}</span>
              <span className="font-bold">
                {formatCurrency(subtotal, locale, currency)}
              </span>
            </div>

            {discount > 0 && (
              <>
                {offerEvaluation?.applicable && (
                  <p className="text-xs font-bold text-orange-700 dark:text-orange-300">
                    {resolveLocalizedOfferText(
                      offerEvaluation.offer.content,
                      language,
                      language,
                    ).name}
                  </p>
                )}
                <div className="flex items-center justify-between gap-4 text-green-700 dark:text-green-300">
                  <span>{text.discount}</span>
                  <span className="font-black">
                    - {formatCurrency(discount, locale, currency)}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-neutral-200 pt-4 text-xl font-black dark:border-neutral-800">
            <span>{text.total}</span>

            <span>
              {formatCurrency(
                total,
                locale,
                currency,
              )}
            </span>
          </div>

          <button
            type="button"
            onClick={onContinue}
            disabled={
              items.length === 0
            }
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 px-5 py-3 font-bold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
          >
            {text.continue}
            <ChevronRight
              size={18}
            />
          </button>
        </footer>
      </aside>
    </div>
  );
}

function ProductModal({
  product,
  images,
  imageIndex,
  locale,
  currency,
  text,
  onImageIndexChange,
  onClose,
}: {
  product: Product;
  images: string[];
  imageIndex: number;
  locale: string;
  currency: SupportedCurrency;
  text: (typeof TEXT)[Language];
  onImageIndexChange: (
    value: number,
  ) => void;
  onClose: () => void;
}) {
  const currentImage =
    images[imageIndex] ??
    "";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        aria-label={text.close}
      />

      <section className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white text-neutral-950 shadow-2xl dark:bg-neutral-900 dark:text-neutral-100">
        <header className="flex items-center justify-between border-b border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="text-xl font-black">
            {text.productDetails}
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-200 p-2 dark:border-neutral-700"
            aria-label={text.close}
          >
            <X size={20} />
          </button>
        </header>

        {currentImage ? (
          <div className="aspect-video bg-neutral-100 dark:bg-neutral-800">
            <img
              src={currentImage}
              alt={product.name}
              className="h-full w-full object-contain"
            />
          </div>
        ) : (
          <div className="flex aspect-video items-center justify-center bg-neutral-100 dark:bg-neutral-800">
            <ImageIcon
              className="text-neutral-400"
              size={52}
            />
          </div>
        )}

        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto border-b border-neutral-200 p-3 dark:border-neutral-800">
            {images.map(
              (image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  onClick={() =>
                    onImageIndexChange(
                      index,
                    )
                  }
                  className={[
                    "h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2",
                    index ===
                    imageIndex
                      ? "border-orange-500"
                      : "border-transparent",
                  ].join(" ")}
                >
                  <img
                    src={image}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              ),
            )}
          </div>
        )}

        <div className="p-6">
          <p className="text-xs font-bold uppercase text-orange-700 dark:text-orange-300">
            {product.category}
          </p>

          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <h3 className="text-2xl font-black">
              {product.name}
            </h3>

            <p className="text-2xl font-black">
              {formatCurrency(
                product.price,
                locale,
                currency,
              )}
            </p>
          </div>

          {product.description && (
            <p className="mt-4 whitespace-pre-wrap text-neutral-600 dark:text-neutral-300">
              {product.description}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
