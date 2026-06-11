import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1"; // Forçamos a v1 para usar .region() de forma simples

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();

/**
 * Cria/garante perfil do usuário no Firestore ao cadastrar no Auth.
 */
export const onAuthCreateUserProfile = functions
  .region("asia-northeast1")
  .auth.user()
  .onCreate(async (user: admin.auth.UserRecord) => { // Adicionado o tipo UserRecord
    try {
      const ref = db.collection("users").doc(user.uid);

      await ref.set(
        {
          uid: user.uid,
          email: user.email || null,
          displayName: user.displayName || null,
          phoneNumber: user.phoneNumber || null,

          // padrão
          role: "seller",

          // flags úteis
          isActive: true,
          emailVerified: !!user.emailVerified,

          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      console.log(`[auth] user profile ensured: ${user.uid}`);
    } catch (err) {
      console.error("[auth] onAuthCreateUserProfile failed:", err);
    }
  });