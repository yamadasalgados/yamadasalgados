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

import RewardsCheckoutPanel from "@/app/_components/RewardsCheckoutPanel";
import useCustomerSession from "@/app/hooks/useCustomerSession";
import useCustomerRewards from "@/app/hooks/useCustomerRewards";
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
  normalizeSellerOrderSettings,
} from "@/app/lib/order-settings-schema";

import {
  useI18n,
} from "@/app/lib/i18n";

import {
  EMPTY_REWARD_SELECTION,
  evaluateRewardSelection,
  type RewardRedemptionSelection,
} from "@/app/lib/reward-schema";
import {
  formatMoneyMajor,
  formatMoneyMinor,
  minorToMajor,
} from "@/app/lib/money";
import {
  normalizeInventory,
  normalizeProductBundleConfig,
  normalizeProductPriceMajor,
  normalizeProductStorefrontConfig,
  normalizeProductPriceMinor,
  resolveLocalizedProductText,
  type ProductBundleConfig,
  type ProductStorefrontConfig,
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
  acceptOrdersWithoutStock: boolean;
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
  bundleConfig: ProductBundleConfig;
  storefront: ProductStorefrontConfig;
  publiclyVisible: boolean;
};

type BundleSelection = {
  kitQuantity: number;
  selections: Record<string, number>;
};

type BundleSelectionItem = {
  productId: string;
  name: string;
  imageUrl: string;
  quantity: number;
};

