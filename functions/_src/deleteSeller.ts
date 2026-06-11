// functions/src/deleteSeller.ts
import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import cors from "cors";

if (!admin.apps.length) admin.initializeApp();

const corsMiddleware = cors({ origin: true });

const ADMIN_EMAILS = ["will@will.com", "SEU_EMAIL_ADMIN_2@exemplo.com"];

function isAdminEmail(email?: string | null) {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return ADMIN_EMAILS.map((x) => x.trim().toLowerCase()).includes(e);
}

/**
 * DELETE seller com tudo dentro:
 * - sellers/{sellerId} (recursivo)
 * - users/{sellerId} (opcional)
 *
 * POST body: { idToken, sellerId, deleteUserAlso? }
 */
export const deleteSeller = onRequest(
  {
    region: "asia-northeast1",
  },
  (req, res) =>
    corsMiddleware(req, res, async () => {
      try {
        if (req.method !== "POST") {
          return res.status(405).json({ ok: false, error: "Method not allowed" });
        }

        const idToken = String((req.body as any)?.idToken || "").trim();
        const sellerId = String((req.body as any)?.sellerId || "").trim();
        const deleteUserAlso = Boolean((req.body as any)?.deleteUserAlso);

        if (!idToken) return res.status(400).json({ ok: false, error: "Missing idToken" });
        if (!sellerId) return res.status(400).json({ ok: false, error: "Missing sellerId" });

        // ✅ valida token
        const decoded = await admin.auth().verifyIdToken(idToken, true);
        const email = decoded.email ?? null;

        // ✅ só admin
        if (!isAdminEmail(email)) {
          return res.status(403).json({ ok: false, error: "Forbidden: admin only" });
        }

        const db = admin.firestore();

        // (opcional) marca como deleting
        const sellerRef = db.doc(`sellers/${sellerId}`);
        await sellerRef.set(
          { active: false, status: "deleting", deletedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );

        // ✅ delete recursivo (subcoleções incluídas)
        await db.recursiveDelete(sellerRef);

        if (deleteUserAlso) {
          await db.doc(`users/${sellerId}`).delete().catch(() => null);
          // opcional:
          // await admin.auth().deleteUser(sellerId).catch(() => null);
        }

        return res.json({ ok: true, sellerId, deleteUserAlso });
      } catch (err: any) {
        console.error("deleteSeller error:", err);
        return res.status(500).json({ ok: false, error: err?.message || "Unknown error" });
      }
    })
);
