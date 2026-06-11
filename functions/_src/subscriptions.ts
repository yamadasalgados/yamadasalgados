// functions/src/subscriptions.ts
import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

/** ✅ Secret para proteger ativação (webhook/painel) */
const BILLING_WEBHOOK_SECRET = defineSecret("BILLING_WEBHOOK_SECRET");

/**
 * POST /activateSubscription
 * Headers:
 *   x-billing-secret: <BILLING_WEBHOOK_SECRET>
 *
 * Body JSON:
 * {
 *   "uid": "sellerUid",
 *   "plan": "monthly" | "yearly" | "custom",
 *   "days": 30,               // opcional (default 30 no monthly)
 *   "graceDays": 0            // opcional (default 0)
 * }
 */
export const activateSubscription = onRequest(
  {
    region: "asia-northeast1",
    secrets: [BILLING_WEBHOOK_SECRET],
  },
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({ ok: false, error: "Method not allowed" });
        return;
      }

      const secret = String(req.header("x-billing-secret") || "").trim();
      const expected = (BILLING_WEBHOOK_SECRET.value() || "").trim();

      if (!expected) {
        res.status(500).json({ ok: false, error: "Missing BILLING_WEBHOOK_SECRET on server" });
        return;
      }

      if (!secret || secret !== expected) {
        res.status(401).json({ ok: false, error: "Unauthorized" });
        return;
      }

      const body = (req.body || {}) as any;

      const uid = typeof body.uid === "string" ? body.uid.trim() : "";
      const plan = typeof body.plan === "string" ? body.plan.trim() : "monthly";

      const graceDaysRaw = Number(body.graceDays);
      const graceDays = Number.isFinite(graceDaysRaw) ? Math.max(0, Math.floor(graceDaysRaw)) : 0;

      let days: number;
      if (plan === "yearly") days = 365;
      else if (plan === "monthly") days = 30;
      else {
        const daysRaw = Number(body.days);
        days = Number.isFinite(daysRaw) ? Math.max(1, Math.floor(daysRaw)) : 30;
      }

      if (!uid) {
        res.status(400).json({ ok: false, error: "Missing uid" });
        return;
      }

      const userRef = db.collection("users").doc(uid);
      const now = admin.firestore.Timestamp.now();
      const expiresAt = admin.firestore.Timestamp.fromMillis(
        now.toMillis() + days * 24 * 60 * 60 * 1000
      );

      await userRef.set(
        {
          isActive: true,
          blockedReason: admin.firestore.FieldValue.delete(),
          subscription: {
            status: "active",
            plan,
            startedAt: now,
            expiresAt,
            lastPaymentAt: now,
            graceDays,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      res.status(200).json({ ok: true, uid, plan, days, graceDays, expiresAt: expiresAt.toDate().toISOString() });
    } catch (err: any) {
      console.error("[activateSubscription] error:", err);
      res.status(500).json({ ok: false, error: err?.message || "Unknown error" });
    }
  }
);

/**
 * ✅ Cron diário: expira subscriptions vencidas
 * - roda todo dia 03:10 JST (ajuste se quiser)
 *
 * Observação:
 * - Cloud Scheduler usa timezone do cron que você define.
 */
export const expireSubscriptionsDaily = onSchedule(
  {
    region: "asia-northeast1",
    schedule: "10 3 * * *",
    timeZone: "Asia/Tokyo",
  },
  async () => {
    const now = admin.firestore.Timestamp.now();

    // pega usuários ativos (seller) com subscription ativa e expiresAt <= now
    // (Filtro por role é opcional — depende do seu Firestore)
    const snap = await db
      .collection("users")
      .where("subscription.status", "==", "active")
      .where("subscription.expiresAt", "<=", now)
      .get();

    if (snap.empty) {
      console.log("[expireSubscriptionsDaily] nothing to expire");
      return;
    }

    console.log(`[expireSubscriptionsDaily] expiring ${snap.size} users`);

    const batch = db.batch();

    snap.docs.forEach((doc) => {
      batch.set(
        doc.ref,
        {
          isActive: false,
          blockedReason: "subscription_expired",
          subscription: {
            status: "expired",
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    await batch.commit();
    console.log("[expireSubscriptionsDaily] done");
  }
);
