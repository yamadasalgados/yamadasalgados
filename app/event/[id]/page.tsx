"use client";
import { use, useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  addDoc,
  collection,
  serverTimestamp,
  getDocs,
  query,
  where,
  runTransaction,
} from "firebase/firestore";

// 🔹 Mesmas categorias usadas no catálogo
type CategoryType =
  | "Comida"
  | "Lanchonete"
  | "Assados"
  | "Sobremesa"
  | "Frutas-verduras"
  | "Festa"
  | "Congelados";

type ProductStatus = "active" | "inactive";

const CATEGORY_ORDER: CategoryType[] = [
  "Comida",
  "Lanchonete",
  "Assados",
  "Sobremesa",
  "Frutas-verduras",
  "Festa",
  "Congelados",
];

const openExternalLink = (url: string) => {
  if (typeof window === "undefined") return;
  // iOS Safari precisa usar location.href
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isIOS) {
    window.location.href = url;
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
};

// 🔹 Listas para o “scroller” de horário (não usamos mais, mas manter não atrapalha)
const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0–23
const MINUTES = [0, 10, 20, 30, 40, 50];

type EventData = {
  title: string;
  region: string;
  deliveryDates: string[];
  deliveryDateLabel: string;
  productNames: string[];
  whatsapp: string;
  status: string;
  pickupLink?: string;
  pickupNote?: string;
  messengerId?: string; // ID/username da página/conta Messenger
  featuredProductNames?: string[]; // 🔹 destaques do carrossel (pode ser qualquer produto)
};

type ProductImageData = {
  name: string;
  imageUrl: string;
  extraImageUrls: string[];
  price?: number;
  category?: CategoryType;
  // 🔹 campos de estoque, adaptando ao novo controle
  stockQty?: number;
  lowStockThreshold?: number;
  status?: ProductStatus;
  productDocId?: string; // 🔹 id do documento em "products" para abater estoque
};

type Props = {
  params: Promise<{ id: string }>;
};

type DeliveryMode = "delivery" | "pickup" | "none";
type DateOption = "event-date" | "other-date" | "no-preference";
type TimeOption = "no-preference" | "custom";

