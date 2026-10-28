import * as admin from "firebase-admin";
import { REFERRAL_CAMPAIGN, referralCampaignActive } from "@/app/lib/referral-campaign";

function nonnegative(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Must be invoked WITHIN the same Firestore transaction that marks the order delivered.
 * Invariants: first paid delivery per customer/seller; exactly one enrollment; two
 * balanced wallet writes; two immutable ledger entries; transaction-safe retries.
 * The order API already computed all monetary fields server-side.
 */
export async function prepareFirstDeliveryReferral(params: {
  db: admin.firestore.Firestore;
  tx: admin.firestore.Transaction;
  orderData: Record<string, unknown>;
  sellerId: string;
  orderId: string;
  orderPath: string;
  now: admin.firestore.Timestamp;
}) {
  const { db, tx, orderData, sellerId, orderId, orderPath, now } = params;
  const customerUid = string(orderData.customerUid);
  if (!customerUid || customerUid.includes("/")) return () => new Set<string>();

  // Neither shipping-only orders nor 100%-points/free purchases count.
  if (nonnegative(orderData.totalAmountMinor) <= 0 ||
      nonnegative((orderData.rewards as Record<string, unknown> | undefined)?.merchandisePaidMinor) <= 0) return () => new Set<string>();

  const customerRef = db.collection("customers").doc(customerUid);
  const firstRef = customerRef.collection("firstPaidPurchases").doc(sellerId);
  const enrollmentRef = customerRef.collection("referrals").doc(sellerId);
  // Um seller pode pausar NOVOS convites, mas jamais cancelar retroativamente
  // a promessa de pontos feita a contas já vinculadas.
  const [firstSnap, enrollmentSnap] = await tx.getAll(firstRef, enrollmentRef);
  if (firstSnap.exists) return () => new Set<string>();

  const enrollment = enrollmentSnap.data() ?? {};
  const referrerUid = string(enrollment.referrerUid);
  const eligible = string(orderData.currency) === "JPY" && referralCampaignActive(now.toMillis()) &&
    enrollment.campaignId === REFERRAL_CAMPAIGN.id &&
    enrollment.sellerId === sellerId &&
    enrollment.referredUid === customerUid &&
    enrollment.state === "pending" &&
    referrerUid && referrerUid !== customerUid && !referrerUid.includes("/") &&
    nonnegative(enrollment.joinedAtMillis) >= REFERRAL_CAMPAIGN.startsAtMs &&
    nonnegative(enrollment.joinedAtMillis) < REFERRAL_CAMPAIGN.endsAtMs;

  // Always persist the first actual paid delivery, even when no referral exists.
  // If a customer comes back with a different code, the sentinel blocks repeat bonuses.
  if (!eligible) {
    return () => {
      tx.create(firstRef, { campaignId: REFERRAL_CAMPAIGN.id, sellerId, orderId, orderPath, createdAt: now, referralAwarded: false });
      return new Set<string>();
    };
  }

  // O vendedor/administrador nao deve receber bonus como cliente.
  // Bloqueios ocorridos depois do vinculo tambem devem impedir creditamento.
  const [inviterCustomer, inviteeCustomer, inviterRole, inviteeRole] = await tx.getAll(
    db.collection("customers").doc(referrerUid), customerRef,
    db.collection("users").doc(referrerUid), db.collection("users").doc(customerUid),
  );
  const allowedRole = (snap: admin.firestore.DocumentSnapshot): boolean =>
    !snap.exists || snap.data()?.role === "customer";
  if (inviterCustomer.data()?.accountStatus !== "active" ||
      inviteeCustomer.data()?.accountStatus !== "active" ||
      !allowedRole(inviterRole) || !allowedRole(inviteeRole)) {
    return () => {
      tx.create(firstRef, {
        campaignId: REFERRAL_CAMPAIGN.id, sellerId, orderId, orderPath,
        createdAt: now, referralAwarded: false, reason: "account_not_eligible",
      });
      return new Set<string>();
    };
  }

  const counterRef = db.collection("sellers").doc(sellerId).collection("referralCounters").doc(referrerUid);
  const referrerWalletRef = db.collection("customers").doc(referrerUid).collection("rewardWallets").doc(sellerId);
  const newWalletRef = customerRef.collection("rewardWallets").doc(sellerId);
  const referrerMovementRef = referrerWalletRef.collection("transactions").doc(`referral_${customerUid}_${REFERRAL_CAMPAIGN.id}`);
  const newMovementRef = newWalletRef.collection("transactions").doc(`referral_welcome_${REFERRAL_CAMPAIGN.id}`);
  const [referrerWalletSnap, newWalletSnap, referrerMovementSnap, newMovementSnap, counterSnap] = await tx.getAll(
    referrerWalletRef, newWalletRef, referrerMovementRef, newMovementRef, counterRef,
  );
  // Legacy enrollments from v4 predate reservations. Credit them without
  // inventing a reserved slot; current enrollment is an irrevocable promise.
  const counted = typeof counterSnap.data()?.reservedCount === "number" && counterSnap.data()!.reservedCount > 0;

  // An inconsistent historical ledger must NOT create a second credit.
  if (referrerMovementSnap.exists || newMovementSnap.exists) {
    throw new Error("REFERRAL_LEDGER_CONFLICT: acionar suporte; nenhuma carteira foi alterada.");
  }

  const credit = (walletRef: admin.firestore.DocumentReference, snap: admin.firestore.DocumentSnapshot,
    movementRef: admin.firestore.DocumentReference, uid: string, label: string) => {
    const wallet = snap.data() ?? {};
    const before = nonnegative(wallet.pointsBalance);
    const earned = nonnegative(wallet.lifetimeEarned);
    const redeemed = nonnegative(wallet.lifetimeRedeemed);
    const refunded = nonnegative(wallet.lifetimeRefunded);
    const gifted = nonnegative(wallet.lifetimeGifted);
    const points = REFERRAL_CAMPAIGN.pointsPerPerson;
    tx.set(walletRef, {
      schemaVersion: 2, customerUid: uid, sellerId,
      storeName: string(wallet.storeName) || "Loja",
      currency: string(orderData.currency) || "JPY",
      pointsBalance: before + points,
      lifetimeEarned: earned,
      lifetimeGifted: gifted + points,
      lifetimeRedeemed: redeemed,
      lifetimeRefunded: refunded,
      updatedAt: now,
      ...(snap.exists ? {} : { createdAt: now }),
    }, { merge: true });
    tx.create(movementRef, {
      schemaVersion: 2, type: "referral_bonus", campaignId: REFERRAL_CAMPAIGN.id,
      points, balanceBefore: before, balanceAfter: before + points,
      sellerId, customerUid: uid,
      orderId, orderPath, orderSource: string(orderData.orderSource),
      label, createdAt: now,
    });
  };

  return () => {
  credit(referrerWalletRef, referrerWalletSnap, referrerMovementRef, referrerUid, "Bônus por amigo indicado");
  credit(newWalletRef, newWalletSnap, newMovementRef, customerUid, "Boas-vindas por indicação");
  tx.create(firstRef, {
    campaignId: REFERRAL_CAMPAIGN.id, sellerId, orderId, orderPath,
    createdAt: now, referralAwarded: true, referrerUid,
  });
  tx.set(counterRef, { campaignId: REFERRAL_CAMPAIGN.id, sellerId, inviterUid: referrerUid,
    creditedCount: admin.firestore.FieldValue.increment(1),
    ...(counted ? {} : { legacyCreditWithoutReservation: true }), updatedAt: now }, { merge: true });
  tx.update(enrollmentRef, { state: "credited", creditedAt: now, creditedOrderId: orderId, pointsEach: REFERRAL_CAMPAIGN.pointsPerPerson });
  return new Set([referrerUid, customerUid]);
  };
}
