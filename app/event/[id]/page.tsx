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
} from "firebase/firestore";

// 🔹 Mesmas categorias usadas no catálogo
type CategoryType =
  | "Comida"
  | "Lanchonete"
  | "Assados"
  | "Sobremesa"
  | "Festa"
  | "Congelados";

const CATEGORY_ORDER: CategoryType[] = [
  "Comida",
  "Lanchonete",
  "Assados",
  "Sobremesa",
  "Festa",
  "Congelados",
];

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
};

type ProductImageData = {
  name: string;
  imageUrl: string;
  extraImageUrls: string[];
  price?: number;
  category?: CategoryType;
};

type Props = {
  params: Promise<{ id: string }>;
};

export default function EventPage({ params }: Props) {
  const { id } = use(params);

  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [note, setNote] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // 🔹 escolha de data de entrega (quando tiver mais de uma)
  const [selectedDate, setSelectedDate] = useState<string>("");

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
        const messengerId: string =
          data.messengerId || data.messenger || "";

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
        });

        // quantidades iniciais
        const initialQty: Record<string, number> = {};
        products.forEach((p) => {
          initialQty[p] = 0;
        });
        setQuantities(initialQty);

        // data de entrega padrão (primeira)
        if (deliveryDates.length > 0) {
          setSelectedDate(deliveryDates[0]);
        }

        // 🔍 Carrega imagens, preço e categoria dos produtos a partir da coleção "products"
        const imagesMap: Record<string, ProductImageData> = {};

        await Promise.all(
          products.map(async (name) => {
            try {
              const qProd = query(
                collection(db, "products"),
                where("name", "==", name)
              );
              const snapProducts = await getDocs(qProd);
              if (!snapProducts.empty) {
                const docData = snapProducts.docs[0].data() as any;
                const extras = Array.isArray(docData.extraImageUrls)
                  ? (docData.extraImageUrls as unknown[])
                      .filter((u) => typeof u === "string")
                      .map((u) => (u as string).trim())
                      .filter((u) => u.length > 0)
                  : [];

                imagesMap[name] = {
                  name,
                  imageUrl: docData.imageUrl || "",
                  extraImageUrls: extras,
                  price:
                    typeof docData.price === "number"
                      ? docData.price
                      : Number(docData.price || 0),
                  category: (docData.category as CategoryType) || "Comida",
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

  const handleQuantityChange = (product: string, value: string) => {
    const num = Number(value);
    if (isNaN(num) || num < 0) return;
    setQuantities((prev) => ({
      ...prev,
      [product]: num,
    }));
  };

  // 🔹 controles tipo carrinho: - 0 +
  const adjustQuantity = (product: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[product] || 0;
      const next = current + delta;
      if (next < 0) return prev;
      return {
        ...prev,
        [product]: next,
      };
    });
  };

  // 🔹 Monta o texto do pedido
  const buildOrderMessage = () => {
    if (!event) return "";

    const selectedItems = event.productNames
      .filter((p) => (quantities[p] || 0) > 0)
      .map((p) => `${p}: ${quantities[p]}`);

    const chosenDate = selectedDate || event.deliveryDateLabel;

    const lines = [
      `Olá, gostaria de fazer um pedido para o evento: ${event.title}`,
      `Região: ${event.region}`,
      `Data de entrega: ${chosenDate}`,
      "",
      `Nome: ${customerName || "(não informado)"}`,
      "",
      "Itens:",
      ...selectedItems.map((l) => `- ${l}`),
    ];

    if (event.pickupLink) {
      lines.push("", `Endereço / retirada: ${event.pickupLink}`);
    }
    if (event.pickupNote) {
      lines.push("", `Instruções da vendedora: ${event.pickupNote}`);
    }

    if (note.trim()) {
      lines.push("", "Obs. do cliente:", note.trim());
    }

    // total da compra
    const totalAmount = event.productNames.reduce((sum, p) => {
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

  // 🔹 Registra o pedido no Firestore (WhatsApp / Messenger)
  const registerOrderInFirestore = async (
    channel: "whatsapp" | "messenger"
  ) => {
    if (!event) return;

    const quantitiesClean: Record<string, number> = {};
    event.productNames.forEach((p) => {
      const q = quantities[p] || 0;
      if (q > 0) quantitiesClean[p] = q;
    });

    const totalItems = Object.values(quantitiesClean).reduce(
      (sum, q) => sum + Number(q || 0),
      0
    );

    const chosenDate = selectedDate || event.deliveryDateLabel;

    try {
      await addDoc(collection(db, "events", id, "orders"), {
        customerName: customerName || "",
        note: note || "",
        quantities: quantitiesClean,
        totalItems,
        status: "pending",
        channel,
        deliveryDate: chosenDate,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Erro ao registrar pedido no painel:", err);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!event) return;

    if (!event.whatsapp) {
      alert("Nenhum número de WhatsApp configurado para este evento.");
      return;
    }

    const selectedItems = event.productNames.filter(
      (p) => (quantities[p] || 0) > 0
    );
    if (selectedItems.length === 0) {
      alert("Selecione pelo menos 1 produto com quantidade.");
      return;
    }

    const message = buildOrderMessage();
    const encoded = encodeURIComponent(message);
    const phone = event.whatsapp.replace(/\D/g, "");
    const url = `https://wa.me/${phone}?text=${encoded}`;

    await registerOrderInFirestore("whatsapp");
    window.open(url, "_blank");
  };

  const handleSendMessenger = async () => {
    if (!event) return;

    if (!event.messengerId) {
      alert("Nenhum contato de Messenger configurado para este evento.");
      return;
    }

    const selectedItems = event.productNames.filter(
      (p) => (quantities[p] || 0) > 0
    );
    if (selectedItems.length === 0) {
      alert("Selecione pelo menos 1 produto com quantidade.");
      return;
    }

    const message = buildOrderMessage();
    const encoded = encodeURIComponent(message);

    const url = `https://m.me/${event.messengerId}?text=${encoded}`;

    await registerOrderInFirestore("messenger");
    window.open(url, "_blank");
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
          Este evento foi cancelado. Entre em contato com a vendedora para
          mais informações.
        </p>
      </main>
    );
  }

  // 🔹 Garante ordem alfabética dos nomes
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

  // total estimado no front
  const totalAmount = event.productNames.reduce((sum, p) => {
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

      {/* ESCOLHA DE DATA (quando houver mais de uma) */}
      {event.deliveryDates.length > 1 && (
        <section className="space-y-2 border rounded-md p-3 bg-white">
          <h2 className="text-sm font-semibold">Escolha o dia de entrega</h2>
          <div className="flex flex-wrap gap-2">
            {event.deliveryDates.map((d) => {
              const isSelected = selectedDate === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDate(d)}
                  className={`px-3 py-1 rounded-full text-xs border transition ${
                    isSelected
                      ? "bg-black text-white border-black"
                      : "bg-neutral-100 text-neutral-800 border-neutral-300 hover:bg-neutral-200"
                  }`}
                >
                  {d}
                </button>
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

                      return (
                        <div
                          key={product}
                          className="border rounded-xl bg-white p-3 flex flex-col gap-2 text-sm"
                        >
                          {/* Imagem / botão para abrir galeria */}
                          {info?.imageUrl ? (
                            <button
                              type="button"
                              onClick={() => {
                                setGalleryProduct(info);
                                setGalleryIndex(0);
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

                          {/* Nome + preço (também abre galeria se tiver imagens) */}
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
                          </button>

                          {/* Controles tipo carrinho: - QTD + */}
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
                                onClick={() => adjustQuantity(product, 1)}
                                className="h-7 w-7 rounded-full border border-neutral-300 text-sm flex items-center justify-center hover:bg-neutral-100"
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

            {/* Produtos sem categoria (se existir algum) */}
            {uncategorized.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-neutral-800">
                  Outros
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {uncategorized.map((product) => {
                    const info = productsData[product];
                    const qty = quantities[product] ?? 0;

                    return (
                      <div
                        key={product}
                        className="border rounded-xl bg-white p-3 flex flex-col gap-2 text-sm"
                      >
                        {info?.imageUrl ? (
                          <button
                            type="button"
                            onClick={() => {
                              setGalleryProduct(info);
                              setGalleryIndex(0);
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

                        {info?.price != null &&
                          !Number.isNaN(info.price) && (
                            <span className="block text-xs text-neutral-600">
                              ¥{info.price.toLocaleString("ja-JP")}
                            </span>
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
                              onClick={() => adjustQuantity(product, 1)}
                              className="h-7 w-7 rounded-full border border-neutral-300 text-sm flex items-center justify-center hover:bg-neutral-100"
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

      {/* DADOS DO CLIENTE */}
      <section className="space-y-3 border rounded-md p-4 bg-white">
        <h2 className="font-semibold text-sm">Seus dados</h2>
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-xs block">Seu nome (opcional)</label>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Ex: João"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs block">
              Observação (endereço, horário, etc.) – opcional
            </label>
            <textarea
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[80px]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: Entregar na fábrica X, portaria principal, intervalo das 15h."
            />
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
      </section>

      {/* MODAL DE GALERIA DE IMAGENS */}
      {galleryProduct && galleryImages.length > 0 && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="max-w-sm w-full bg-white rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {galleryProduct.name}
              </h3>
              <button
                type="button"
                onClick={() => setGalleryProduct(null)}
                className="text-[11px] text-neutral-600 underline"
              >
                Fechar
              </button>
            </div>

            {/* imagem principal */}
            <div className="w-full rounded-lg overflow-hidden bg-neutral-100 aspect-[4/3]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={galleryImages[galleryIndex]}
                alt={galleryProduct.name}
                className="h-full w-full object-cover"
              />
            </div>

            {/* miniaturas */}
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