type CartItem = Product & {
  qty: number;
  subtotal: number;
  bundleSelection?: {
    totalUnitsPerKit: number;
    totalUnits: number;
    items: BundleSelectionItem[];
  };
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
    soldOutBadge: "Esgotado",
    stockConfirmationBadge: "Sob confirmação",
    stockConfirmationNotice: "Disponibilidade e prazo serão confirmados após o pedido.",
    stockConfirmationCart:
      "Alguns itens ultrapassam o estoque atual: {products}. O pedido ficará pendente e o seller entrará em contato se necessário.",
    stockConfirmationSuccess:
      "Há itens com disponibilidade pendente. O seller confirmará o prazo após revisar o pedido.",
    lastUnits: "Últimas {count} unidades — garanta a sua.",
    lastUnitsBadge: "Últimas {count}",
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
    offlineOrder:
      "Você está sem internet. Aguarde a conexão voltar antes de finalizar o pedido.",
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
    configureKit: "Montar kit",
    editKit: "Editar composição",
    kitBadge: "Kit configurável",
    kitTitle: "Monte seu kit",
    kitHelp: "Distribua as unidades entre os sabores disponíveis.",
    kitQuantity: "Quantidade de kits",
    kitTarget: "Total necessário",
    kitSelected: "Selecionado",
    kitRemaining: "Faltam",
    kitReady: "Composição completa",
    kitConfirm: "Adicionar kit ao carrinho",
    kitUpdate: "Atualizar kit",
    kitInvalid: "Distribua exatamente {count} unidades antes de continuar.",
    kitComposition: "Composição do kit",
    removeKit: "Remover kit",
    productsTitle: "Produtos",
    categoriesTitle: "Categorias",
    offerBadge: "Oferta",
    offerSuggestion: "Faltam {count} itens para ativar {offer}.",
    offerAppliedHint: "Oferta {offer} aplicada automaticamente.",
    openSearch: "Abrir busca",
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
    soldOutBadge: "Sold out",
    stockConfirmationBadge: "Confirmation required",
    stockConfirmationNotice: "Availability and timing will be confirmed after the order.",
    stockConfirmationCart:
      "Some items exceed current stock: {products}. The order will remain pending and the seller will contact you if needed.",
    stockConfirmationSuccess:
      "Some items are pending availability confirmation. The seller will confirm timing after reviewing the order.",
    lastUnits: "Only {count} left — get yours now.",
    lastUnitsBadge: "Only {count} left",
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
    offlineOrder:
      "You are offline. Wait for the connection to return before placing the order.",
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
    configureKit: "Build bundle",
    editKit: "Edit composition",
    kitBadge: "Configurable bundle",
    kitTitle: "Build your bundle",
    kitHelp: "Distribute the units among the available flavors.",
    kitQuantity: "Number of bundles",
    kitTarget: "Required total",
    kitSelected: "Selected",
    kitRemaining: "Remaining",
    kitReady: "Composition complete",
    kitConfirm: "Add bundle to cart",
    kitUpdate: "Update bundle",
    kitInvalid: "Select exactly {count} units before continuing.",
    kitComposition: "Bundle composition",
    removeKit: "Remove bundle",
    productsTitle: "Products",
    categoriesTitle: "Categories",
    offerBadge: "Offer",
    offerSuggestion: "Add {count} more items to activate {offer}.",
    offerAppliedHint: "Offer {offer} applied automatically.",
    openSearch: "Open search",
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
    soldOutBadge: "売り切れ",
    stockConfirmationBadge: "在庫確認",
    stockConfirmationNotice: "在庫状況と受取時期は注文後に確認します。",
    stockConfirmationCart:
      "現在の在庫を超える商品があります: {products}。注文は保留となり、必要に応じて販売者から連絡します。",
    stockConfirmationSuccess:
      "在庫確認が必要な商品があります。販売者が注文確認後に受取時期をご案内します。",
    lastUnits: "残り{count}点 — お早めにご注文ください。",
    lastUnitsBadge: "残り{count}点",
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
    offlineOrder:
      "オフラインです。接続が戻ってから注文を確定してください。",
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
    configureKit: "セットを選ぶ",
    editKit: "内容を変更",
    kitBadge: "選択式セット",
    kitTitle: "セット内容を選択",
    kitHelp: "合計数になるように商品ごとの数量を選んでください。",
    kitQuantity: "セット数",
    kitTarget: "必要合計",
    kitSelected: "選択済み",
    kitRemaining: "残り",
    kitReady: "内容が完成しました",
    kitConfirm: "カートに追加",
    kitUpdate: "セットを更新",
    kitInvalid: "合計{count}個になるように選択してください。",
    kitComposition: "セット内容",
    removeKit: "セットを削除",
    productsTitle: "商品",
    categoriesTitle: "カテゴリー",
    offerBadge: "オファー",
    offerSuggestion: "あと{count}点で{offer}が適用されます。",
    offerAppliedHint: "{offer}が自動的に適用されました。",
    openSearch: "検索を開く",
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

  const publiclyVisible = status !== "hidden";
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
    bundleConfig: normalizeProductBundleConfig(raw.bundleConfig),
    storefront: normalizeProductStorefrontConfig(
      raw.storefront,
      raw.storefrontSubgroup,
      raw.storefrontSubgroupOrder,
      raw.storefrontOrder,
    ),
    publiclyVisible,
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
    acceptOrdersWithoutStock: normalizeSellerOrderSettings(
      raw.orderSettings,
      raw.acceptOrdersWithoutStock,
    ).acceptOrdersWithoutStock,
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

function storefrontOrder(value: number | null): number {
  return value === null ? Number.MAX_SAFE_INTEGER : value;
}

function compareStorefrontProducts(left: Product, right: Product, locale: string): number {
  const categoryComparison = left.category.localeCompare(right.category, locale);
  if (categoryComparison !== 0) return categoryComparison;

  const groupOrderComparison = storefrontOrder(left.storefront.subgroupOrder) - storefrontOrder(right.storefront.subgroupOrder);
  if (groupOrderComparison !== 0) return groupOrderComparison;

  const groupComparison = left.storefront.subgroup.localeCompare(right.storefront.subgroup, locale);
  if (groupComparison !== 0) return groupComparison;

  const productOrderComparison = storefrontOrder(left.storefront.productOrder) - storefrontOrder(right.storefront.productOrder);
  if (productOrderComparison !== 0) return productOrderComparison;

  return left.name.localeCompare(right.name, locale);
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
  const customerRewards = useCustomerRewards(
    sellerId,
    customerSession.registered,
  );
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
      acceptOrdersWithoutStock: true,
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
  const [searchOpen, setSearchOpen] = useState(false);

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
  const [bundleSelections, setBundleSelections] =
    useState<Record<string, BundleSelection>>({});
  const [configuringBundle, setConfiguringBundle] =
    useState<Product | null>(null);

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
  const formErrorRef = useRef<HTMLDivElement | null>(null);

  const [submitting, setSubmitting] =
    useState(false);

  const [createdOrderId, setCreatedOrderId] =
    useState("");

  const [createdCustomerOrderRefId, setCreatedCustomerOrderRefId] =
    useState("");
  const [rewardSelection, setRewardSelection] =
    useState<RewardRedemptionSelection>({ ...EMPTY_REWARD_SELECTION });
  const [createdPointsToEarn, setCreatedPointsToEarn] = useState(0);
  const [createdPointsRedeemed, setCreatedPointsRedeemed] = useState(0);
  const [createdRequiresStockConfirmation, setCreatedRequiresStockConfirmation] =
    useState(false);

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
    if (!formError) return;
    const frame = window.requestAnimationFrame(() => {
      formErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [formError, step]);

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
        bundleSelections?: Record<string, BundleSelection>;
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
    if (draft?.bundleSelections && typeof draft.bundleSelections === "object") {
      setBundleSelections(draft.bundleSelections);
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
        bundleSelections,
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
    bundleSelections,
    step,
  ]);

  useEffect(() => {
    if (loading) return;

    const productMap = new Map<string, Product>(products.map((product) => [product.id, product]));
    setCart((current) => {
      let changed = false;
      const next: Record<string, number> = {};

      for (const [productId, rawQuantity] of Object.entries(current)) {
        const product = productMap.get(productId);
        if (!product || !product.publiclyVisible) {
          changed = true;
          continue;
        }

        const quantity = Math.max(0, Math.floor(Number(rawQuantity) || 0));
        let safeQuantity: number;
        if (product.bundleConfig.enabled) {
          const selection = bundleSelections[productId];
          const kitQuantity = Math.max(1, Math.floor(selection?.kitQuantity ?? 0));
          const allowed = new Set(product.bundleConfig.optionProductIds);
          const selectedTotal = Object.entries(selection?.selections ?? {}).reduce(
            (sum, [optionId, optionQuantity]) =>
              allowed.has(optionId)
                ? sum + Math.max(0, Math.floor(Number(optionQuantity) || 0))
                : sum,
            0,
          );
          safeQuantity =
            selection &&
            quantity === kitQuantity &&
            selectedTotal === product.bundleConfig.totalUnits * kitQuantity
              ? kitQuantity
              : 0;
        } else {
          safeQuantity =
            storeProfile.acceptOrdersWithoutStock ||
            product.availabilityStatus === "made_to_order" ||
            typeof product.stock !== "number"
              ? quantity
              : Math.min(quantity, Math.max(0, Math.floor(product.stock)));
        }

        if (safeQuantity > 0) next[productId] = safeQuantity;
        if (safeQuantity !== rawQuantity) changed = true;
      }

      return changed ? next : current;
    });
  }, [
    loading,
    products,
    bundleSelections,
    storeProfile.acceptOrdersWithoutStock,
  ]);

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
              .sort((a, b) => compareStorefrontProducts(a, b, locale));

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
      if (
        !product.publiclyVisible ||
        product.availabilityStatus !== "active"
      ) {
        continue;
      }

      const current =
        grouped.get(
          product.category,
        );

      const available =
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
        if (!product.publiclyVisible) {
          return false;
        }

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

  const visibleNormalProducts = useMemo(
    () => visibleProducts.filter((product) => product.availabilityStatus === "active"),
    [visibleProducts],
  );

  const visibleMadeToOrderProducts = useMemo(
    () => visibleProducts.filter((product) => product.availabilityStatus === "made_to_order"),
    [visibleProducts],
  );

  const madeToOrderProducts = useMemo(
    () =>
      products
        .filter(
          (product) =>
            product.publiclyVisible &&
            product.availabilityStatus === "made_to_order",
        )
        .sort((left, right) =>
          compareStorefrontProducts(left, right, locale),
        ),
    [locale, products],
  );

  const cartItems =
    useMemo<CartItem[]>(() => {
      const productMap = new Map<string, Product>(
        products.map((product) => [product.id, product]),
      );

      return products.reduce<CartItem[]>((items, product) => {
        const qty = cart[product.id] ?? 0;

        if (qty <= 0) {
          return items;
        }

        let bundleSelection: NonNullable<CartItem["bundleSelection"]> | null = null;

        if (product.bundleConfig.enabled) {
          const saved = bundleSelections[product.id];
          const kitQuantity = Math.max(
            1,
            Math.floor(saved?.kitQuantity ?? qty),
          );
          const allowedIds = new Set(product.bundleConfig.optionProductIds);
          const bundleItems = Object.entries(saved?.selections ?? {}).reduce<
            BundleSelectionItem[]
          >((selectedItems, [productId, rawQuantity]) => {
            const option = productMap.get(productId);
            const quantity = Math.max(
              0,
              Math.floor(Number(rawQuantity) || 0),
            );

            if (!option || !allowedIds.has(productId) || quantity <= 0) {
              return selectedItems;
            }

            selectedItems.push({
              productId,
              name: option.name,
              imageUrl: option.imageUrl,
              quantity,
            });

            return selectedItems;
          }, []);
          const totalUnits = bundleItems.reduce(
            (sum, item) => sum + item.quantity,
            0,
          );
          const expected = product.bundleConfig.totalUnits * kitQuantity;

          if (!saved || totalUnits !== expected || kitQuantity !== qty) {
            return items;
          }

          bundleSelection = {
            totalUnitsPerKit: product.bundleConfig.totalUnits,
            totalUnits,
            items: bundleItems,
          };
        }

        const cartItem: CartItem = {
          ...product,
          qty,
          subtotal: qty * product.price,
          ...(bundleSelection ? { bundleSelection } : {}),
        };

        items.push(cartItem);
        return items;
      }, []);
    }, [cart, products, bundleSelections]);

  const stockConfirmationItems = useMemo(
    () =>
      storeProfile.acceptOrdersWithoutStock
        ? cartItems
            .filter(
              (item) =>
                item.availabilityStatus !== "made_to_order" &&
                typeof item.stock === "number" &&
                item.qty > item.stock,
            )
            .map((item) => ({
              id: item.id,
              name: item.name,
              shortage: Math.max(0, item.qty - (item.stock ?? 0)),
            }))
        : [],
    [cartItems, storeProfile.acceptOrdersWithoutStock],
  );

  const stockConfirmationMessage = useMemo(
    () =>
      stockConfirmationItems.length > 0
        ? text.stockConfirmationCart.replace(
            "{products}",
            stockConfirmationItems
              .map((item) => `${item.name} (+${item.shortage})`)
              .join(", "),
          )
        : "",
    [stockConfirmationItems, text.stockConfirmationCart],
  );

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

  const subtotalMinor = useMemo(
    () => cartItems.reduce(
      (sum, item) => sum + item.priceMinor * item.qty,
      0,
    ),
    [cartItems],
  );

  const offerEvaluations = useMemo(
    () => {
      const lines = cartItems.map((item) => ({
        productId: item.id,
        quantity: item.qty,
        priceMinor: item.priceMinor,
      }));

      return offers.map((offer) => evaluateOfferForCart(offer, lines));
    },
    [cartItems, offers],
  );

  const appliedOfferEvaluation = useMemo<OfferEvaluation | null>(
    () =>
      offerEvaluations
        .filter((evaluation) => evaluation.applicable)
        .sort(
          (left, right) =>
            right.discountAmountMinor - left.discountAmountMinor ||
            right.bundleCount - left.bundleCount,
        )[0] ?? null,
    [offerEvaluations],
  );

  const suggestedOfferEvaluation = useMemo<OfferEvaluation | null>(
    () =>
      offerEvaluations
        .filter(
          (evaluation) =>
            !evaluation.applicable &&
            evaluation.eligibleQuantity > 0 &&
            evaluation.nextBundleRemaining > 0,
        )
        .sort(
          (left, right) =>
            left.nextBundleRemaining - right.nextBundleRemaining ||
            right.eligibleQuantity - left.eligibleQuantity,
        )[0] ?? null,
    [offerEvaluations],
  );

  const selectedOfferEvaluation =
    appliedOfferEvaluation ?? suggestedOfferEvaluation;

  useEffect(() => {
    const automaticOfferId = appliedOfferEvaluation?.offer.id ?? "";
    setSelectedOfferId((current) =>
      current === automaticOfferId ? current : automaticOfferId,
    );
  }, [appliedOfferEvaluation]);

  const discountMinor =
    appliedOfferEvaluation?.discountAmountMinor ?? 0;

  const discount = minorToMajor(
    discountMinor,
    storeProfile.currency,
  );

  const merchandisePayableBeforeRewardsMinor = Math.max(
    0,
    subtotalMinor - discountMinor,
  );
  const rewardEvaluation = useMemo(
    () => evaluateRewardSelection({
      selection: rewardSelection,
      walletBalance: customerRewards.wallet?.pointsBalance ?? 0,
      merchandisePayableMinor: merchandisePayableBeforeRewardsMinor,
      currency: storeProfile.currency,
      cartLines: cartItems.map((item) => ({
        productId: item.id,
        name: item.name,
        quantity: item.qty,
        unitPriceMinor: item.priceMinor,
      })),
      offerApplied: Boolean(appliedOfferEvaluation),
    }),
    [
      cartItems,
      customerRewards.wallet?.pointsBalance,
      merchandisePayableBeforeRewardsMinor,
      rewardSelection,
      appliedOfferEvaluation,
      storeProfile.currency,
    ],
  );
  const rewardsDiscount = minorToMajor(
    rewardEvaluation.discountMinor,
    storeProfile.currency,
  );
  const productsTotal = minorToMajor(
    Math.max(0, merchandisePayableBeforeRewardsMinor - rewardEvaluation.discountMinor),
    storeProfile.currency,
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
          storeProfile.acceptOrdersWithoutStock ||
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
      [storeProfile.acceptOrdersWithoutStock],
    );

  const saveBundleSelection = useCallback((product: Product, selection: BundleSelection) => {
    const kitQuantity = Math.max(1, Math.floor(selection.kitQuantity));
    const allowedIds = new Set(product.bundleConfig.optionProductIds);
    const cleanedSelections = Object.fromEntries(
      Object.entries(selection.selections)
        .map(([productId, rawQuantity]) => [productId, Math.max(0, Math.floor(Number(rawQuantity) || 0))] as const)
        .filter(([productId, quantity]) => allowedIds.has(productId) && quantity > 0),
    );
    const expected = product.bundleConfig.totalUnits * kitQuantity;
    const selected = Object.values(cleanedSelections).reduce((sum, quantity) => sum + quantity, 0);
    if (selected !== expected) return;

    setBundleSelections((current) => ({
      ...current,
      [product.id]: { kitQuantity, selections: cleanedSelections },
    }));
    setCart((current) => ({ ...current, [product.id]: kitQuantity }));
    setConfiguringBundle(null);
  }, []);

  const removeBundleFromCart = useCallback((productId: string) => {
    setBundleSelections((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
    setCart((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  }, []);

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

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setFormError(text.offlineOrder);
      goToTop();
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

      const orderBundleSelections = Object.fromEntries(
        cartItems
          .filter((item) => item.bundleSelection)
          .map((item) => [
            item.id,
            {
              kitQuantity: item.qty,
              selections: item.bundleSelection!.items.map((selection) => ({
                productId: selection.productId,
                quantity: selection.quantity,
              })),
            },
          ]),
      );

      const result = await createPublicOrder({
        source: "store",
        sellerId,
        language,
        selectedOfferId:
          appliedOfferEvaluation?.offer.id || undefined,
        customerClientId:
          customerSession.clientId || undefined,
        quantities,
        bundleSelections: orderBundleSelections,
        rewards: {
          mode: rewardEvaluation.mode,
          points: rewardEvaluation.pointsRedeemed,
          productId: rewardEvaluation.rewardProductId || undefined,
        },
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
      setCreatedPointsToEarn(result.pointsToEarn || 0);
      setCreatedPointsRedeemed(result.pointsRedeemed || 0);
      setCreatedRequiresStockConfirmation(stockConfirmationItems.length > 0);
      setRewardSelection({ ...EMPTY_REWARD_SELECTION });
      if (customerSession.registered) void customerRewards.refresh();

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
        errorCode === "INSUFFICIENT_POINTS"
          ? language === "ja"
            ? "ポイント残高が不足しています。"
            : language === "en"
              ? "Your points balance is insufficient."
              : "Seu saldo de pontos é insuficiente."
          : errorCode === "REWARDS_UNAVAILABLE"
            ? error instanceof Error
              ? error.message
              : text.orderError
          : errorCode === "AUTH_REQUIRED"
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
    setBundleSelections({});
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
    setCreatedPointsToEarn(0);
    setCreatedPointsRedeemed(0);
    setCreatedRequiresStockConfirmation(false);
    setRewardSelection({ ...EMPTY_REWARD_SELECTION });
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

          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
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

          {createdRequiresStockConfirmation && (
            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-sm font-bold leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              {text.stockConfirmationSuccess}
            </p>
          )}

          {(createdPointsRedeemed > 0 || createdPointsToEarn > 0) && (
            <div className="mt-4 rounded-2xl bg-violet-50 p-4 text-left text-sm font-bold text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
              {createdPointsRedeemed > 0 && (
                <p>
                  {language === "ja"
                    ? `${createdPointsRedeemed}ポイント使用しました。`
                    : language === "en"
                      ? `${createdPointsRedeemed} points used.`
                      : `${createdPointsRedeemed} pontos utilizados.`}
                </p>
              )}
              {createdPointsToEarn > 0 && (
                <p className={createdPointsRedeemed > 0 ? "mt-1" : ""}>
                  {language === "ja"
                    ? `受け渡し完了後に${createdPointsToEarn}ポイント獲得します。`
                    : language === "en"
                      ? `You will earn ${createdPointsToEarn} points after delivery.`
                      : `Você ganhará ${createdPointsToEarn} pontos após a entrega.`}
                </p>
              )}
            </div>
          )}

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
    <main
      className={[
        "min-h-screen bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100 lg:pb-10",
        customerSession.registered ? "pb-44" : "pb-28",
      ].join(" ")}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-3 sm:px-6 sm:py-5 lg:px-8">

{step === "products" && (
  <>
    <section className="sticky top-0 z-20 -mx-4 border-b border-neutral-200 bg-neutral-50/95 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95 sm:static sm:mx-0 sm:rounded-2xl sm:border sm:bg-white sm:px-4 sm:dark:bg-neutral-900">
      <div className="flex items-center gap-2">
        {(selectedCategory || search.trim()) && (
          <button
            type="button"
            onClick={() => {
              setSelectedCategory(null);
              setSearch("");
              setSearchOpen(false);
              window.scrollTo({
                top: 0,
                behavior: "smooth",
              });
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white transition hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
            aria-label={text.backToCategories}
          >
            <ChevronLeft size={18} />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black">
            {search.trim()
              ? text.searchResults
              : selectedCategory ?? text.categoriesTitle}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSearchOpen((current) => !current)}
          className={[
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition",
            searchOpen || search.trim()
              ? "border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/30 dark:text-orange-200"
              : "border-neutral-200 bg-white hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800",
          ].join(" ")}
          aria-label={text.openSearch}
        >
          <Search size={18} />
        </button>
      </div>

      {searchOpen && (
        <label className="mt-3 flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 dark:border-neutral-700 dark:bg-neutral-900">
          <Search className="shrink-0 text-neutral-400" size={18} />
          <input
            autoFocus
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setSelectedCategory(null);
            }}
            placeholder={text.search}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
          />
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSearchOpen(false);
            }}
            className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label={text.close}
          >
            <X size={16} />
          </button>
        </label>
      )}
    </section>

    {search.trim() ? (
      visibleNormalProducts.length === 0 &&
      visibleMadeToOrderProducts.length === 0 ? (
        <EmptyState
          icon={<Search size={40} />}
          message={text.emptySearch}
        />
      ) : (
        <>
          <StoreProductGrid
            title={text.searchResults}
            help=""
            products={visibleNormalProducts}
            cart={cart}
            bundleSelections={bundleSelections}
            offers={offers}
            language={language}
            text={text}
            locale={storeProfile.regionalLocale}
            currency={storeProfile.currency}
            acceptOrdersWithoutStock={storeProfile.acceptOrdersWithoutStock}
            onOpen={(product) => {
              setSelectedProduct(product);
              setSelectedImageIndex(0);
            }}
            onSetQuantity={setQuantity}
            onConfigureBundle={setConfiguringBundle}
          />

          <StoreProductGrid
            title={text.madeToOrderTitle}
            help={text.madeToOrderHelp}
            products={visibleMadeToOrderProducts}
            cart={cart}
            bundleSelections={bundleSelections}
            offers={offers}
            language={language}
            text={text}
            locale={storeProfile.regionalLocale}
            currency={storeProfile.currency}
            acceptOrdersWithoutStock={storeProfile.acceptOrdersWithoutStock}
            madeToOrder
            onOpen={(product) => {
              setSelectedProduct(product);
              setSelectedImageIndex(0);
            }}
            onSetQuantity={setQuantity}
            onConfigureBundle={setConfiguringBundle}
          />
        </>
      )
    ) : selectedCategory ? (
      visibleNormalProducts.length === 0 ? (
        <EmptyState
          icon={<Package size={40} />}
          message={text.emptyProducts}
        />
      ) : (
        <StoreProductGrid
          title={selectedCategory}
          help=""
          products={visibleNormalProducts}
          cart={cart}
          bundleSelections={bundleSelections}
          offers={offers}
          language={language}
          text={text}
          locale={storeProfile.regionalLocale}
          currency={storeProfile.currency}
          acceptOrdersWithoutStock={storeProfile.acceptOrdersWithoutStock}
          onOpen={(product) => {
            setSelectedProduct(product);
            setSelectedImageIndex(0);
          }}
          onSetQuantity={setQuantity}
          onConfigureBundle={setConfiguringBundle}
        />
      )
    ) : (
      <>
        <section className="mt-6">
          <h2 className="text-2xl font-black sm:text-3xl">
            {text.chooseCategory}
          </h2>

          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
            {text.chooseCategoryHelp}
          </p>

          {categorySummaries.length === 0 ? (
            <EmptyState
              icon={<Package size={40} />}
              message={text.emptyProducts}
            />
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {categorySummaries.map((categoryItem) => (
                <button
                  key={categoryItem.name}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(categoryItem.name);
                    setSearch("");
                    setSearchOpen(false);
                    window.scrollTo({
                      top: 0,
                      behavior: "smooth",
                    });
                  }}
                  className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-900 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-neutral-700"
                >
                  {categoryItem.imageUrl ? (
                    <img
                      src={categoryItem.imageUrl}
                      alt={categoryItem.name}
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

                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />

                  <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                    <h3 className="break-words text-base font-black sm:text-lg">
                      {categoryItem.name}
                    </h3>

                    <p className="mt-1 text-xs font-semibold text-white/80">
                      {categoryItem.count}{" "}
                      {categoryItem.count === 1
                        ? text.categoryProduct
                        : text.categoryProducts}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <StoreProductGrid
          title={text.madeToOrderTitle}
          help={text.madeToOrderHelp}
          products={madeToOrderProducts}
          cart={cart}
          bundleSelections={bundleSelections}
          offers={offers}
          language={language}
          text={text}
          locale={storeProfile.regionalLocale}
          currency={storeProfile.currency}
          acceptOrdersWithoutStock={storeProfile.acceptOrdersWithoutStock}
          madeToOrder
          onOpen={(product) => {
            setSelectedProduct(product);
            setSelectedImageIndex(0);
          }}
          onSetQuantity={setQuantity}
          onConfigureBundle={setConfiguringBundle}
        />
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

            <div ref={formErrorRef}>
              <FormError
                message={formError}
              />
            </div>

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

            <div ref={formErrorRef}>
              <FormError
                message={formError}
              />
            </div>

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

            <div className="mt-5">
              <RewardsCheckoutPanel
                language={language}
                sellerId={sellerId}
                returnTo={`/store/${sellerId}`}
                registered={customerSession.registered}
                loading={customerRewards.loading}
                wallet={customerRewards.wallet}
                currency={storeProfile.currency}
                locale={storeProfile.regionalLocale}
                cartLines={cartItems.map((item) => ({
                  productId: item.id,
                  name: item.name,
                  quantity: item.qty,
                  unitPriceMinor: item.priceMinor,
                }))}
                merchandisePayableMinor={merchandisePayableBeforeRewardsMinor}
                offerApplied={Boolean(appliedOfferEvaluation)}
                selection={rewardSelection}
                maximumDiscountPoints={rewardEvaluation.maximumDiscountPoints}
                pointsToEarn={rewardEvaluation.pointsToEarn}
                onChange={setRewardSelection}
              />
            </div>

            <OrderSummary
              items={cartItems}
              subtotal={subtotal}
              discount={discount + rewardsDiscount}
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
              stockConfirmationMessage={stockConfirmationMessage}
              language={language}
              text={text}
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
            <div className={[
                "fixed inset-x-0 z-40 border-t border-neutral-200 bg-white/95 p-3 shadow-2xl backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95 lg:hidden",
                customerSession.registered
                  ? "bottom-[calc(4.7rem+env(safe-area-inset-bottom))]"
                  : "bottom-0",
              ].join(" ")}>
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
          stockConfirmationMessage={stockConfirmationMessage}
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
          onConfigureBundle={setConfiguringBundle}
          onRemoveBundle={removeBundleFromCart}
        />
      )}

      {configuringBundle && (
        <BundleConfiguratorDialog
          product={configuringBundle}
          options={products.filter((product) =>
            configuringBundle.bundleConfig.optionProductIds.includes(product.id),
          )}
          initialSelection={bundleSelections[configuringBundle.id]}
          text={text}
          onClose={() => setConfiguringBundle(null)}
          onConfirm={(selection) => saveBundleSelection(configuringBundle, selection)}
          onRemove={cart[configuringBundle.id] > 0
            ? () => {
                removeBundleFromCart(configuringBundle.id);
                setConfiguringBundle(null);
              }
            : undefined}
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


function offerHeadline(
  offer: OfferDoc,
  language: Language,
  currency: SupportedCurrency,
  locale: RegionalLocale,
): string {
  const quantity = offer.requiredQuantity;

  if (offer.pricing.mode === "fixed_total") {
    const promotional = formatMoneyMinor(
      offer.pricing.promotionalTotalMinor ?? 0,
      currency,
      locale,
    );
    return language === "ja"
      ? `${quantity}点で${promotional}`
      : language === "en"
        ? `Get ${quantity} for ${promotional}`
        : `Leve ${quantity} por ${promotional}`;
  }

  if (offer.pricing.mode === "fixed_discount") {
    const discount = formatMoneyMinor(
      offer.pricing.discountMinor ?? 0,
      currency,
      locale,
    );
    return language === "ja"
      ? `${quantity}点で${discount}割引`
      : language === "en"
        ? `Get ${quantity} and save ${discount}`
        : `Leve ${quantity} e economize ${discount}`;
  }

  const percentage = offer.pricing.percentage ?? 0;
  return language === "ja"
    ? `${quantity}点で${percentage}%割引`
    : language === "en"
      ? `Get ${quantity} with ${percentage}% off`
      : `Leve ${quantity} com ${percentage}% de desconto`;
}

function StoreProductGrid({
  title,
  help,
  products,
  cart,
  bundleSelections,
  offers,
  language,
  text,
  locale,
  currency,
  acceptOrdersWithoutStock,
  madeToOrder = false,
  onOpen,
  onSetQuantity,
  onConfigureBundle,
}: {
  title: string;
  help: string;
  products: Product[];
  cart: Record<string, number>;
  bundleSelections: Record<string, BundleSelection>;
  offers: OfferDoc[];
  language: Language;
  text: (typeof TEXT)[Language];
  locale: RegionalLocale;
  currency: SupportedCurrency;
  acceptOrdersWithoutStock: boolean;
  madeToOrder?: boolean;
  onOpen: (product: Product) => void;
  onSetQuantity: (product: Product, quantity: number) => void;
  onConfigureBundle: (product: Product) => void;
}) {
  if (products.length === 0) return null;

  const hasConfiguredSubgroups = products.some((product) => product.storefront.subgroup.trim());
  const subgroupRows = (() => {
    if (!hasConfiguredSubgroups) {
      return [{ key: "all", name: "", products: [...products].sort((left, right) => compareStorefrontProducts(left, right, locale)) }];
    }

    const grouped = new Map<string, Product[]>();
    for (const product of products) {
      const subgroup = product.storefront.subgroup.trim();
      const key = subgroup || "__ungrouped__";
      const current = grouped.get(key) ?? [];
      current.push(product);
      grouped.set(key, current);
    }

    return Array.from(grouped.entries())
      .map(([key, rowProducts]) => {
        const sortedProducts = [...rowProducts].sort((left, right) => compareStorefrontProducts(left, right, locale));
        const first = sortedProducts[0];
        return {
          key,
          name: key === "__ungrouped__" ? "" : first?.storefront.subgroup || key,
          order: key === "__ungrouped__" ? Number.MAX_SAFE_INTEGER : storefrontOrder(first?.storefront.subgroupOrder ?? null),
          products: sortedProducts,
        };
      })
      .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name, locale));
  })();

  return (
    <section className="mt-8">
      <div className="mb-4">
        <h2 className="text-2xl font-black sm:text-3xl">{title}</h2>
        {help && <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{help}</p>}
      </div>

      <div className="space-y-7">
        {subgroupRows.map((row) => (
          <div key={row.key}>
            {row.name && (
              <div className="mb-3 flex items-center gap-3">
                <h3 className="shrink-0 text-sm font-black uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400 sm:text-base">
                  {row.name}
                </h3>
                <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
        {row.products.map((product) => {
          const qty = cart[product.id] ?? 0;
          const configurableBundle =
            product.bundleConfig.enabled && product.bundleConfig.optionProductIds.length >= 2;
          const savedBundle = bundleSelections[product.id];
          const selectedBundleUnits = Object.values(savedBundle?.selections ?? {})
            .reduce((sum, quantity) => sum + Math.max(0, Math.floor(Number(quantity) || 0)), 0);
          const hasNoStock =
            !madeToOrder &&
            typeof product.stock === "number" &&
            product.stock <= 0;
          const soldOut = hasNoStock && !acceptOrdersWithoutStock;
          const needsConfirmation = hasNoStock && acceptOrdersWithoutStock;
          const lastUnits =
            !madeToOrder &&
            typeof product.stock === "number" &&
            product.stock > 0 &&
            product.stock <= 10;
          const reachedCartLimit =
            !acceptOrdersWithoutStock &&
            !madeToOrder &&
            typeof product.stock === "number" &&
            qty >= product.stock;
          const highlightedOffer = offers
            .filter((offer) => offer.eligibleProductIds.includes(product.id))
            .sort((left, right) => left.requiredQuantity - right.requiredQuantity)[0] ?? null;
          const highlightedOfferText = highlightedOffer
            ? offerHeadline(highlightedOffer, language, currency, locale)
            : "";

          return (
            <article
              key={product.id}
              className={[
                "overflow-hidden rounded-2xl border bg-white shadow-sm transition dark:bg-neutral-900 sm:rounded-3xl",
                madeToOrder
                  ? "border-violet-200 dark:border-violet-900/60"
                  : soldOut
                    ? "border-red-300 bg-red-50/40 opacity-80 dark:border-red-900/70 dark:bg-red-950/10"
                    : needsConfirmation
                      ? "border-amber-400 bg-amber-50/40 dark:border-amber-700 dark:bg-amber-950/10"
                    : highlightedOffer
                      ? "border-orange-400 bg-orange-50/30 shadow-orange-100 dark:border-orange-700 dark:bg-orange-950/10"
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
                    {configurableBundle ? text.kitBadge : text.madeToOrderBadge}
                  </span>
                )}

                {!madeToOrder && lastUnits && (
                  <span className="absolute left-3 top-3 rounded-full bg-amber-500 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-lg">
                    {text.lastUnitsBadge.replace("{count}", String(product.stock))}
                  </span>
                )}

                {!madeToOrder && needsConfirmation && (
                  <span className="absolute left-3 top-3 rounded-full bg-amber-500 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-lg">
                    {text.stockConfirmationBadge}
                  </span>
                )}

                {!madeToOrder && soldOut && (
                  <span className="absolute left-3 top-3 rounded-full bg-red-600 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-lg">
                    {text.soldOutBadge}
                  </span>
                )}

                {highlightedOffer && !soldOut && (
                  <span className="absolute right-3 top-3 rounded-full bg-orange-500 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-lg">
                    {text.offerBadge}
                  </span>
                )}

                {product.extraImageUrls.length > 0 && (
                  <span className="absolute bottom-3 right-3 rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-white">
                    +{product.extraImageUrls.length}
                  </span>
                )}
              </button>

              <div className="p-3 sm:p-5">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <p className={[
                      "text-xs font-bold uppercase",
                      madeToOrder
                        ? "text-violet-700 dark:text-violet-300"
                        : "text-orange-700 dark:text-orange-300",
                    ].join(" ")}>{product.category}</p>
                    <h3 className="mt-1 break-words text-sm font-black sm:text-lg">{product.name}</h3>
                  </div>
                  <p className="shrink-0 text-sm font-black sm:text-lg">
                    {formatMoneyMajor(product.price, currency, locale)}
                  </p>
                </div>

                {product.description && (
                  <p className="mt-3 hidden text-sm text-neutral-600 dark:text-neutral-300 sm:line-clamp-3">
                    {product.description}
                  </p>
                )}

                {madeToOrder && (
                  <p className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/20 dark:text-violet-300">
                    {configurableBundle
                      ? `${text.kitTarget}: ${product.bundleConfig.totalUnits}`
                      : text.madeToOrderNotice}
                  </p>
                )}

                {needsConfirmation && (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                    {text.stockConfirmationNotice}
                  </p>
                )}

                {highlightedOffer && !soldOut && (
                  <div className="mt-3 rounded-xl border border-orange-300 bg-orange-50 px-3 py-2 text-orange-900 dark:border-orange-800 dark:bg-orange-950/20 dark:text-orange-200">
                    <p className="text-[10px] font-black uppercase tracking-wider">{text.offerBadge}</p>
                    <p className="mt-0.5 text-xs font-black sm:text-sm">{highlightedOfferText}</p>
                  </div>
                )}

                {configurableBundle && qty > 0 ? (
                  <div className="mt-3 space-y-2">
                    <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/20 dark:text-violet-200">
                      {qty}× {text.kitBadge} · {selectedBundleUnits} {text.items}
                    </div>
                    <button
                      type="button"
                      onClick={() => onConfigureBundle(product)}
                      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white transition hover:bg-violet-700 sm:min-h-12 sm:text-sm"
                    >
                      <Gift size={17} />
                      {text.editKit}
                    </button>
                  </div>
                ) : qty > 0 ? (
                  <QuantitySelector
                    qty={qty}
                    onDecrease={() => onSetQuantity(product, qty - 1)}
                    onIncrease={() => onSetQuantity(product, qty + 1)}
                    disableIncrease={reachedCartLimit}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => configurableBundle ? onConfigureBundle(product) : onSetQuantity(product, 1)}
                    disabled={soldOut}
                    className={[
                      "mt-3 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40 sm:mt-5 sm:min-h-12 sm:gap-2 sm:px-4 sm:py-3 sm:text-base",
                      madeToOrder
                        ? "bg-violet-600 hover:bg-violet-700"
                        : "bg-neutral-950 hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200",
                    ].join(" ")}
                  >
                    {configurableBundle ? <Gift size={18} /> : <Plus size={18} />}
                    {configurableBundle ? text.configureKit : text.add}
                  </button>
                )}
              </div>
            </article>
          );
        })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BundleConfiguratorDialog({
  product,
  options,
  initialSelection,
  text,
  onClose,
  onConfirm,
  onRemove,
}: {
  product: Product;
  options: Product[];
  initialSelection?: BundleSelection;
  text: (typeof TEXT)[Language];
  onClose: () => void;
  onConfirm: (selection: BundleSelection) => void;
  onRemove?: () => void;
}) {
  const [kitQuantity, setKitQuantity] = useState(
    Math.max(1, Math.floor(initialSelection?.kitQuantity ?? 1)),
  );
  const [selections, setSelections] = useState<Record<string, number>>(
    initialSelection?.selections ?? {},
  );

  useEffect(() => {
    setKitQuantity(Math.max(1, Math.floor(initialSelection?.kitQuantity ?? 1)));
    setSelections(initialSelection?.selections ?? {});
  }, [initialSelection, product.id]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const target = product.bundleConfig.totalUnits * kitQuantity;
  const selected = Object.values(selections).reduce<number>(
    (sum, quantity) => sum + Math.max(0, Math.floor(Number(quantity) || 0)),
    0,
  );
  const remaining = Math.max(0, target - selected);
  const ready = selected === target;

  const setOptionQuantity = (productId: string, requested: number) => {
    const current = Math.max(0, Math.floor(Number(selections[productId]) || 0));
    const safeRequested = Math.max(0, Math.floor(Number(requested) || 0));
    const nextQuantity = safeRequested > current
      ? Math.min(safeRequested, current + remaining)
      : safeRequested;

    setSelections((currentSelections) => {
      const next = { ...currentSelections };
      if (nextQuantity <= 0) delete next[productId];
      else next[productId] = nextQuantity;
      return next;
    });
  };

  const changeKitQuantity = (nextQuantity: number) => {
    const safe = Math.min(10, Math.max(1, Math.floor(nextQuantity)));
    setKitQuantity(safe);
    const nextTarget = product.bundleConfig.totalUnits * safe;
    setSelections((current) => {
      let running = 0;
      const next: Record<string, number> = {};
      for (const option of options) {
        const quantity = Math.max(0, Math.floor(Number(current[option.id]) || 0));
        const allowed = Math.min(quantity, Math.max(0, nextTarget - running));
        if (allowed > 0) {
          next[option.id] = allowed;
          running += allowed;
        }
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/65 backdrop-blur-sm sm:items-center sm:p-6">
      <button type="button" onClick={onClose} className="absolute inset-0" aria-label={text.close} />
      <section role="dialog" aria-modal="true" aria-labelledby="bundle-configurator-title" className="relative flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-white text-neutral-950 shadow-2xl dark:bg-neutral-950 dark:text-neutral-100 sm:max-h-[calc(100dvh-3rem)] sm:rounded-3xl sm:border sm:border-neutral-200 sm:dark:border-neutral-800">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
          <div className="flex min-w-0 items-center gap-3">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
            ) : null}
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wider text-violet-600 dark:text-violet-300">{text.kitBadge}</p>
              <h2 id="bundle-configurator-title" className="truncate text-xl font-black sm:text-2xl">{text.kitTitle}: {product.name}</h2>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{text.kitHelp}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 dark:border-neutral-700" aria-label={text.close}>
            <X size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-32 sm:p-6 sm:pb-6">
          <div className="grid gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900/50 dark:bg-violet-950/20 sm:grid-cols-2">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-violet-700 dark:text-violet-300">{text.kitQuantity}</p>
              <div className="mt-2 flex w-fit items-center gap-3 rounded-xl border border-violet-200 bg-white p-1 dark:border-violet-800 dark:bg-neutral-900">
                <button type="button" onClick={() => changeKitQuantity(kitQuantity - 1)} disabled={kitQuantity <= 1} className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-100 disabled:opacity-30 dark:bg-neutral-800"><Minus size={16} /></button>
                <span className="min-w-8 text-center text-lg font-black">{kitQuantity}</span>
                <button type="button" onClick={() => changeKitQuantity(kitQuantity + 1)} disabled={kitQuantity >= 10} className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-white disabled:opacity-30"><Plus size={16} /></button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white p-3 dark:bg-neutral-900"><p className="text-[10px] font-black uppercase text-neutral-400">{text.kitTarget}</p><p className="mt-1 text-lg font-black">{target}</p></div>
              <div className="rounded-xl bg-white p-3 dark:bg-neutral-900"><p className="text-[10px] font-black uppercase text-neutral-400">{text.kitSelected}</p><p className="mt-1 text-lg font-black">{selected}</p></div>
              <div className="rounded-xl bg-white p-3 dark:bg-neutral-900"><p className="text-[10px] font-black uppercase text-neutral-400">{text.kitRemaining}</p><p className={`mt-1 text-lg font-black ${remaining > 0 ? "text-amber-600" : "text-emerald-600"}`}>{remaining}</p></div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {options.map((option) => {
              const quantity = selections[option.id] ?? 0;
              return (
                <article key={option.id} className={`overflow-hidden rounded-2xl border bg-white dark:bg-neutral-900 ${quantity > 0 ? "border-violet-500 ring-2 ring-violet-200 dark:ring-violet-900" : "border-neutral-200 dark:border-neutral-800"}`}>
                  <div className="aspect-[4/3] bg-neutral-100 dark:bg-neutral-800">
                    {option.imageUrl ? <img src={option.imageUrl} alt={option.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><ImageIcon size={32} className="text-neutral-400" /></div>}
                  </div>
                  <div className="p-3">
                    <h3 className="line-clamp-2 min-h-10 text-sm font-black">{option.name}</h3>
                    <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-neutral-200 p-1 dark:border-neutral-700">
                      <button type="button" onClick={() => setOptionQuantity(option.id, quantity - 1)} disabled={quantity <= 0} className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-100 disabled:opacity-30 dark:bg-neutral-800"><Minus size={16} /></button>
                      <input
                        value={quantity}
                        onChange={(event) => setOptionQuantity(option.id, Number(event.target.value))}
                        inputMode="numeric"
                        aria-label={`${option.name} ${text.quantity}`}
                        className="w-12 bg-transparent text-center text-lg font-black outline-none"
                      />
                      <button type="button" onClick={() => setOptionQuantity(option.id, quantity + 1)} disabled={remaining <= 0} className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-white disabled:opacity-30"><Plus size={16} /></button>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1">
                      {[5, 10, 25].map((amount) => (
                        <button key={amount} type="button" onClick={() => setOptionQuantity(option.id, quantity + amount)} disabled={remaining <= 0} className="rounded-lg bg-neutral-100 py-1 text-[10px] font-black disabled:opacity-30 dark:bg-neutral-800">+{amount}</button>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {!ready && (
            <p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
              {text.kitInvalid.replace("{count}", String(target))}
            </p>
          )}
        </div>

        <footer className="absolute inset-x-0 bottom-0 z-10 grid gap-2 border-t border-neutral-200 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95 sm:static sm:flex sm:items-center sm:justify-between sm:gap-3">
          {onRemove ? (
            <button type="button" onClick={onRemove} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-red-300 px-4 text-sm font-black text-red-700 dark:border-red-900 dark:text-red-300 sm:w-auto">
              {text.removeKit}
            </button>
          ) : <span className="hidden sm:block" />}
          <button
            type="button"
            disabled={!ready || options.length < 2}
            onClick={() => onConfirm({ kitQuantity, selections })}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 font-black text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            <Check size={18} />
            {initialSelection ? text.kitUpdate : text.kitConfirm}
          </button>
        </footer>
      </section>
    </div>
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
  stockConfirmationMessage,
  language,
  text,
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
  stockConfirmationMessage: string;
  language: Language;
  text: (typeof TEXT)[Language];
}) {
  return (
    <section className="mt-6 rounded-2xl bg-neutral-100 p-5 dark:bg-neutral-800">
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="min-w-0 break-words">
                {item.qty}× {item.name}
              </span>
              <span className="shrink-0 font-bold">
                {formatCurrency(item.subtotal, locale, currency)}
              </span>
            </div>
            {item.bundleSelection && (
              <ul className="mt-1 space-y-0.5 pl-3 text-xs text-neutral-500 dark:text-neutral-400">
                {item.bundleSelection.items.map((selection) => (
                  <li key={selection.productId}>+ {selection.quantity}× {selection.name}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {stockConfirmationMessage && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          {stockConfirmationMessage}
        </p>
      )}

      <div className="mt-4 space-y-2 border-t border-neutral-300 pt-4 text-sm dark:border-neutral-700">
        <div className="flex items-center justify-between gap-4">
          <span className="text-neutral-500">{subtotalLabel}</span>
          <span className="font-bold">
            {formatCurrency(subtotal, locale, currency)}
          </span>
        </div>

        {offerEvaluation &&
          !offerEvaluation.applicable &&
          offerEvaluation.eligibleQuantity > 0 && (
            <p className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-200">
              {text.offerSuggestion
                .replace("{count}", String(offerEvaluation.nextBundleRemaining))
                .replace(
                  "{offer}",
                  resolveLocalizedOfferText(
                    offerEvaluation.offer.content,
                    language,
                    language,
                  ).name,
                )}
            </p>
          )}

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
  stockConfirmationMessage,
  language,
  onClose,
  onContinue,
  onChangeQuantity,
  onConfigureBundle,
  onRemoveBundle,
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
  stockConfirmationMessage: string;
  language: Language;
  onClose: () => void;
  onContinue: () => void;
  onChangeQuantity: (
    product: Product,
    qty: number,
  ) => void;
  onConfigureBundle: (product: Product) => void;
  onRemoveBundle: (productId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/50">
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

                    {item.bundleSelection ? (
                      <div className="mt-4 space-y-3">
                        <div className="rounded-xl bg-violet-50 p-3 text-xs text-violet-900 dark:bg-violet-950/30 dark:text-violet-100">
                          <p className="font-black">{text.kitComposition}</p>
                          <ul className="mt-2 space-y-1">
                            {item.bundleSelection.items.map((selection) => (
                              <li key={selection.productId} className="flex justify-between gap-3">
                                <span>{selection.name}</span>
                                <span className="font-black">{selection.quantity}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => onConfigureBundle(item)}
                            className="min-h-10 rounded-xl border border-violet-300 px-3 text-xs font-black text-violet-700 dark:border-violet-800 dark:text-violet-200"
                          >
                            {text.editKit}
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveBundle(item.id)}
                            className="min-h-10 rounded-xl border border-red-300 px-3 text-xs font-black text-red-700 dark:border-red-900 dark:text-red-300"
                          >
                            {text.removeKit}
                          </button>
                        </div>
                      </div>
                    ) : (
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
                    )}
                  </article>
                ),
              )}
            </div>
          )}
        </div>

        <footer className="border-t border-neutral-200 p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] dark:border-neutral-800">
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-neutral-500">{text.subtotal}</span>
              <span className="font-bold">
                {formatCurrency(subtotal, locale, currency)}
              </span>
            </div>

            {stockConfirmationMessage && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                {stockConfirmationMessage}
              </p>
            )}

            {offerEvaluation &&
              !offerEvaluation.applicable &&
              offerEvaluation.eligibleQuantity > 0 && (
                <p className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-200">
                  {text.offerSuggestion
                    .replace("{count}", String(offerEvaluation.nextBundleRemaining))
                    .replace(
                      "{offer}",
                      resolveLocalizedOfferText(
                        offerEvaluation.offer.content,
                        language,
                        language,
                      ).name,
                    )}
                </p>
              )}

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
