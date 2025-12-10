"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  collection,
  onSnapshot,
  getDocs,
} from "firebase/firestore";

type Props = {
  params: Promise<{ id: string }>;
};

type EventDoc = {
  title: string;
  region: string;
  deliveryDates: string[];
  deliveryDateLabel?: string;
  productNames: string[];
  whatsapp: string;
  status: string;
  pickupLink?: string;
  pickupNote?: string;
  messengerId?: string;
  featuredProductNames?: string[];
};

type OrderDoc = {
  id: string;
  customerName?: string;
  note?: string;
  quantities: Record<string, number>;
  totalItems?: number;
  status?: string;
  channel?: "whatsapp" | "messenger";
  deliveryDate?: string;
};

type ProductDoc = {
  id: string;
  name: string;
  price?: number;
  imageUrl?: string;
  category?: string;
};

export default function EventEditPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 🔹 Campos do evento
  const [title, setTitle] = useState("");
  const [region, setRegion] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [status, setStatus] = useState<"active" | "closed" | "cancelled">(
    "active"
  );
  const [pickupLink, setPickupLink] = useState("");
  const [pickupNote, setPickupNote] = useState("");
  const [messengerId, setMessengerId] = useState("");

  // datas de entrega: guardamos em array, mas editamos como texto (textarea)
  const [deliveryDates, setDeliveryDates] = useState<string[]>([]);
  const [deliveryDatesText, setDeliveryDatesText] = useState("");

  // produtos do evento (agora controlados por checkbox em grid)
  const [productNames, setProductNames] = useState<string[]>([]);

  // produtos em destaque (carrossel da landpage)
  const [featuredProductNames, setFeaturedProductNames] = useState<string[]>(
    []
  );

  // 🔹 todos os produtos da galeria (coleção "products")
  const [allProducts, setAllProducts] = useState<ProductDoc[]>([]);
  const [allProductsLoading, setAllProductsLoading] = useState(true);
  const [allProductsError, setAllProductsError] = useState<string | null>(null);

  // 🔹 Pedidos do evento (subcoleção /orders)
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  // filtro de data para o resumo de produção
  const [filterDate, setFilterDate] = useState<string>("");

  // 🔹 Carrega dados do evento
  useEffect(() => {
    const load = async () => {
      try {
        const ref = doc(db, "events", id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setError("Evento não encontrado.");
          setLoading(false);
          return;
        }

        const data = snap.data() as EventDoc;

        const dDates = Array.isArray(data.deliveryDates)
          ? data.deliveryDates
          : [];
        const pNames = Array.isArray(data.productNames)
          ? data.productNames
          : [];

        const featured = Array.isArray(data.featuredProductNames)
          ? data.featuredProductNames.filter(
              (n) => typeof n === "string"
            )
          : [];

        setTitle(data.title || "");
        setRegion(data.region || "");
        setWhatsapp(data.whatsapp || "");
        setStatus((data.status as any) || "active");
        setPickupLink(data.pickupLink || "");
        setPickupNote(data.pickupNote || "");
        setMessengerId(data.messengerId || "");

        setDeliveryDates(dDates);
        setDeliveryDatesText(dDates.join("\n"));

        setProductNames(pNames);
        setFeaturedProductNames(featured);
      } catch (err) {
        console.error(err);
        setError("Erro ao carregar evento.");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      load();
    }
  }, [id]);

  // 🔹 Carrega TODOS os produtos da galeria (para grid + destaques)
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const snap = await getDocs(collection(db, "products"));
        const list: ProductDoc[] = snap.docs
          .map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              name: data.name || "",
              price:
                typeof data.price === "number"
                  ? data.price
                  : Number(data.price || 0),
              imageUrl: data.imageUrl || "",
              category: data.category || "",
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

        setAllProducts(list);
      } catch (err) {
        console.error(err);
        setAllProductsError("Erro ao carregar produtos.");
      } finally {
        setAllProductsLoading(false);
      }
    };

    loadProducts();
  }, []);

  // 🔹 Listener dos pedidos do evento
  useEffect(() => {
    if (!id) return;

    const ordersRef = collection(db, "events", id, "orders");
    const unsub = onSnapshot(
      ordersRef,
      (snap) => {
        const list: OrderDoc[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            customerName: data.customerName || "",
            note: data.note || "",
            quantities: data.quantities || {},
            totalItems: data.totalItems || 0,
            status: data.status || "pending",
            channel: data.channel,
            deliveryDate: data.deliveryDate || "",
          };
        });
        setOrders(list);
        setOrdersLoading(false);

        if (!filterDate) {
          setFilterDate("todas");
        }
      },
      (err) => {
        console.error("Erro ao ouvir pedidos:", err);
        setOrdersError("Erro ao carregar pedidos.");
        setOrdersLoading(false);
      }
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 🔹 Datas únicas presentes nos pedidos (para filtro)
  const uniqueOrderDates = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      if (o.deliveryDate) set.add(o.deliveryDate);
    });
    return Array.from(set).sort();
  }, [orders]);

  // 🔹 Pedidos filtrados por data
  const filteredOrders = useMemo(() => {
    if (filterDate === "todas" || !filterDate) return orders;
    return orders.filter((o) => o.deliveryDate === filterDate);
  }, [orders, filterDate]);

  // 🔹 Resumo de produção: soma quantidades por produto
  const productionSummary = useMemo(() => {
    const map: Record<string, number> = {};

    filteredOrders.forEach((order) => {
      Object.entries(order.quantities || {}).forEach(([name, qty]) => {
        const q = Number(qty || 0);
        if (!q) return;
        map[name] = (map[name] || 0) + q;
      });
    });

    return Object.entries(map)
      .map(([name, totalQty]) => ({ name, totalQty }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [filteredOrders]);

  const handleSave = async () => {
    setError(null);
    setSuccess(null);

    // converte textarea -> array
    const newDeliveryDates = deliveryDatesText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    // agora os produtos vêm do state productNames (checkboxes)
    const newProductNames = [...productNames];

    if (!title.trim()) {
      setError("Título do evento é obrigatório.");
      return;
    }

    // destaques podem ser qualquer produto da galeria
    const cleanedFeatured = featuredProductNames.filter(Boolean);

    // label automática se quiser
    let deliveryDateLabel = "";
    if (newDeliveryDates.length === 1) {
      deliveryDateLabel = newDeliveryDates[0];
    } else if (newDeliveryDates.length > 1) {
      deliveryDateLabel = newDeliveryDates.join(" • ");
    }

    setSaving(true);
    try {
      const ref = doc(db, "events", id);
      await updateDoc(ref, {
        title: title.trim(),
        region: region.trim(),
        whatsapp: whatsapp.trim(),
        status,
        pickupLink: pickupLink.trim(),
        pickupNote: pickupNote.trim(),
        messengerId: messengerId.trim(),
        deliveryDates: newDeliveryDates,
        deliveryDateLabel,
        productNames: newProductNames,
        featuredProductNames: cleanedFeatured,
        updatedAt: serverTimestamp(),
      });

      setDeliveryDates(newDeliveryDates);
      setProductNames(newProductNames);
      setFeaturedProductNames(cleanedFeatured);

      setSuccess("Evento atualizado com sucesso!");
    } catch (err) {
      console.error(err);
      setError("Erro ao salvar evento.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="space-y-2">
        <p>Carregando evento...</p>
      </main>
    );
  }

  if (error && !title) {
    return (
      <main className="space-y-2">
        <h1 className="text-xl font-bold">Erro</h1>
        <p className="text-sm text-red-600">{error}</p>
      </main>
    );
  }

  return (
    <main className="space-y-8">
      {/* TOPO */}
      <header className="border-b pb-4 flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">Editar evento</h1>
          <p className="text-xs text-neutral-500 break-all">
            ID: <span className="font-mono">{id}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as "active" | "closed" | "cancelled")
            }
            className="border rounded-md px-3 py-1 text-xs bg-white"
          >
            <option value="active">Ativo</option>
            <option value="closed">Encerrado</option>
            <option value="cancelled">Cancelado</option>
          </select>

          <button
            type="button"
            onClick={() => router.back()}
            className="bg-white text-black text-xs px-4 py-2 rounded-full"
          >
            Voltar
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-black text-white text-xs px-4 py-2 rounded-full disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </header>

      {/* FORM PRINCIPAL */}
      <section className="bg-white border rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold">Dados do evento</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs block">Título do evento</label>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Semana do Salgado na Fábrica X"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs block">Região / Local</label>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Ex: Shizuoka, Fábrica ABC"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs block">WhatsApp da vendedora</label>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="Ex: +8190..."
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs block">ID do Messenger (opcional)</label>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={messengerId}
              onChange={(e) => setMessengerId(e.target.value)}
              placeholder="Ex: nome.da.pagina"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs block">Link de retirada / mapa</label>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={pickupLink}
              onChange={(e) => setPickupLink(e.target.value)}
              placeholder="URL do Google Maps ou endereço"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs block">
              Observação da vendedora (mostrada para o cliente)
            </label>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={pickupNote}
              onChange={(e) => setPickupNote(e.target.value)}
              placeholder="Ex: Entrega no intervalo das 15h, portaria principal..."
            />
          </div>
        </div>

        {/* DATAS */}
        <div className="space-y-1">
          <label className="text-xs block">
            Datas de entrega (uma por linha)
          </label>
          <textarea
            className="w-full border rounded-md px-3 py-2 text-sm min-h-[80px]"
            value={deliveryDatesText}
            onChange={(e) => setDeliveryDatesText(e.target.value)}
            placeholder={"Ex:\n2025-12-20\n2025-12-21"}
          />
          <p className="text-[11px] text-neutral-500">
            Essas datas aparecem para o cliente escolher na landpage.
          </p>
        </div>

        {/* PRODUTOS DO EVENTO – GRID */}
        <div className="space-y-2">
          <label className="text-xs block">
            Produtos deste evento (selecione no grid)
          </label>

          {allProductsLoading ? (
            <p className="text-xs text-neutral-500">
              Carregando produtos da galeria...
            </p>
          ) : allProductsError ? (
            <p className="text-xs text-red-600">{allProductsError}</p>
          ) : allProducts.length === 0 ? (
            <p className="text-xs text-neutral-500">
              Nenhum produto cadastrado na galeria.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-neutral-500">
                Marque os produtos que irão participar deste evento.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {allProducts.map((prod) => {
                  const checked = productNames.includes(prod.name);
                  return (
                    <label
                      key={prod.id}
                      className={`flex items-center gap-2 text-xs border rounded-md px-2 py-1 bg-white ${
                        checked ? "border-black" : "border-neutral-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          setProductNames((prev) => {
                            if (isChecked) {
                              if (prev.includes(prod.name)) return prev;
                              return [...prev, prod.name];
                            } else {
                              return prev.filter((n) => n !== prod.name);
                            }
                          });
                        }}
                      />
                      {prod.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={prod.imageUrl}
                          alt={prod.name}
                          className="h-10 w-10 rounded-md object-cover border border-neutral-200 flex-shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-md bg-neutral-100 border border-dashed border-neutral-200 flex items-center justify-center text-[9px] text-neutral-400 flex-shrink-0">
                          Sem imagem
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{prod.name}</p>
                        {typeof prod.price === "number" &&
                          !Number.isNaN(prod.price) && (
                            <p className="text-[11px] text-neutral-600">
                              ¥{prod.price.toLocaleString("ja-JP")}
                            </p>
                          )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* PRODUTOS EM DESTAQUE (CARROSSEL) */}
        <div className="space-y-2 border rounded-md p-3 bg-neutral-50">
          <h3 className="text-xs font-semibold">
            Produtos em destaque (carrossel da landpage)
          </h3>
          <p className="text-[11px] text-neutral-500">
            Aqui você escolhe os produtos que vão aparecer no carrossel de
            destaques. A lista abaixo mostra{" "}
            <strong>todos os produtos da galeria</strong>, não só os do evento.
          </p>

          {allProductsLoading ? (
            <p className="text-xs text-neutral-500">
              Carregando produtos da galeria...
            </p>
          ) : allProductsError ? (
            <p className="text-xs text-red-600">{allProductsError}</p>
          ) : allProducts.length === 0 ? (
            <p className="text-xs text-neutral-500">
              Nenhum produto cadastrado na galeria.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {allProducts.map((prod) => {
                const checked = featuredProductNames.includes(prod.name);
                return (
                  <label
                    key={prod.id}
                    className="flex items-center gap-2 text-xs border rounded-md px-2 py-1 bg-white"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        setFeaturedProductNames((prev) => {
                          if (isChecked) {
                            if (prev.includes(prod.name)) return prev;
                            return [...prev, prod.name];
                          } else {
                            return prev.filter((n) => n !== prod.name);
                          }
                        });
                      }}
                    />
                    {prod.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={prod.imageUrl}
                        alt={prod.name}
                        className="h-8 w-8 rounded-md object-cover border border-neutral-200 flex-shrink-0"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-md bg-neutral-100 border border-dashed border-neutral-200 flex items-center justify-center text-[9px] text-neutral-400 flex-shrink-0">
                        Sem
                      </div>
                    )}
                    <span className="truncate">{prod.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        {success && <p className="text-xs text-green-600">{success}</p>}
      </section>

      {/* RESUMO DE PRODUÇÃO / ITENS PARA PREPARAR */}
      <section className="bg-white border rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            Controle de produção – itens para preparar
          </h2>

          {/* filtro de data */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-neutral-600">
              Filtrar por data:
            </span>
            <select
              className="border rounded-md px-2 py-1 text-xs bg-white"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            >
              <option value="todas">Todas</option>
              {uniqueOrderDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {ordersLoading ? (
          <p className="text-xs text-neutral-500">
            Carregando pedidos do evento...
          </p>
        ) : ordersError ? (
          <p className="text-xs text-red-600">{ordersError}</p>
        ) : productionSummary.length === 0 ? (
          <p className="text-xs text-neutral-500">
            Ainda não há pedidos com itens para este filtro.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border border-neutral-200 rounded-md overflow-hidden">
              <thead className="bg-neutral-100">
                <tr>
                  <th className="text-left px-3 py-2 border-b border-neutral-200">
                    Produto
                  </th>
                  <th className="text-right px-3 py-2 border-b border-neutral-200">
                    Quantidade total
                  </th>
                </tr>
              </thead>
              <tbody>
                {productionSummary.map((item) => (
                  <tr key={item.name} className="odd:bg-white even:bg-neutral-50">
                    <td className="px-3 py-2 border-b border-neutral-100">
                      {item.name}
                    </td>
                    <td className="px-3 py-2 border-b border-neutral-100 text-right font-semibold">
                      {item.totalQty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!ordersLoading && orders.length > 0 && (
          <p className="text-[11px] text-neutral-500">
            Total de pedidos no evento (para este filtro):{" "}
            {filteredOrders.length}
          </p>
        )}
      </section>
    </main>
  );
}
