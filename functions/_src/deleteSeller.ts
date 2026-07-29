// functions/src/deleteSeller.ts
import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import cors from "cors";

if (!admin.apps.length) admin.initializeApp();

const corsMiddleware = cors({ origin: true });

async function isAdminUser(
  uid: string,
  token: admin.auth.DecodedIdToken,
): Promise<boolean> {
  if (token.admin === true || token.role === "admin") return true;

  const snapshot = await admin.firestore().doc(`users/${uid}`).get();
  return snapshot.data()?.role === "admin";
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

        // A autorização vem da role/claim, nunca de uma lista fixa de e-mails.
        if (!(await isAdminUser(decoded.uid, decoded))) {
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
