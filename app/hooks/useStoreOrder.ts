"use client";

import {
  arrayUnion,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  auth,
  db,
} from "@/app/lib/firebase";
import {
  normalizeStoreOrderStatus,
  parseStoreOrder,
} from "@/app/lib/store-order";
import useSellerId from "@/app/hooks/useSellerId";

import type {
  StoreOrder,
  StoreOrderErrorCode,
  StoreOrderHistory,
  StoreOrderStatus,
} from "@/app/types/store-order";

type UseStoreOrderResult = {
  loading: boolean;
  saving: boolean;
  errorCode:
    | StoreOrderErrorCode
    | null;
  sellerId: string;
  order: StoreOrder | null;
  reload: () => Promise<void>;
  updateStatus: (
    status: StoreOrderStatus,
    note?: string,
  ) => Promise<void>;
};

export default function useStoreOrder(
  orderId: string,
): UseStoreOrderResult {
  const {
    loading: sellerLoading,
    sellerId,
    errorCode: sellerErrorCode,
  } = useSellerId();

  const [order, setOrder] =
    useState<StoreOrder | null>(
      null,
    );
  const [orderLoading, setOrderLoading] =
    useState(true);
  const [saving, setSaving] =
    useState(false);
  const [orderErrorCode, setOrderErrorCode] =
    useState<
      StoreOrderErrorCode | null
    >(null);
  const [actionErrorCode, setActionErrorCode] =
    useState<
      StoreOrderErrorCode | null
    >(null);
  const [reloadKey, setReloadKey] =
    useState(0);

  const savingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(
    async (): Promise<void> => {
      setActionErrorCode(null);
      setOrderErrorCode(null);
      setReloadKey(
        (current) => current + 1,
      );
    },
    [],
  );

  useEffect(() => {
    if (sellerLoading) {
      setOrderLoading(true);
      return;
    }

    if (!sellerId) {
      setOrder(null);
      setOrderLoading(false);
      return;
    }

    if (!orderId.trim()) {
      setOrder(null);
      setOrderLoading(false);
      setOrderErrorCode(
        "INVALID_ORDER_ID",
      );
      return;
    }

    setOrderLoading(true);
    setOrderErrorCode(null);
    setActionErrorCode(null);

    const orderReference = doc(
      db,
      "sellers",
      sellerId,
      "storeOrders",
      orderId,
    );

    const unsubscribe = onSnapshot(
      orderReference,
      (snapshot) => {
        if (!snapshot.exists()) {
          setOrder(null);
          setOrderLoading(false);
          setOrderErrorCode(
            "ORDER_NOT_FOUND",
          );
          return;
        }

        setOrder(
          parseStoreOrder(
            snapshot.id,
            snapshot.data(),
          ),
        );

        setOrderLoading(false);
        setOrderErrorCode(null);

        if (
          snapshot.data()
            .sellerUnread === true
        ) {
          void updateDoc(
            orderReference,
            {
              sellerUnread: false,
              sellerReadAt:
                serverTimestamp(),
            },
          ).catch(
            (readError) => {
              console.warn(
                "[useStoreOrder] Não foi possível marcar o pedido como lido:",
                readError,
              );
            },
          );
        }
      },
      (snapshotError) => {
        console.error(
          "[useStoreOrder] Falha ao acompanhar o pedido:",
          snapshotError,
        );

        setOrder(null);
        setOrderLoading(false);
        setOrderErrorCode(
          "ORDER_LOAD_FAILED",
        );
      },
    );

    return unsubscribe;
  }, [
    orderId,
    reloadKey,
    sellerId,
    sellerLoading,
  ]);

  const updateStatus = useCallback(
    async (
      status: StoreOrderStatus,
      note?: string,
    ): Promise<void> => {
      if (savingRef.current) {
        return;
      }

      if (
        !sellerId ||
        !orderId.trim()
      ) {
        setActionErrorCode(
          "INVALID_ORDER_ID",
        );

        throw new Error(
          "Pedido ou vendedor não identificado.",
        );
      }

      if (
        order?.status === status
      ) {
        return;
      }

      savingRef.current = true;

      if (mountedRef.current) {
        setSaving(true);
        setActionErrorCode(null);
      }

      try {
        const orderReference = doc(
          db,
          "sellers",
          sellerId,
          "storeOrders",
          orderId,
        );

        await runTransaction(
          db,
          async (transaction) => {
            const snapshot =
              await transaction.get(
                orderReference,
              );

            if (!snapshot.exists()) {
              throw new Error(
                "Pedido não encontrado.",
              );
            }

            const currentStatus =
              normalizeStoreOrderStatus(
                snapshot.data()
                  .status,
              );

            if (
              currentStatus === status
            ) {
              return;
            }

            /*
             * IMPORTANTE:
             * Não regravamos todo o array history.
             * Isso evita enviar propriedades undefined de entradas antigas.
             */
            const historyEntry: StoreOrderHistory =
              {
                status,
                createdAt:
                  Timestamp.now(),
                updatedBy:
                  auth.currentUser
                    ?.email ??
                  auth.currentUser
                    ?.uid ??
                  "seller",
              };

            const cleanNote =
              note?.trim();

            if (cleanNote) {
              historyEntry.note =
                cleanNote;
            }

            const rawHistory =
              snapshot.data()
                .history;

            transaction.update(
              orderReference,
              {
                status,
                history:
                  Array.isArray(
                    rawHistory,
                  )
                    ? arrayUnion(
                        historyEntry,
                      )
                    : [
                        historyEntry,
                      ],
                sellerUnread: false,
                sellerReadAt:
                  serverTimestamp(),
                updatedAt:
                  serverTimestamp(),
                updatedBy:
                  historyEntry.updatedBy,
              },
            );
          },
        );
      } catch (updateError) {
        console.error(
          "[useStoreOrder] Falha ao alterar o status:",
          updateError,
        );

        if (mountedRef.current) {
          setActionErrorCode(
            "STATUS_UPDATE_FAILED",
          );
        }

        throw updateError;
      } finally {
        savingRef.current = false;

        if (mountedRef.current) {
          setSaving(false);
        }
      }
    },
    [
      order?.status,
      orderId,
      sellerId,
    ],
  );

  return {
    loading:
      sellerLoading ||
      orderLoading,
    saving,
    errorCode:
      actionErrorCode ||
      orderErrorCode ||
      sellerErrorCode,
    sellerId,
    order,
    reload,
    updateStatus,
  };
}