export default function EventPage({ params }: Props) {
  const { id } = use(params);

  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [note, setNote] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // 🔹 escolha de data de entrega
  const [dateOption, setDateOption] = useState<DateOption>("event-date");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [otherDate, setOtherDate] = useState<string>("");

  // 🔹 modo de entrega (padrão: retirada no local)
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("pickup");

  // 🔹 horário (agora com input numérico)
  const [timeOption, setTimeOption] = useState<TimeOption>("no-preference");
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [selectedMinute, setSelectedMinute] = useState<number | null>(null);
  const [timePickerOpen, setTimePickerOpen] = useState(false);

  // 🔹 localização do cliente (link Google Maps)
  const [locationLink, setLocationLink] = useState<string>("");
  const [gettingLocation, setGettingLocation] = useState(false);

  // 🔹 URL atual para compartilhamento
  const [currentUrl, setCurrentUrl] = useState("");

  // 👇 states para imagens / galeria
  const [productsData, setProductsData] = useState<
    Record<string, ProductImageData>
  >({});

  const [galleryProduct, setGalleryProduct] =
    useState<ProductImageData | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);

  // lista de imagens da galeria atual
  const galleryImages =
    galleryProduct != null
      ? ([
          galleryProduct.imageUrl,
          ...(galleryProduct.extraImageUrls || []),
        ].filter((u) => !!u) as string[])
      : [];

  // 🔹 helper para copiar texto com fallback
  const copyToClipboard = async (text: string) => {
    try {
      if (typeof navigator !== "undefined") {
        const navAny = navigator as any;
        if (navAny.clipboard?.writeText) {
          await navAny.clipboard.writeText(text);
          alert("Copiado! Agora é só colar na conversa.");
          return;
        }
      }
    } catch (err) {
      console.error("Erro ao copiar para o clipboard:", err);
    }

    if (typeof window !== "undefined") {
      window.prompt(
        "Copie a mensagem abaixo (Ctrl+C ou segure para selecionar) e cole onde quiser:",
        text
      );
    }
  };

  // 🔹 pega URL atual
  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentUrl(window.location.href);
    }
  }, []);

  // 🔹 Carrega dados do evento + produtos
  useEffect(() => {
    const loadEvent = async () => {
      try {
        const ref = doc(db, "events", id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setNotFound(true);
          return;
        }

        const data = snap.data() as any;

        let deliveryDates: string[] = Array.isArray(data.deliveryDates)
          ? data.deliveryDates
          : [];
        let deliveryDateLabel: string =
          data.deliveryDateLabel || data.deliveryDate || "";

        if (!deliveryDateLabel) {
          if (deliveryDates.length > 0) {
            deliveryDateLabel = deliveryDates.join(" • ");
          } else {
            deliveryDateLabel = "Data a definir";
          }
        }

        if (deliveryDates.length === 0 && data.deliveryDate) {
          deliveryDates = [data.deliveryDate];
        }

        const products: string[] = Array.isArray(data.productNames)
          ? data.productNames
          : [];
        const status: string = data.status || "active";
        const messengerId: string = data.messengerId || data.messenger || "";
        const featured: string[] = Array.isArray(data.featuredProductNames)
          ? data.featuredProductNames.filter((n: any) => typeof n === "string")
          : [];

        // 🔹 Nomes que podem ser pedidos: produtos do evento + destaques
        const allOrderableNames = Array.from(
          new Set([...products, ...featured])
        );

        setEvent({
          title: data.title || "",
          region: data.region || "",
          deliveryDates,
          deliveryDateLabel,
          productNames: products,
          whatsapp: data.whatsapp || "",
          status,
          pickupLink: data.pickupLink || "",
          pickupNote: data.pickupNote || "",
          messengerId: messengerId || "",
          featuredProductNames: featured,
        });

        // quantidades iniciais
        const initialQty: Record<string, number> = {};
        allOrderableNames.forEach((p) => {
          initialQty[p] = 0;
        });
        setQuantities(initialQty);

        // 📌 dia padrão: primeiro dia do evento (se existir)
        if (deliveryDates.length > 0) {
          setSelectedDate(deliveryDates[0]);
          setDateOption("event-date");
        } else {
          setDateOption("no-preference");
        }

        // 🔍 Carrega imagens, preço, categoria e estoque dos produtos a partir da coleção "products"
        const imagesMap: Record<string, ProductImageData> = {};

        await Promise.all(
          allOrderableNames.map(async (name) => {
            try {
              const qProd = query(
                collection(db, "products"),
                where("name", "==", name)
              );
              const snapProducts = await getDocs(qProd);
              if (!snapProducts.empty) {
                const firstDoc = snapProducts.docs[0];
                const docData = firstDoc.data() as any;

                const extras = Array.isArray(docData.extraImageUrls)
                  ? (docData.extraImageUrls as unknown[])
                      .filter((u) => typeof u === "string")
                      .map((u) => (u as string).trim())
                      .filter((u) => u.length > 0)
                  : [];

                const stockRaw =
                  typeof docData.stockQty === "number"
                    ? docData.stockQty
                    : null;
                const lowStockRaw =
                  typeof docData.lowStockThreshold === "number"
                    ? docData.lowStockThreshold
                    : null;

                const isOutOfStock =
                  stockRaw !== null && Number.isFinite(stockRaw)
                    ? stockRaw <= 0
                    : false;

                const rawStatus = (docData.status as ProductStatus) || "active";
                const statusFinal: ProductStatus = isOutOfStock
                  ? "inactive"
                  : rawStatus;

                imagesMap[name] = {
                  name,
                  imageUrl: docData.imageUrl || "",
                  extraImageUrls: extras,
                  price:
                    typeof docData.price === "number"
                      ? docData.price
                      : Number(docData.price || 0),
                  category: (docData.category as CategoryType) || "Comida",
                  stockQty: stockRaw ?? undefined,
                  lowStockThreshold: lowStockRaw ?? undefined,
                  status: statusFinal,
                  productDocId: firstDoc.id,
                };
              }
            } catch (e) {
              console.error("Erro ao carregar imagens do produto:", name, e);
            }
          })
        );

        setProductsData(imagesMap);
      } catch (err) {
        console.error(err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadEvent();
    }
  }, [id]);

  // 🔹 controles tipo carrinho: - 0 + (respeitando estoque, se existir)
  const adjustQuantity = (product: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[product] || 0;
      const next = current + delta;
      if (next < 0) return prev;

      const stock = productsData[product]?.stockQty;
      if (typeof stock === "number" && Number.isFinite(stock)) {
        if (next > stock) {
          return {
            ...prev,
            [product]: stock,
          };
        }
      }

      return {
        ...prev,
        [product]: next,
      };
    });
  };

  // 🔹 Pega localização do cliente e monta link do Google Maps
  const handleGetLocation = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      alert("Seu navegador não suporta geolocalização.");
      return;
    }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const link = `https://www.google.com/maps?q=${latitude},${longitude}`;
        setLocationLink(link);
        setGettingLocation(false);
      },
      (err) => {
        console.error("Erro ao obter localização:", err);
        alert(
          "Não foi possível obter sua localização. Verifique as permissões do navegador."
        );
        setGettingLocation(false);
      }
    );
  };

  // 🔹 Descobre qual data final vai ser usada
  const getChosenDate = () => {
    if (!event) return "";
    if (dateOption === "event-date" && selectedDate) {
      return selectedDate;
    }
    if (dateOption === "other-date" && otherDate) {
      return otherDate;
    }
    if (dateOption === "no-preference") {
      return "Sem preferência";
    }
    return event.deliveryDateLabel;
  };

  // 🔹 Descobre qual horário final vai ser usado
  const getChosenTimeLabel = () => {
    if (
      timeOption === "no-preference" ||
      selectedHour == null ||
      selectedMinute == null
    ) {
      return "Sem preferência";
    }
    const h = String(selectedHour).padStart(2, "0");
    const m = String(selectedMinute).padStart(2, "0");
    return `${h}:${m}`;
  };

  // 🔹 Nomes de produtos que podem ser pedidos (evento + destaques)
  const getOrderableProductNames = () => {
    if (!event) return [] as string[];
    return Array.from(
      new Set([
        ...event.productNames,
        ...(event.featuredProductNames || []),
      ])
    );
  };

  // 🔹 Monta o texto do pedido
  const buildOrderMessage = () => {
    if (!event) return "";

    const orderableNames = getOrderableProductNames();

    const selectedItems = orderableNames
      .filter((p) => (quantities[p] || 0) > 0)
      .map((p) => `${p}: ${quantities[p]}`);

    const chosenDate = getChosenDate();
    const timeLabel = getChosenTimeLabel();

    const lines = [
      `Olá, gostaria de fazer um pedido para o evento: ${event.title}`,
      `Região: ${event.region}`,
      `Modo de entrega: ${
        deliveryMode === "delivery"
          ? "Entrega"
          : deliveryMode === "pickup"
          ? "Retirada no local"
          : "A combinar com a vendedora"
      }`,
      `Data de entrega: ${chosenDate}`,
      `Horário: ${timeLabel}`,
      "",
      `Nome: ${customerName || "(não informado)"}`,
      "",
      "Itens:",
      ...selectedItems.map((l) => `- ${l}`),
    ];

    if (deliveryMode === "delivery" && locationLink) {
      lines.push("", `Localização do cliente (Google Maps): ${locationLink}`);
    }

    if (event.pickupLink) {
      lines.push("", `Endereço / retirada da vendedora: ${event.pickupLink}`);
    }

    if (event.pickupNote) {
      lines.push("", `Instruções da vendedora: ${event.pickupNote}`);
    }

    if (note.trim()) {
      lines.push("", "Obs. do cliente:", note.trim());
    }

    // total da compra
    const totalAmount = getOrderableProductNames().reduce((sum, p) => {
      const q = quantities[p] || 0;
      const price = productsData[p]?.price || 0;
      return sum + q * price;
    }, 0);

    if (totalAmount > 0) {
      lines.push(
        "",
        `Total estimado: ¥${totalAmount.toLocaleString("ja-JP")}`
      );
    }

    return lines.join("\n");
  };

  // 🔹 Limpa formulário depois de enviar
  const resetForm = () => {
    if (!event) return;

    const resetQty: Record<string, number> = {};
    getOrderableProductNames().forEach((p) => {
      resetQty[p] = 0;
    });
    setQuantities(resetQty);
    setCustomerName("");
    setNote("");
    setLocationLink("");

    // padrões pós-envio
    setDeliveryMode("pickup");
    setTimeOption("no-preference");
    setSelectedHour(null);
    setSelectedMinute(null);
    setOtherDate("");

    if (event.deliveryDates.length > 0) {
      setDateOption("event-date");
      setSelectedDate(event.deliveryDates[0]);
    } else {
      setDateOption("no-preference");
      setSelectedDate("");
    }
  };

  // 🔹 Registra o pedido no Firestore (WhatsApp / Messenger) E ABATE ESTOQUE
  const registerOrderInFirestore = async (
    channel: "whatsapp" | "messenger"
  ) => {
    if (!event) throw new Error("Evento não carregado.");

    const orderableNames = getOrderableProductNames();
    const quantitiesClean: Record<string, number> = {};

    orderableNames.forEach((p) => {
      const q = quantities[p] || 0;
      if (q > 0) quantitiesClean[p] = q;
    });

    const totalItems = Object.values(quantitiesClean).reduce(
      (sum, q) => sum + Number(q || 0),
      0
    );

    if (totalItems === 0) {
      throw new Error("Selecione pelo menos 1 produto com quantidade.");
    }

    const chosenDate = getChosenDate();
    const timeLabel = getChosenTimeLabel();

    const updatedStocks: Record<string, number> = {};

    await runTransaction(db, async (transaction) => {
      // 1) Abater estoque dos produtos
      for (const [productName, q] of Object.entries(quantitiesClean)) {
        const info = productsData[productName];
        if (!info?.productDocId) continue;

        const prodRef = doc(db, "products", info.productDocId);
        const prodSnap = await transaction.get(prodRef);

        if (!prodSnap.exists()) {
          throw new Error(`Produto "${productName}" não encontrado.`);
        }

        const data = prodSnap.data() as any;
        const currentStock =
          typeof data.stockQty === "number" ? data.stockQty : null;

        // se não tiver controle de estoque numérico, não trava nem abate
        if (currentStock === null) {
          continue;
        }

        if (currentStock < q) {
          throw new Error(
            `Estoque insuficiente para "${productName}". Restam ${currentStock} unidade(s).`
          );
        }

        const newStock = currentStock - q;
        updatedStocks[productName] = newStock;

        transaction.update(prodRef, {
          stockQty: newStock,
        });
      }

      // 2) Registrar pedido na subcoleção orders do evento
      const orderRef = doc(collection(db, "events", id, "orders"));
      transaction.set(orderRef, {
        customerName: customerName || "",
        note: note || "",
        quantities: quantitiesClean,
        totalItems,
        status: "pending",
        channel,
        deliveryDate: chosenDate,
        deliveryMode,
        deliveryTimeSlot: timeLabel,
        locationLink: deliveryMode === "delivery" ? locationLink || "" : "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    // 3) Atualiza o estado local com os novos estoques
    if (Object.keys(updatedStocks).length > 0) {
      setProductsData((prev) => {
        const next = { ...prev };
        for (const [name, newStock] of Object.entries(updatedStocks)) {
          const info = next[name];
          if (!info) continue;
          next[name] = {
            ...info,
            stockQty: newStock,
            status: newStock <= 0 ? "inactive" : info.status,
          };
        }
        return next;
      });
    }
  };

  const handleSendWhatsApp = async () => {
    if (!event) return;

    if (!event.whatsapp) {
      alert("Nenhum número de WhatsApp configurado para este evento.");
      return;
    }

    const hasItems = getOrderableProductNames().some(
      (p) => (quantities[p] || 0) > 0
    );
    if (!hasItems) {
      alert("Selecione pelo menos 1 produto com quantidade.");
      return;
    }

    const message = buildOrderMessage();
    const encoded = encodeURIComponent(message);
    const phone = event.whatsapp.replace(/\D/g, "");
    const url = `https://wa.me/${phone}?text=${encoded}`;

    try {
      await registerOrderInFirestore("whatsapp");
      resetForm();
      openExternalLink(url);
    } catch (err: any) {
      console.error("Erro ao registrar pedido:", err);
      alert(err?.message || "Erro ao registrar pedido. Tente novamente.");
    }
  };

  const handleSendMessenger = async () => {
    if (!event) return;

    if (!event.messengerId) {
      alert("Nenhum contato de Messenger configurado para este evento.");
      return;
    }

    const hasItems = getOrderableProductNames().some(
      (p) => (quantities[p] || 0) > 0
    );
    if (!hasItems) {
      alert("Selecione pelo menos 1 produto com quantidade.");
      return;
    }

    const message = buildOrderMessage();
    const encoded = encodeURIComponent(message);
    const url = `https://m.me/${event.messengerId}?text=${encoded}`;

    try {
      await registerOrderInFirestore("messenger");
      resetForm();
      openExternalLink(url);
    } catch (err: any) {
      console.error("Erro ao registrar pedido:", err);
      alert(err?.message || "Erro ao registrar pedido. Tente novamente.");
    }
  };

  // 🔹 Texto base para compartilhar evento
  const buildShareText = () =>
    event
      ? `Dá uma olhada nesse evento de salgados: ${event.title}`
      : "Veja este evento de salgados!";

  const handleShareEventWhatsApp = () => {
    if (!currentUrl) return;
    const text = `${buildShareText()}\n${currentUrl}`;
    const encoded = encodeURIComponent(text);
    const url = `https://wa.me/?text=${encoded}`;
    window.open(url, "_blank");
  };

  const handleShareEventLine = () => {
    if (!currentUrl) return;
    const encodedUrl = encodeURIComponent(currentUrl);
    const url = `https://social-plugins.line.me/lineit/share?url=${encodedUrl}`;
    window.open(url, "_blank");
  };

  const handleShareEventMessenger = async () => {
    if (!currentUrl) return;
    const text = `${buildShareText()}\n${currentUrl}`;
    await copyToClipboard(text);

    const encodedUrl = encodeURIComponent(currentUrl);
    const deepLink = `fb-messenger://share?link=${encodedUrl}`;
    const webFallback = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;

    // tenta app
    openExternalLink(deepLink);
    // fallback web
    setTimeout(() => {
      openExternalLink(webFallback);
    }, 600);
  };

  const handleCopyEventLink = async () => {
    if (!currentUrl) return;
    const text = `${buildShareText()}\n${currentUrl}`;
    await copyToClipboard(text);
  };

  if (loading) {
    return (
      <main className="space-y-2">
        <p>Carregando evento...</p>
      </main>
    );
  }

  if (notFound || !event) {
    return (
      <main className="space-y-2">
        <h1 className="text-xl font-bold">Evento não encontrado</h1>
        <p className="text-sm text-neutral-600">
          Verifique se o link está correto ou consulte a vendedora.
        </p>
      </main>
    );
  }

  if (event.status === "cancelled") {
    return (
      <main className="space-y-4">
        <header className="space-y-1 border-b pb-4">
          <h1 className="text-2xl font-bold">{event.title}</h1>
          <p className="text-sm text-neutral-700">
            Região: {event.region}
            <br />
            Data(s): {event.deliveryDateLabel}
          </p>
        </header>
        <p className="text-sm text-red-600">
          Este evento foi cancelado. Entre em contato com a vendedora para mais
          informações.
        </p>
      </main>
    );
  }

  // 🔹 Garante ordem alfabética dos nomes (apenas produtos do evento, para o grid principal)
  const sortedProductNames = [...event.productNames].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

  // 🔹 Agrupa por categoria usando os dados de productsData
  const groupedByCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: sortedProductNames.filter(
      (name) => productsData[name]?.category === cat
    ),
  }));

  // produtos que não têm categoria (fallback)
  const uncategorized = sortedProductNames.filter(
    (name) => !productsData[name]?.category
  );

  // 🔹 Destaques (carrossel) – pode ter produtos fora do evento
  const featuredProducts = event.featuredProductNames || [];

  // total estimado no front (usando todos os produtos que podem ser pedidos)
  const totalAmount = getOrderableProductNames().reduce((sum, p) => {
    const q = quantities[p] || 0;
    const price = productsData[p]?.price || 0;
    return sum + q * price;
  }, 0);

  return (
    <main className="space-y-6">
      {/* CABEÇALHO */}
      <header className="space-y-2 border-b pb-4">
        <h1 className="text-2xl font-bold">{event.title}</h1>
        <p className="text-sm text-neutral-700">
          Região: {event.region}
          <br />
          Data(s) de entrega: {event.deliveryDateLabel}
        </p>

        {event.pickupLink && (
          <p className="text-xs text-blue-700">
            Local de retirada:{" "}
            <a
              href={event.pickupLink}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              ver mapa
            </a>
          </p>
        )}

        {event.pickupNote && (
          <p className="text-xs text-neutral-600">
            Instruções da vendedora: {event.pickupNote}
          </p>
        )}

        <p className="text-xs text-neutral-500">
          Este link é exclusivo deste evento e desta vendedora.
        </p>
      </header>

      {/* CARROSSEL DE DESTAQUES */}
      {featuredProducts.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold text-xl">🔥 Destaques do evento 🔥</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {featuredProducts.map((name) => {
              const info = productsData[name];
              const qty = quantities[name] ?? 0;

              const stock =
                typeof info?.stockQty === "number" ? info.stockQty : null;
              const isOutOfStock =
                stock !== null && Number.isFinite(stock) && stock <= 0;

              const lowStockThreshold =
                typeof info?.lowStockThreshold === "number"
                  ? info.lowStockThreshold
                  : 3;

              const showFewLeft =
                stock !== null &&
                Number.isFinite(stock) &&
                stock > 0 &&
                stock <= lowStockThreshold;

              return (
                <div
                  key={name}
                  className="min-w-[220px] max-w-[260px] border rounded-xl bg-white p-3 flex flex-col gap-2 text-sm shadow-sm"
                >
                  {info?.imageUrl ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (info) {
                          setGalleryProduct(info);
                          setGalleryIndex(0);
                        }
                      }}
                      className="w-full rounded-md overflow-hidden bg-neutral-100 aspect-[4/3] border border-neutral-200"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={info.imageUrl}
                        alt={name}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="w-full rounded-md overflow-hidden bg-neutral-100 aspect-[4/3] border border-dashed border-neutral-200 flex items-center justify-center text-[11px] text-neutral-400">
                      Sem imagem
                    </div>
                  )}

                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold leading-snug truncate">
                      {name}
                    </p>
                    {info?.price != null && !Number.isNaN(info.price) && (
                      <p className="text-xs text-neutral-600">
                        ¥{info.price.toLocaleString("ja-JP")}
                      </p>
                    )}

                    {stock !== null && (
                      <p className="text-[11px] text-neutral-600">
                        {stock <= 0 ? (
                          <span className="text-red-600 font-semibold">
                            Esgotado
                          </span>
                        ) : (
                          <>
                            Disponível:{" "}
                            <span className="font-semibold">
                              {stock} unidade
                              {stock > 1 ? "s" : ""}
                            </span>
                          </>
                        )}
                      </p>
                    )}

                    {showFewLeft && !isOutOfStock && (
                      <p className="text-[11px] text-orange-600 font-semibold">
                        🔥 Poucas unidades restantes!
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-neutral-600">
                      Quantidade
                    </span>
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => adjustQuantity(name, -1)}
                        className="h-7 w-7 rounded-full border border-neutral-300 text-sm flex items-center justify-center hover:bg-neutral-100"
                      >
                        -
                      </button>
                      <span className="min-w-[1.5rem] text-center text-sm">
                        {qty}
                      </span>
                      <button
                        type="button"
                        disabled={isOutOfStock}
                        onClick={() => {
                          if (!isOutOfStock) adjustQuantity(name, 1);
                        }}
                        className={`h-7 w-7 rounded-full border text-sm flex items-center justify-center ${
                          isOutOfStock
                            ? "border-neutral-200 text-neutral-300 cursor-not-allowed"
                            : "border-neutral-300 hover:bg-neutral-100"
                        }`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* PRODUTOS EM GRID, AGRUPADOS POR CATEGORIA */}
      <section className="space-y-4">
        <h2 className="font-semibold text-lg">Produtos disponíveis</h2>
        {sortedProductNames.length === 0 ? (
          <p className="text-sm text-neutral-600">
            Nenhum produto configurado para este evento.
          </p>
        ) : (
          <>
            {groupedByCategory.map(({ cat, items }) =>
              items.length === 0 ? null : (
                <div key={cat} className="space-y-2">
                  <h3 className="text-sm font-semibold text-neutral-800">
                    {cat}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {items.map((product) => {
                      const info = productsData[product];
                      const qty = quantities[product] ?? 0;

                      const stock =
                        typeof info?.stockQty === "number"
                          ? info.stockQty
                          : null;
                      const isOutOfStock =
                        stock !== null &&
                        Number.isFinite(stock) &&
                        stock <= 0;

                      const lowStockThreshold =
                        typeof info?.lowStockThreshold === "number"
                          ? info.lowStockThreshold
                          : 3;

                      const showFewLeft =
                        stock !== null &&
                        Number.isFinite(stock) &&
                        stock > 0 &&
                        stock <= lowStockThreshold;

                      return (
                        <div
                          key={product}
                          className="border rounded-xl bg-white p-3 flex flex-col gap-2 text-sm"
                        >
                          {info?.imageUrl ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (info) {
                                  setGalleryProduct(info);
                                  setGalleryIndex(0);
                                }
                              }}
                              className="w-full rounded-md overflow-hidden bg-neutral-100 aspect-[4/3] border border-neutral-200"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={info.imageUrl}
                                alt={product}
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ) : (
                            <div className="w-full rounded-md overflow-hidden bg-neutral-100 aspect-[4/3] border border-dashed border-neutral-200 flex items-center justify-center text-[11px] text-neutral-400">
                              Sem imagem
                            </div>
                          )}

                          <button
                            type="button"
                            className="text-left flex-1 space-y-0.5"
                            onClick={() => {
                              if (
                                info?.imageUrl ||
                                info?.extraImageUrls?.length
                              ) {
                                setGalleryProduct(info);
                                setGalleryIndex(0);
                              }
                            }}
                          >
                            <span className="block text-xs font-semibold leading-snug">
                              {product}
                            </span>
                            {info?.price != null &&
                              !Number.isNaN(info.price) && (
                                <span className="block text-xs text-neutral-600">
                                  ¥{info.price.toLocaleString("ja-JP")}
                                </span>
                              )}

                            {stock !== null && (
                              <>
                                <span className="block text-[11px] text-neutral-600">
                                  {stock <= 0 ? (
                                    <span className="text-red-600 font-semibold">
                                      Esgotado
                                    </span>
                                  ) : (
                                    <>
                                      Disponível:{" "}
                                      <span className="font-semibold">
                                        {stock} unidade
                                        {stock > 1 ? "s" : ""}
                                      </span>
                                    </>
                                  )}
                                </span>
                                {showFewLeft && !isOutOfStock && (
                                  <span className="block text-[11px] text-orange-600 font-semibold">
                                    🔥 Poucas unidades restantes!
                                  </span>
                                )}
                              </>
                            )}
                          </button>

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-neutral-600">
                              Quantidade
                            </span>
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => adjustQuantity(product, -1)}
                                className="h-7 w-7 rounded-full border border-neutral-300 text-sm flex items-center justify-center hover:bg-neutral-100"
                              >
                                -
                              </button>
                              <span className="min-w-[1.5rem] text-center text-sm">
                                {qty}
                              </span>
                              <button
                                type="button"
                                disabled={isOutOfStock}
                                onClick={() => {
                                  if (!isOutOfStock)
                                    adjustQuantity(product, 1);
                                }}
                                className={`h-7 w-7 rounded-full border text-sm flex items-center justify-center ${
                                  isOutOfStock
                                    ? "border-neutral-200 text-neutral-300 cursor-not-allowed"
                                    : "border-neutral-300 hover:bg-neutral-100"
                                }`}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            )}

            {uncategorized.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-neutral-800">
                  Outros
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {uncategorized.map((product) => {
                    const info = productsData[product];
                    const qty = quantities[product] ?? 0;

                    const stock =
                      typeof info?.stockQty === "number"
                        ? info.stockQty
                        : null;
                    const isOutOfStock =
                      stock !== null &&
                      Number.isFinite(stock) &&
                      stock <= 0;

                    const lowStockThreshold =
                      typeof info?.lowStockThreshold === "number"
                        ? info.lowStockThreshold
                        : 3;

                    const showFewLeft =
                      stock !== null &&
                      Number.isFinite(stock) &&
                      stock > 0 &&
                      stock <= lowStockThreshold;

                    return (
                      <div
                        key={product}
                        className="border rounded-xl bg-white p-3 flex flex-col gap-2 text-sm"
                      >
                        {info?.imageUrl ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (info) {
                                setGalleryProduct(info);
                                setGalleryIndex(0);
                              }
                            }}
                            className="w-full rounded-md overflow-hidden bg-neutral-100 aspect-[4/3] border border-neutral-200"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={info.imageUrl}
                              alt={product}
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ) : (
                          <div className="w-full rounded-md overflow-hidden bg-neutral-100 aspect-[4/3] border border-dashed border-neutral-200 flex items-center justify-center text-[11px] text-neutral-400">
                            Sem imagem
                          </div>
                        )}
                        <span className="block text-xs font-semibold leading-snug">
                          {product}
                        </span>
                        {info?.price != null && !Number.isNaN(info.price) && (
                          <span className="block text-xs text-neutral-600">
                            ¥{info.price.toLocaleString("ja-JP")}
                          </span>
                        )}
                        {stock !== null && (
                          <>
                            <span className="block text-[11px] text-neutral-600">
                              {stock <= 0 ? (
                                <span className="text-red-600 font-semibold">
                                  Esgotado
                                </span>
                              ) : (
                                <>
                                  Disponível:{" "}
                                  <span className="font-semibold">
                                    {stock} unidade
                                    {stock > 1 ? "s" : ""}
                                  </span>
                                </>
                              )}
                            </span>
                            {showFewLeft && !isOutOfStock && (
                              <span className="block text-[11px] text-orange-600 font-semibold">
                                🔥 Poucas unidades restantes!
                              </span>
                            )}
                          </>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-neutral-600">
                            Quantidade
                          </span>
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => adjustQuantity(product, -1)}
                              className="h-7 w-7 rounded-full border border-neutral-300 text-sm flex items-center justify-center hover:bg-neutral-100"
                            >
                              -
                            </button>
                            <span className="min-w-[1.5rem] text-center text-sm">
                              {qty}
                            </span>
                            <button
                              type="button"
                              disabled={isOutOfStock}
                              onClick={() => {
                                if (!isOutOfStock)
                                  adjustQuantity(product, 1);
                              }}
                              className={`h-7 w-7 rounded-full border text-sm flex items-center justify-center ${
                                isOutOfStock
                                  ? "border-neutral-200 text-neutral-300 cursor-not-allowed"
                                  : "border-neutral-300 hover:bg-neutral-100"
                              }`}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* DADOS DO CLIENTE + ENTREGA */}
      <section className="space-y-3 border rounded-md p-4 bg-white">
        <h2 className="font-semibold text-sm">Seus dados</h2>
        <div className="space-y-3">
          {/* Nome */}
          <div className="space-y-1">
            <label className="text-xs block">Seu nome</label>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Ex: João"
            />
          </div>

          {/* Escolha de data + horário */}
          <div className="space-y-2 border rounded-md p-3 bg-neutral-50">
            <h3 className="text-xs font-semibold">Escolha o dia de entrega:</h3>

            {/* Datas do evento */}
            {event.deliveryDates.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {event.deliveryDates.map((d) => {
                  const isSelected =
                    dateOption === "event-date" && selectedDate === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setDateOption("event-date");
                        setSelectedDate(d);
                      }}
                      className={`px-3 py-1 rounded-full text-xs border transition ${
                        isSelected
                          ? "bg-black text-white border-black"
                          : "bg-white text-neutral-800 border-neutral-300 hover:bg-neutral-100"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setDateOption("other-date")}
                  className={`px-3 py-1 rounded-full text-xs border transition ${
                    dateOption === "other-date"
                      ? "bg-black text-white border-black"
                      : "bg-white text-neutral-800 border-neutral-300 hover:bg-neutral-100"
                  }`}
                >
                  Outro dia
                </button>

                {dateOption === "other-date" && (
                  <input
                    type="date"
                    className="border rounded-md px-2 py-1 text-xs"
                    value={otherDate}
                    onChange={(e) => setOtherDate(e.target.value)}
                  />
                )}

                <button
                  type="button"
                  onClick={() => {
                    setDateOption("no-preference");
                    setOtherDate("");
                  }}
                  className={`px-3 py-1 rounded-full text-xs border transition ${
                    dateOption === "no-preference"
                      ? "bg-black text-white border-black"
                      : "bg-white text-neutral-800 border-neutral-300 hover:bg-neutral-100"
                  }`}
                >
                  Sem preferência
                </button>
              </div>
            )}

            {/* Picker de horário */}
            <div className="space-y-2 pt-3 border-t border-neutral-200">
              <h4 className="text-xs font-semibold">Horário de entrega</h4>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTimeOption("no-preference");
                    setSelectedHour(null);
                    setSelectedMinute(null);
                  }}
                  className={`px-3 py-1 rounded-full text-xs border transition ${
                    timeOption === "no-preference"
                      ? "bg-black text-white border-black"
                      : "bg-white text-neutral-800 border-neutral-300 hover:bg-neutral-100"
                  }`}
                >
                  Sem preferência
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTimeOption("custom");
                    if (selectedHour == null) setSelectedHour(10);
                    if (selectedMinute == null) setSelectedMinute(0);
                    setTimePickerOpen(true);
                  }}
                  className={`px-3 py-1 rounded-full text-xs border transition ${
                    timeOption === "custom"
                      ? "bg-black text-white border-black"
                      : "bg-white text-neutral-800 border-neutral-300 hover:bg-neutral-100"
                  }`}
                >
                  Escolher horário
                </button>
                {/* Horário escolhido */}
                <span className="px-3 py-1 rounded-full text-xs bg-neutral-100 border border-neutral-200 text-neutral-800">
                  {getChosenTimeLabel()}
                </span>
              </div>
            </div>
          </div>

          {/* Modo de entrega */}
          <div className="space-y-2 border rounded-md p-3 bg-neutral-50">
            <h3 className="text-xs font-semibold">Modo de entrega:</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDeliveryMode("delivery")}
                className={`px-3 py-1 rounded-full text-xs border transition ${
                  deliveryMode === "delivery"
                    ? "bg-green-600 text-white border-green-600"
                    : "bg-white text-neutral-800 border-neutral-300 hover:bg-neutral-100"
                }`}
              >
                Entrega
              </button>
              <button
                type="button"
                onClick={() => setDeliveryMode("pickup")}
                className={`px-3 py-1 rounded-full text-xs border transition ${
                  deliveryMode === "pickup"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-neutral-800 border-neutral-300 hover:bg-neutral-100"
                }`}
              >
                Retirada no local
              </button>
              <button
                type="button"
                onClick={() => setDeliveryMode("none")}
                className={`px-3 py-1 rounded-full text-xs border transition ${
                  deliveryMode === "none"
                    ? "bg-black text-white border-black"
                    : "bg-white text-neutral-800 border-neutral-300 hover:bg-neutral-100"
                }`}
              >
                A combinar
              </button>
            </div>

            {/* Entrega: localização + observação */}
            {deliveryMode === "delivery" && (
              <div className="space-y-3 pt-2 border-t border-neutral-200">
                <div className="space-y-1">
                  <p className="text-[11px] text-neutral-600">
                    Você pode enviar sua localização atual para a vendedora.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleGetLocation}
                      disabled={gettingLocation}
                      className="px-3 py-1 rounded-full text-xs border bg-white hover:bg-neutral-100 disabled:opacity-60"
                    >
                      {gettingLocation
                        ? "Obtendo localização..."
                        : "Usar minha localização"}
                    </button>
                    {locationLink && (
                      <a
                        href={locationLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-blue-600 underline break-all"
                      >
                        Ver localização no mapa
                      </a>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs block">
                    Observação (endereço, detalhes, etc.) – opcional
                  </label>
                  <textarea
                    className="w-full border rounded-md px-3 py-2 text-sm min-h-[80px]"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ex: Entregar na fábrica X, portaria principal, intervalo das 15h."
                  />
                </div>
              </div>
            )}

            {/* Retirada: mostrar apenas link do mapa da vendedora */}
            {deliveryMode === "pickup" && (
              <div className="space-y-1 pt-2 border-t border-neutral-200">
                <p className="text-[11px] text-neutral-600">
                  Retirada será feita no local definido pela vendedora:
                </p>
                {event.pickupLink ? (
                  <a
                    href={event.pickupLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-600 underline break-all"
                  >
                    Abrir mapa da retirada
                  </a>
                ) : (
                  <p className="text-[11px] text-neutral-500">
                    A vendedora ainda não definiu o link de retirada. Confirme
                    diretamente com ela.
                  </p>
                )}
              </div>
            )}

            {/* A combinar: apenas observação */}
            {deliveryMode === "none" && (
              <div className="space-y-1 pt-2 border-t border-neutral-200">
                <label className="text-xs block">
                  Observação (como combinar a entrega) – opcional
                </label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[80px]"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ex: Podemos combinar o local e horário pelo WhatsApp."
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* RESUMO E BOTÕES DE ENVIO */}
      <section className="space-y-3">
        {totalAmount > 0 && (
          <p className="text-sm font-semibold text-neutral-800">
            Total estimado do pedido:{" "}
              <span className="text-green-700">
                ¥{totalAmount.toLocaleString("ja-JP")}
              </span>
          </p>
        )}

        <button
          onClick={handleSendWhatsApp}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-md text-sm"
        >
          Enviar pedido pelo WhatsApp
        </button>

        {event.messengerId && (
          <button
            onClick={handleSendMessenger}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-md text-sm"
          >
            Enviar pedido pelo Messenger
          </button>
        )}

        <p className="mt-2 text-xs text-neutral-500">
          Ao clicar, abriremos o aplicativo escolhido com seu pedido já
          preenchido para a vendedora deste evento.
        </p>

        {/* COMPARTILHAR EVENTO – sempre visível */}
        <div className="mt-4 border rounded-lg p-3 bg-neutral-50 space-y-2">
          <p className="text-xs text-neutral-700">
            Compartilhe este evento com seus amigos:
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleShareEventWhatsApp}
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-green-600 text-white hover:bg-green-700"
            >
              WhatsApp
            </button>
            <button
              type="button"
              onClick={handleShareEventMessenger}
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
            >
              Messenger
            </button>
            <button
              type="button"
              onClick={handleShareEventLine}
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-green-500 text-white hover:bg-green-600"
            >
              LINE
            </button>
            <button
              type="button"
              onClick={handleCopyEventLink}
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-black text-white hover:bg-neutral-900"
            >
              Copiar link
            </button>
          </div>
          <p className="text-[11px] text-neutral-500">
            Em alguns aparelhos o texto será apenas copiado. É só abrir a
            conversa e colar.
          </p>
        </div>
      </section>

      {/* MODAL DO HORÁRIO – agora com input numérico */}
      {timePickerOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xs rounded-xl bg-white p-4 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Escolher horário</h3>
              <button
                type="button"
                onClick={() => setTimePickerOpen(false)}
                className="text-[11px] text-neutral-500"
              >
                Fechar
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-[11px] text-neutral-600">
                    Hora (0–23)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="\d*"
                    min={0}
                    max={23}
                    className="w-full border rounded-md px-2 py-1 text-sm"
                    value={selectedHour ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        setSelectedHour(null);
                        return;
                      }
                      const n = Number(val);
                      if (Number.isNaN(n)) return;
                      if (n < 0 || n > 23) return;
                      setSelectedHour(n);
                    }}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-[11px] text-neutral-600">
                    Minutos (0–59)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="\d*"
                    min={0}
                    max={59}
                    className="w-full border rounded-md px-2 py-1 text-sm"
                    value={selectedMinute ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        setSelectedMinute(null);
                        return;
                      }
                      const n = Number(val);
                      if (Number.isNaN(n)) return;
                      if (n < 0 || n > 59) return;
                      setSelectedMinute(n);
                    }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-neutral-500">
                Exemplo: 10:00, 15:30, 19:45
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setTimeOption("no-preference");
                  setSelectedHour(null);
                  setSelectedMinute(null);
                  setTimePickerOpen(false);
                }}
                className="px-3 py-1.5 rounded-full text-xs border border-neutral-300 text-neutral-700 hover:bg-neutral-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  // se usuário não preencheu, define um padrão
                  if (selectedHour == null) setSelectedHour(10);
                  if (selectedMinute == null) setSelectedMinute(0);
                  setTimeOption("custom");
                  setTimePickerOpen(false);
                }}
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-black text-white hover:bg-neutral-900"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE GALERIA DE IMAGENS */}
      {galleryProduct && galleryImages.length > 0 && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="max-w-sm w-full bg-white rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{galleryProduct.name}</h3>
              <button
                type="button"
                onClick={() => setGalleryProduct(null)}
                className="text-[11px] text-neutral-600 underline"
              >
                Fechar
              </button>
            </div>
            <div className="w-full rounded-lg overflow-hidden bg-neutral-100 aspect-[4/3]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={galleryImages[galleryIndex]}
                alt={galleryProduct.name}
                className="h-full w-full object-cover"
              />
            </div>
            {galleryImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pt-1">
                {galleryImages.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setGalleryIndex(idx)}
                    className={`h-12 w-12 rounded-md overflow-hidden border flex-shrink-0 ${
                      idx === galleryIndex
                        ? "border-orange-500"
                        : "border-neutral-200"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img}
                      alt={`Foto ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
