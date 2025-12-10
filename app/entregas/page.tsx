"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

type DeliveryMode = "delivery" | "pickup" | "none";
type OrderStatus = "pending" | "confirmed" | "delivered" | "cancelled";
type OrderChannel = "whatsapp" | "messenger" | "other";

interface FirestoreProduct {
  name: string;
  price: number;
}

interface FirestoreOrder {
  customerName: string;
  note?: string;
  quantities: Record<string, number>;
  totalItems: number;
  status: OrderStatus;
  channel?: OrderChannel;
  deliveryDate?: string;
  deliveryMode?: DeliveryMode;
  deliveryTimeSlot?: string;
  locationLink?: string;
  createdAt?: Timestamp | null;
  // campos extras opcionais para controle do entregador
  deliveryDriverName?: string;
  deliveredAt?: Timestamp | null;
}

interface FirestoreEvent {
  title: string;
  region: string;
  deliveryDateLabel?: string;
}

interface DriverOrder {
  id: string;
  eventId: string;
  eventTitle: string;
  eventRegion?: string;
  customerName: string;
  note?: string;
  quantities: Record<string, number>;
  totalItems: number;
  status: OrderStatus;
  channel: OrderChannel;
  deliveryDate?: string;
  deliveryTimeSlot?: string;
  deliveryMode: DeliveryMode;
  locationLink?: string;
  createdAt?: Timestamp | null;
  totalPrice: number;
  deliveryDriverName?: string;
}

