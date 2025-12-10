"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import {
  onAuthStateChanged,
  type User,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  serverTimestamp,
} from "firebase/firestore";
import Link from "next/link";

type EventDoc = {
  id: string;
  title: string;
  region: string;
  sellerName: string;
  deliveryDates: string[];
  deliveryDateLabel: string;
  whatsapp: string;
  productNames: string[];
  status: string;
  pickupUrl?: string;
  pickupNote?: string;
  messengerId?: string;
};

type OrderDoc = {
  id: string;
  customerName: string;
  totalItems: number;
  status: "pending" | "delivered" | string;
  note: string;
  createdAt: Date | null;
  quantities: Record<string, number>;
};

type ProductDoc = {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  category: string;
};

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // passo (1 = dados do evento, 2 = produtos)
  const [step, setStep] = useState<1 | 2>(1);

  // refs para rolagem suave
  const formRef = useRef<HTMLDivElement | null>(null);
  const ordersRef = useRef<HTMLDivElement | null>(null);

  // campos do evento
  const [eventId, setEventId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [region, setRegion] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [deliveryDates, setDeliveryDates] = useState<string[]>([""]);
  const [whatsapp, setWhatsapp] = useState("+819060703785");
  const [pickupUrl, setPickupUrl] = useState("");
  const [pickupNote, setPickupNote] = useState("");
  const [messengerId, setMessengerId] = useState("");

  // produtos disponíveis no sistema
  const [products, setProducts] = useState<ProductDoc[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [editingEventProductNames, setEditingEventProductNames] = useState<
    string[] | null
  >(null);

  // estado de envio
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(
    null
  );

  // lista de eventos do vendedor
  const [events, setEvents] = useState<EventDoc[]>([]);

  // pedidos do evento selecionado
  const [selectedEventForOrders, setSelectedEventForOrders] =
    useState<EventDoc | null>(null);
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const scrollToRef = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (typeof window === "undefined") return;
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // 🔐 login
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.replace("/login");
      } else {
        setUser(u);
        setSellerName(u.displayName || u.email || "");
        setCheckingAuth(false);
      }
    });
    return () => unsub();
  }, [router]);

  // 🔁 eventos desse vendedor
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "events"),
      where("sellerId", "==", user.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list: EventDoc[] = snap.docs.map((d) => {
        const data = d.data() as any;

        const deliveryDates: string[] = Array.isArray(data.deliveryDates)
          ? data.deliveryDates
          : data.deliveryDate
          ? [data.deliveryDate]
          : [];

        const deliveryDateLabel: string =
          data.deliveryDateLabel ||
          (Array.isArray(data.deliveryDates) &&
          data.deliveryDates.length > 0
            ? data.deliveryDates.join(" • ")
            : data.deliveryDate || "");

        const productNames: string[] = Array.isArray(data.productNames)
          ? data.productNames
          : [];

        const pickupUrl: string =
          data.pickupUrl || data.pickupLink || "";

        const messengerId: string =
          data.messengerId || data.messenger || "";

        return {
          id: d.id,
          title: data.title || "",
          region: data.region || "",
          sellerName: data.sellerName || "",
          deliveryDates,
          deliveryDateLabel,
          whatsapp: data.whatsapp || "",
          productNames,
          status: data.status || "active",
          pickupUrl,
          pickupNote: data.pickupNote || "",
          messengerId,
        };
      });

      list.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));

      setEvents(list);
    });

    return () => unsub();
  }, [user]);

  // 🔁 produtos do vendedor (categoria + ordem)
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "products"),
      where("sellerId", "==", user.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list: ProductDoc[] = snap.docs.map((d) => {
        const data = d.data() as any;

        const category: string =
          data.category || data.eventGroup || "Comida";

        return {
          id: d.id,
          name: data.name || "Produto",
          price:
            typeof data.price === "number"
              ? data.price
              : Number(data.price || 0),
          imageUrl: data.imageUrl || "",
          category,
        };
      });

      list.sort((a, b) => {
        const cat = a.category.localeCompare(b.category, "pt-BR");
        if (cat !== 0) return cat;
        return a.name.localeCompare(b.name, "pt-BR");
      });

      setProducts(list);
    });

    return () => unsub();
  }, [user]);

  // sincronizar seleção ao editar evento
  useEffect(() => {
    if (!editingEventProductNames || products.length === 0) return;

    const selectedIds = products
      .filter((p) => editingEventProductNames.includes(p.name))
      .map((p) => p.id);

    setSelectedProductIds(selectedIds);
  }, [products, editingEventProductNames]);

  // 🔁 pedidos do evento selecionado
  useEffect(() => {
    if (!selectedEventForOrders) {
      setOrders([]);
      return;
    }

    setOrdersLoading(true);
    const ref = collection(
      db,
      "events",
      selectedEventForOrders.id,
      "orders"
    );

    const unsub = onSnapshot(
      ref,
      (snap) => {
        const list: OrderDoc[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            customerName: data.customerName || "Cliente",
            totalItems:
              typeof data.totalItems === "number" ? data.totalItems : 0,
            status: data.status || "pending",
            note: data.note || "",
            createdAt: data.createdAt?.toDate
              ? data.createdAt.toDate()
              : null,
            quantities: data.quantities || {},
          };
        });

        list.sort((a, b) => {
          const ta = a.createdAt?.getTime() || 0;
          const tb = b.createdAt?.getTime() || 0;
          return tb - ta;
        });

        setOrders(list);
        setOrdersLoading(false);
      },
      () => {
        setOrders([]);
        setOrdersLoading(false);
      }
    );

    return () => unsub();
  }, [selectedEventForOrders]);

  const handleAddDate = () => {
    setDeliveryDates((prev) => [...prev, ""]);
  };

  const handleRemoveDate = (index: number) => {
    setDeliveryDates((prev) => prev.filter((_, i) => i !== index));
  };

  const handleChangeDate = (index: number, value: string) => {
    setDeliveryDates((prev) =>
      prev.map((d, i) => (i === index ? value : d))
    );
  };

  const handleGoToProducts = () => {
    setError(null);
    setSuccessMessage(null);

    if (!title.trim()) {
      setError("Informe o título do evento.");
      return;
    }
    if (!sellerName.trim()) {
      setError("Informe o nome do vendedor.");
      return;
    }
    if (!region.trim()) {
      setError("Informe a região / local do evento.");
      return;
    }
    const validDates = deliveryDates.filter((d) => d.trim() !== "");
    if (validDates.length === 0) {
      setError("Adicione pelo menos uma data de entrega.");
      return;
    }
    if (!whatsapp.trim()) {
      setError("Informe um número de WhatsApp.");
      return;
    }

    setDeliveryDates(validDates);
    setStep(2);
    scrollToRef(formRef);
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  const handleSaveEvent = async () => {
    if (!user) return;
    setError(null);
    setSuccessMessage(null);

    const selectedProducts = products.filter((p) =>
      selectedProductIds.includes(p.id)
    );

    if (selectedProducts.length === 0) {
      setError("Selecione pelo menos um produto para este evento.");
      return;
    }

    const trimmedDates = deliveryDates.filter((d) => d.trim() !== "");
    if (trimmedDates.length === 0) {
      setError("Adicione pelo menos uma data de entrega.");
      return;
    }

    const deliveryDateLabel = trimmedDates.join(" • ");

    const pickupValue = pickupUrl.trim();
    const messengerValue = messengerId.trim();

    const productNames = selectedProducts.map((p) => p.name);

    const payload = {
      title: title.trim(),
      region: region.trim(),
      sellerName: sellerName.trim(),
      sellerId: user.uid,
      sellerEmail: user.email || "",
      deliveryDates: trimmedDates,
      deliveryDateLabel,
      whatsapp: whatsapp.trim(),
      productNames,
      pickupUrl: pickupValue,
      pickupLink: pickupValue,
      pickupNote: pickupNote.trim(),
      messengerId: messengerValue,
      status: "active",
      updatedAt: serverTimestamp(),
    };

    setSaving(true);
    try {
      let id = eventId;

      if (eventId) {
        await updateDoc(doc(db, "events", eventId), payload);
      } else {
        const ref = await addDoc(collection(db, "events"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        id = ref.id;
        setEventId(id);
      }

      setSuccessMessage("Evento salvo com sucesso!");
    } catch (err) {
      console.error(err);
      setError("Não foi possível salvar o evento. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

const handleEditEvent = (ev: EventDoc) => {
  router.push(`/dashboard/events/${ev.id}`);
};

  const handleCancelEvent = async (id: string) => {
    const confirmCancel = window.confirm(
      "Deseja realmente cancelar este evento? Os clientes verão que o evento foi cancelado."
    );
    if (!confirmCancel) return;

    try {
      await updateDoc(doc(db, "events", id), {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
      alert("Não foi possível cancelar o evento.");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  const toggleOrderStatus = async (order: OrderDoc) => {
    if (!selectedEventForOrders) return;
    const newStatus =
      order.status === "delivered" ? "pending" : "delivered";
    try {
      await updateDoc(
        doc(
          db,
          "events",
          selectedEventForOrders.id,
          "orders",
          order.id
        ),
        {
          status: newStatus,
          updatedAt: serverTimestamp(),
        }
      );
    } catch (err) {
      console.error(err);
      alert("Não foi possível atualizar o status do pedido.");
    }
  };

  const pendingOrders = orders.filter((o) => o.status !== "delivered");
  const deliveredOrders = orders.filter((o) => o.status === "delivered");

  const pendingItemsTotal = pendingOrders.reduce((sum, o) => {
    return sum + (o.totalItems || 0);
  }, 0);

  if (checkingAuth) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center">
        <p className="text-sm text-neutral-600">Carregando painel...</p>
      </main>
    );
  }

  // 🔹 produtos por categoria
  const byCategory = (cat: string) =>
    products.filter(
      (p) => p.category && p.category.toLowerCase() === cat
    );

  const comidaProducts = byCategory("comida");
  const lanchoneteProducts = byCategory("lanchonete");
  const assadosProducts = byCategory("assados");
  const sobremesaProducts = byCategory("sobremesa");
  const festaProducts = byCategory("festa");
  const congeladosProducts = byCategory("congelados");

  // 🔹 GRID IGUAL AO DO CATÁLOGO
  const renderCategoryGrid = (
    label: string,
    items: ProductDoc[]
  ) => (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-neutral-800">
        {label}
      </h3>
      {items.length === 0 ? (
        <p className="text-[11px] text-neutral-500">
          Nenhum produto nessa categoria.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {items.map((p) => {
            const selected = selectedProductIds.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleProductSelection(p.id)}
                className={`border rounded-xl overflow-hidden flex flex-col text-xs text-left transition ${
                  selected
                    ? "border-green-600 bg-green-50"
                    : "border-neutral-200 bg-white hover:border-neutral-400"
                }`}
              >
                {/* IMAGEM com mesmo tamanho do catálogo */}
                <div className="w-full bg-neutral-100 overflow-hidden aspect-[4/3]">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-[10px] text-neutral-400">
                      Sem imagem
                    </div>
                  )}
                </div>

                {/* INFO igual estilo do ProductCard */}
                <div className="p-3 flex-1 flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold line-clamp-2">
                      {p.name}
                    </p>
                    <input
                      type="checkbox"
                      className="mt-1 h-3 w-3"
                      checked={selected}
                      readOnly
                    />
                  </div>
                  <p className="text-[11px] text-neutral-700">
                    ¥{p.price.toLocaleString("ja-JP")}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <main className="space-y-6">
      {/* topo */}
        
              <header className="border-b pb-4 flex items-center justify-between gap-4">

        <button
          type="button"
          onClick={() => router.push("/products")}
            className="bg-black text-white text-xs px-4 py-2 rounded-full"
        >
          Catálogo de produtos
        </button>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-xs font-medium">
            {sellerName || user?.email || "Vendedor"}
          </p>
          <p className="text-[10px] text-neutral-500">{user?.email}</p>
        </div>
        <button
          onClick={handleLogout}
            className="bg-red-500 text-white text-xs px-4 py-2 rounded-full"
        >
          Sair
        </button>
      </div>
          </header>

      {/* passos + formulário */}
      <section
        ref={formRef}
        className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-5 space-y-5"
      >
        <div className="flex gap-2 text-xs font-medium">
          <button
            className={`flex-1 rounded-full px-3 py-2 border ${
              step === 1
                ? "bg-black text-white border-black"
                : "bg-neutral-100 text-neutral-700 border-neutral-200"
            }`}
            onClick={() => {
              setStep(1);
              scrollToRef(formRef);
            }}
          >
            1. Dados do evento
          </button>
          <button
            className={`flex-1 rounded-full px-3 py-2 border ${
              step === 2
                ? "bg-black text-white border-black"
                : "bg-neutral-100 text-neutral-700 border-neutral-200"
            }`}
            onClick={() => {
              setStep(2);
              scrollToRef(formRef);
            }}
          >
            2. Produtos
          </button>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            {/* título */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700">
                Título do evento
              </label>
              <input
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/70 focus:border-orange-500"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Entrega sábado – Fábrica Aichi"
              />
            </div>

            {/* nome vendedor */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700">
                Nome do vendedor
              </label>
              <input
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/70 focus:border-orange-500"
                value={sellerName}
                onChange={(e) => setSellerName(e.target.value)}
                placeholder="Seu nome"
              />
            </div>

            {/* região */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700">
                Região / local do evento
              </label>
              <input
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/70 focus:border-orange-500"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Ex: Aichi-ken, fábrica XYZ"
              />
            </div>

            {/* datas */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-neutral-700">
                Datas de entrega (pode ser mais de uma)
              </label>
              <div className="space-y-2">
                {deliveryDates.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="date"
                      className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/70 focus:border-orange-500"
                      value={d}
                      onChange={(e) =>
                        handleChangeDate(i, e.target.value)
                      }
                    />
                    {deliveryDates.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveDate(i)}
                        className="text-[11px] text-red-600"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={handleAddDate}
                className="text-[11px] text-orange-700 underline decoration-dotted"
              >
                + Adicionar outra data
              </button>
            </div>

            {/* whatsapp */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700">
                WhatsApp para receber os pedidos
              </label>
              <input
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/70 focus:border-orange-500"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+819060703785"
              />
              <p className="text-[10px] text-neutral-500">
                Você pode usar seu próprio número ou o do fornecedor direto.
              </p>
            </div>

            {/* Messenger */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700">
                Messenger (opcional) – username ou ID
              </label>
              <input
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/70 focus:border-orange-500"
                value={messengerId}
                onChange={(e) => setMessengerId(e.target.value)}
                placeholder="Ex: minhaPaginaDeSalgados"
              />
              <p className="text-[10px] text-neutral-500">
                Se preenchido, o cliente verá um botão &quot;Enviar pelo
                Messenger&quot;. Usamos o link{" "}
                <code>https://m.me/SEU_ID?text=...</code>.
              </p>
            </div>

            {/* endereço */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700">
                Link do endereço (retirada / Google Maps)
              </label>
              <input
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/70 focus:border-orange-500"
                value={pickupUrl}
                onChange={(e) => setPickupUrl(e.target.value)}
                placeholder="https://maps.google.com/..."
              />
            </div>

            {/* observação */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700">
                Observação do local (opcional)
              </label>
              <textarea
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[60px] focus:outline-none focus:ring-2 focus:ring-orange-500/70 focus:border-orange-500"
                value={pickupNote}
                onChange={(e) => setPickupNote(e.target.value)}
                placeholder="Ex: Entrada lateral, estacionar no fundo, etc."
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleGoToProducts}
                className="inline-flex items-center px-4 py-2 rounded-full bg-black text-white text-xs font-medium hover:bg-neutral-800 transition"
              >
                Próximo: selecionar produtos
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {products.length === 0 ? (
              <p className="text-xs text-neutral-600">
                Nenhum produto cadastrado ainda.
              </p>
            ) : (
              <>
                {renderCategoryGrid("Comida", comidaProducts)}
                {renderCategoryGrid("Lanchonete", lanchoneteProducts)}
                {renderCategoryGrid("Assados", assadosProducts)}
                {renderCategoryGrid("Sobremesa", sobremesaProducts)}
                {renderCategoryGrid("Festa", festaProducts)}
                {renderCategoryGrid("Congelados", congeladosProducts)}
              </>
            )}

            <div className="flex justify-between items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  scrollToRef(formRef);
                }}
                className="text-[11px] text-neutral-600 underline decoration-dotted"
              >
                Voltar para dados do evento
              </button>

              <button
                type="button"
                onClick={handleSaveEvent}
                disabled={saving}
                className="inline-flex items-center px-4 py-2 rounded-full bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {saving
                  ? "Salvando..."
                  : eventId
                  ? "Atualizar evento"
                  : "Criar evento"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {error}
          </p>
        )}
        {successMessage && (
          <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-md px-3 py-2">
            {successMessage}
          </p>
        )}
      </section>

      {/* lista de eventos */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Meus eventos</h2>
        {events.length === 0 ? (
          <p className="text-xs text-neutral-600">
            Nenhum evento criado ainda.
          </p>
        ) : (
          <div className="space-y-2">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="border rounded-xl bg-white px-4 py-3 flex flex-col gap-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {ev.title}{" "}
                      {ev.status === "cancelled" && (
                        <span className="ml-1 text-[10px] text-red-600">
                          (cancelado)
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-neutral-600">
                      {ev.region} • {ev.deliveryDateLabel}
                    </p>
                    {ev.pickupUrl && (
                      <p className="text-[10px] text-blue-700 underline">
                        <a href={ev.pickupUrl} target="_blank">
                          Ver endereço de retirada
                        </a>
                      </p>
                    )}
                  </div>
                  <div className="text-right text-[10px] text-neutral-500 space-y-0.5">
                    <p>WhatsApp: {ev.whatsapp}</p>
                    {ev.messengerId && (
                      <p>Messenger: {ev.messengerId}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/event/${ev.id}`}
                    className="text-[11px] text-blue-600 underline"
                    target="_blank"
                  >
                    Ver link público
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleEditEvent(ev)}
                    className="text-[11px] text-orange-700 underline"
                  >
                    Editar
                  </button>
                  {ev.status !== "cancelled" && (
                    <button
                      type="button"
                      onClick={() => handleCancelEvent(ev.id)}
                      className="text-[11px] text-red-600 underline"
                    >
                      Cancelar evento
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEventForOrders(ev);
                      setTimeout(() => {
                        scrollToRef(ordersRef);
                      }, 120);
                    }}
                    className="text-[11px] text-neutral-700 underline"
                  >
                    Ver pedidos
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* painel de pedidos */}
      {selectedEventForOrders && (
        <section ref={ordersRef} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Pedidos – {selectedEventForOrders.title}
            </h2>
            <button
              type="button"
              onClick={() => setSelectedEventForOrders(null)}
              className="text-[11px] text-neutral-600 underline decoration-dotted"
            >
              Fechar
            </button>
          </div>

          <div className="bg-white border border-neutral-200 rounded-2xl p-4 space-y-4">
            {ordersLoading ? (
              <p className="text-xs text-neutral-600">
                Carregando pedidos...
              </p>
            ) : orders.length === 0 ? (
              <p className="text-xs text-neutral-600">
                Nenhum pedido recebido para este evento (por enquanto).
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">Pendentes</span>
                  <span className="text-[11px] text-neutral-600">
                    Total de itens pendentes: {pendingItemsTotal}
                  </span>
                </div>

                {/* Pendentes */}
                {pendingOrders.length === 0 ? (
                  <p className="text-[11px] text-neutral-500">
                    Nenhum pedido pendente.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {pendingOrders.map((order) => (
                      <div
                        key={order.id}
                        className="flex items-start gap-3 border rounded-lg px-3 py-2 bg-white"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={false}
                          onChange={() => toggleOrderStatus(order)}
                        />
                        <div className="flex-1 space-y-1">
                          <div className="flex justify-between gap-2">
                            <span className="text-xs font-medium">
                              {order.customerName}
                            </span>
                            <span className="text-[10px] text-neutral-500">
                              {order.totalItems > 0
                                ? `${order.totalItems} item(s)`
                                : "-"}
                            </span>
                          </div>

                          {Object.keys(order.quantities).length > 0 && (
                            <ul className="text-[10px] text-neutral-700 list-disc list-inside space-y-0.5">
                              {Object.entries(order.quantities).map(
                                ([name, qty]) => (
                                  <li key={name}>
                                    {name}: {qty}
                                  </li>
                                )
                              )}
                            </ul>
                          )}

                          {order.note && (
                            <p className="text-[10px] text-neutral-600">
                              Obs: {order.note}
                            </p>
                          )}
                          {order.createdAt && (
                            <p className="text-[10px] text-neutral-400">
                              {order.createdAt.toLocaleString("ja-JP")}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Separador */}
                <div className="h-px bg-neutral-200 my-2" />

                <span className="text-xs font-medium">Entregues</span>

                {deliveredOrders.length === 0 ? (
                  <p className="text-[11px] text-neutral-500">
                    Nenhum pedido marcado como entregue.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {deliveredOrders.map((order) => (
                      <div
                        key={order.id}
                        className="flex items-start gap-3 border rounded-lg px-3 py-2 bg-neutral-100 text-neutral-500"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked
                          onChange={() => toggleOrderStatus(order)}
                        />
                        <div className="flex-1 space-y-1">
                          <div className="flex justify-between gap-2">
                            <span className="text-xs font-medium">
                              {order.customerName}
                            </span>
                            <span className="text-[10px]">
                              {order.totalItems > 0
                                ? `${order.totalItems} item(s)`
                                : "-"}
                            </span>
                          </div>

                          {Object.keys(order.quantities).length > 0 && (
                            <ul className="text-[10px] list-disc list-inside space-y-0.5">
                              {Object.entries(order.quantities).map(
                                ([name, qty]) => (
                                  <li key={name}>
                                    {name}: {qty}
                                  </li>
                                )
                              )}
                            </ul>
                          )}

                          {order.note && (
                            <p className="text-[10px]">
                              Obs: {order.note}
                            </p>
                          )}
                          {order.createdAt && (
                            <p className="text-[10px]">
                              {order.createdAt.toLocaleString("ja-JP")}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