export default function EntregasPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // nome do entregador
  const [driverName, setDriverName] = useState<string>("");

  // ids dos pedidos marcados como entregues (para organizar na tela)
  const [deliveredOrderIds, setDeliveredOrderIds] = useState<string[]>([]);

  // filtros simples
  const [filterDate, setFilterDate] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // carrega nome salvo no navegador
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("driverName");
    if (saved) {
      setDriverName(saved);
    }
  }, []);

  // salva nome no navegador quando muda
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (driverName.trim()) {
      window.localStorage.setItem("driverName", driverName.trim());
    }
  }, [driverName]);

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      // 1) produtos (para calcular valor total de cada entrega)
      const productsSnap = await getDocs(collection(db, "products"));
      const priceMap = new Map<string, number>();
      productsSnap.forEach((docSnap) => {
        const data = docSnap.data() as FirestoreProduct;
        if (data.name) {
          priceMap.set(data.name, data.price ?? 0);
        }
      });

      // 2) eventos
      const eventsSnap = await getDocs(
        query(collection(db, "events"), orderBy("createdAt", "desc"))
      );

      const events: { id: string; data: FirestoreEvent }[] = eventsSnap.docs.map(
        (docSnap) => ({
          id: docSnap.id,
          data: docSnap.data() as FirestoreEvent,
        })
      );

      // 3) pedidos de cada evento
      const allOrders: DriverOrder[] = [];

      for (const ev of events) {
        const ordersRef = collection(db, "events", ev.id, "orders");
        const q = query(ordersRef, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        snap.forEach((orderDoc) => {
          const data = orderDoc.data() as FirestoreOrder;

          // calcular total da entrega
          let totalPrice = 0;
          Object.entries(data.quantities || {}).forEach(([prodName, qty]) => {
            const price = priceMap.get(prodName) ?? 0;
            totalPrice += price * qty;
          });

          const driverOrder: DriverOrder = {
            id: orderDoc.id,
            eventId: ev.id,
            eventTitle: ev.data.title,
            eventRegion: ev.data.region,
            customerName: data.customerName,
            note: data.note,
            quantities: data.quantities ?? {},
            totalItems: data.totalItems ?? 0,
            status: data.status ?? "pending",
            channel: data.channel ?? "whatsapp",
            deliveryDate: data.deliveryDate,
            deliveryTimeSlot: data.deliveryTimeSlot,
            deliveryMode: data.deliveryMode ?? "pickup",
            locationLink: data.locationLink,
            createdAt: data.createdAt ?? null,
            totalPrice,
            deliveryDriverName: data.deliveryDriverName,
          };

          allOrders.push(driverOrder);
        });
      }

      // ordenar: primeiro por data, depois por faixa de horário
      allOrders.sort((a, b) => {
        const dateA = a.deliveryDate ?? "";
        const dateB = b.deliveryDate ?? "";
        if (dateA !== dateB) {
          return dateA.localeCompare(dateB, "pt-BR");
        }

        const timeA = getTimeSlotSortValue(a.deliveryTimeSlot);
        const timeB = getTimeSlotSortValue(b.deliveryTimeSlot);
        return timeA - timeB;
      });

      setOrders(allOrders);

      // marca como “entregues” os que já vierem do Firestore assim
      const deliveredFromDb = allOrders
        .filter(
          (o) => o.status === "delivered" || (o.deliveryDriverName ?? "").length
        )
        .map((o) => o.id);
      setDeliveredOrderIds(deliveredFromDb);
    } catch (error) {
      console.error(error);
      setErrorMessage("Erro ao carregar entregas. Verifique permissões.");
    } finally {
      setLoading(false);
    }
  };

  // ajuda para ordenar faixas de horário "8–12", "14–16", etc.
  const getTimeSlotSortValue = (slot?: string): number => {
    if (!slot) return 9999;
    const match = slot.match(/(\d{1,2})/);
    if (!match) return 9999;
    return parseInt(match[1], 10);
  };

  const formatCreatedAt = (ts?: Timestamp | null) => {
    if (!ts) return "";
    const date = ts.toDate();
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // datas únicas para filtro
  const uniqueDates = Array.from(
    new Set(
      orders
        .map((o) => o.deliveryDate)
        .filter((d): d is string => Boolean(d))
    )
  ).sort();

  // aplicar filtros
  const filteredOrders = orders.filter((o) => {
    if (filterDate && o.deliveryDate !== filterDate) return false;
    if (filterStatus !== "all" && o.status !== filterStatus) return false;
    return true;
  });

  // agrupar por dia
  const groupedByDate: Record<string, DriverOrder[]> = {};
  filteredOrders.forEach((o) => {
    const key = o.deliveryDate || "Sem data definida";
    if (!groupedByDate[key]) groupedByDate[key] = [];
    groupedByDate[key].push(o);
  });

  const sortedDateKeys = Object.keys(groupedByDate).sort((a, b) => {
    if (a === "Sem data definida") return 1;
    if (b === "Sem data definida") return -1;
    return a.localeCompare(b, "pt-BR");
  });

  const isDeliveredLocally = (orderId: string) =>
    deliveredOrderIds.includes(orderId);

  const handleToggleDelivered = async (order: DriverOrder) => {
    if (!driverName.trim()) {
      alert(
        "Por favor, preencha seu nome antes de marcar um pedido como entregue."
      );
      return;
    }

    const alreadyDelivered = isDeliveredLocally(order.id);

    try {
      const ref = doc(db, "events", order.eventId, "orders", order.id);

      if (!alreadyDelivered) {
        // marcar como entregue
        await updateDoc(ref, {
          status: "delivered",
          deliveryDriverName: driverName.trim(),
          deliveredAt: serverTimestamp(),
        });

        setDeliveredOrderIds((prev) =>
          prev.includes(order.id) ? prev : [...prev, order.id]
        );

        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id
              ? {
                  ...o,
                  status: "delivered",
                  deliveryDriverName: driverName.trim(),
                }
              : o
          )
        );
      } else {
        // voltar para pendente (ou confirmado, se preferir)
        await updateDoc(ref, {
          status: "confirmed",
          deliveryDriverName: null,
          deliveredAt: null,
        });

        setDeliveredOrderIds((prev) =>
          prev.filter((id) => id !== order.id)
        );

        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id
              ? {
                  ...o,
                  status: "confirmed",
                  deliveryDriverName: undefined,
                }
              : o
          )
        );
      }
    } catch (error) {
      console.error(error);
      alert(
        "Erro ao atualizar a entrega. Verifique sua conexão ou as permissões do Firestore."
      );
    }
  };

  if (loading) {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-bold">Painel de Entregas</h1>
        <p className="text-sm text-neutral-600">
          Carregando pedidos para os entregadores...
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <header className="space-y-2 border-b pb-3">
        <h1 className="text-2xl font-bold">Painel de Entregas</h1>
        <p className="text-sm text-neutral-600">
          Use esta tela para organizar as entregas do dia. Marque o pedido como
          entregue para ele descer na tela. Se clicar errado, é só clicar de
          novo que ele volta.
        </p>

        {/* Bloco do nome do entregador */}
        <section className="mt-2 rounded-lg border bg-white p-3 space-y-2 text-sm">
          <label className="text-xs font-semibold">
            Seu nome (entregador)
          </label>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Ex: João, Ana, Carlos..."
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
          />
          <p className="text-[11px] text-neutral-500">
            Esse nome será registrado no pedido quando você marcar como
            entregue, para saber quanto cada entregador precisa devolver de
            dinheiro depois.
          </p>
        </section>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-full border border-neutral-300 px-3 py-1 hover:bg-neutral-100"
          >
            Atualizar
          </button>

          <div className="h-4 w-px bg-neutral-300" />

          <label className="flex items-center gap-1">
            <span className="text-neutral-600">Data:</span>
            <select
              className="rounded-md border px-2 py-1"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            >
              <option value="">Todas</option>
              {uniqueDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1">
            <span className="text-neutral-600">Status:</span>
            <select
              className="rounded-md border px-2 py-1"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="pending">Pendente</option>
              <option value="confirmed">Confirmado</option>
              <option value="delivered">Entregue</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </label>

          <span className="ml-auto text-[11px] text-neutral-500">
            Exibindo {filteredOrders.length} pedido(s) de {orders.length}
          </span>
        </div>

        {errorMessage && (
          <p className="text-xs text-red-600 mt-1">{errorMessage}</p>
        )}
      </header>

      {sortedDateKeys.length === 0 ? (
        <p className="text-sm text-neutral-600">
          Nenhum pedido encontrado para os filtros selecionados.
        </p>
      ) : (
        <div className="space-y-8">
          {sortedDateKeys.map((dateKey) => {
            const list = groupedByDate[dateKey];

            const sortedList = [...list].sort((a, b) => {
              const tA = getTimeSlotSortValue(a.deliveryTimeSlot);
              const tB = getTimeSlotSortValue(b.deliveryTimeSlot);
              return tA - tB;
            });

            const pendentes = sortedList.filter(
              (o) => !isDeliveredLocally(o.id)
            );
            const entregues = sortedList.filter((o) =>
              isDeliveredLocally(o.id)
            );

            return (
              <section key={dateKey} className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">
                    Entregas em{" "}
                    {dateKey === "Sem data definida" ? dateKey : dateKey}
                  </h2>
                  <span className="text-xs text-neutral-500">
                    {sortedList.length} pedido(s)
                  </span>
                </div>

                {/* Pendentes / em rota */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">
                    Pendentes / para entregar
                  </h3>
                  {pendentes.length === 0 ? (
                    <p className="text-xs text-neutral-500">
                      Nenhum pedido pendente nesse dia.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {pendentes.map((o) => (
                        <article
                          key={o.id}
                          className="rounded-lg border border-amber-200 bg-white p-3 text-sm shadow-sm"
                        >
                          <OrderCardContent
                            order={o}
                            isDelivered={false}
                            onToggle={() => void handleToggleDelivered(o)}
                            formatCreatedAt={formatCreatedAt}
                          />
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                {/* Entregues */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">
                    Entregues (ficam aqui embaixo)
                  </h3>
                  {entregues.length === 0 ? (
                    <p className="text-xs text-neutral-500">
                      Nenhum pedido marcado como entregue ainda.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {entregues.map((o) => (
                        <article
                          key={o.id}
                          className="rounded-lg border border-green-300 bg-green-50/70 p-3 text-sm shadow-sm"
                        >
                          <OrderCardContent
                            order={o}
                            isDelivered={true}
                            onToggle={() => void handleToggleDelivered(o)}
                            formatCreatedAt={formatCreatedAt}
                          />
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

/* -------- Componente interno só para organizar o cartão do pedido -------- */

function OrderCardContent(props: {
  order: DriverOrder;
  isDelivered: boolean;
  onToggle: () => void;
  formatCreatedAt: (ts?: Timestamp | null) => string;
}) {
  const { order: o, isDelivered, onToggle, formatCreatedAt } = props;

  return (
    <>
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1 min-w-[180px]">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">
              {o.customerName || "(Cliente sem nome)"}
            </h3>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-700">
              {o.eventTitle}
            </span>
          </div>
          {o.eventRegion && (
            <p className="text-xs text-neutral-500">Região: {o.eventRegion}</p>
          )}
          {o.note && (
            <p className="mt-1 text-xs text-neutral-600">
              <span className="font-semibold">Obs:</span> {o.note}
            </p>
          )}
        </div>

        <div className="text-xs text-neutral-700 min-w-[160px] space-y-0.5">
          <p>
            <span className="font-semibold">Horário:</span>{" "}
            {o.deliveryTimeSlot ?? "-"}
          </p>
          <p>
            <span className="font-semibold">Modo:</span>{" "}
            {o.deliveryMode === "delivery" && "Entrega"}
            {o.deliveryMode === "pickup" && "Retirada"}
            {o.deliveryMode === "none" && "A combinar"}
          </p>
          <p>
            <span className="font-semibold">Canal:</span>{" "}
            {o.channel === "whatsapp" && "WhatsApp"}
            {o.channel === "messenger" && "Messenger"}
            {o.channel === "other" && "Outro"}
          </p>
          <p>
            <span className="font-semibold">Criado em:</span>{" "}
            {formatCreatedAt(o.createdAt)}
          </p>
          {o.deliveryDriverName && (
            <p>
              <span className="font-semibold">Entregador:</span>{" "}
              {o.deliveryDriverName}
            </p>
          )}
        </div>

        <div className="text-xs text-neutral-700 min-w-[180px] space-y-1">
          <p>
            <span className="font-semibold">Total estimado:</span>{" "}
            ¥{o.totalPrice.toLocaleString("ja-JP")}
          </p>
          <p>
            <span className="font-semibold">Total de itens:</span>{" "}
            {o.totalItems}
          </p>
          {o.locationLink && (
            <div className="mt-1 space-y-1">
              <a
                href={o.locationLink}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline break-all"
              >
                Abrir no Google Maps
              </a>
              <p className="text-[10px] text-neutral-500 break-all">
                {o.locationLink}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 border-t pt-2 text-xs text-neutral-700">
        <p className="font-semibold mb-1">Produtos para entregar:</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(o.quantities).map(([prodName, qty]) => (
            <span key={prodName}>
              {prodName}: <span className="font-semibold">{qty}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onToggle}
          className={`rounded-full px-3 py-1.5 text-[11px] font-semibold border ${
            isDelivered
              ? "border-amber-500 text-amber-700 bg-amber-50 hover:bg-amber-100"
              : "border-green-600 text-green-700 bg-green-50 hover:bg-green-100"
          }`}
        >
          {isDelivered ? "Voltar para pendente" : "Marcar como entregue"}
        </button>
      </div>
    </>
  );
}
