import admin from "firebase-admin";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, "../serviceAccountKey.json"), "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const TARGET_SELLER_ID = "BHGScCY9bIRxtVRLwIlepcKy9SL2";
const TARGET_SELLER_EMAIL = "marinahamaya@gmail.com";

async function migrateGlobalProductsToSeller() {
  const globalSnap = await db.collection("products").get();

  let batch = db.batch();
  let count = 0;

  for (const docSnap of globalSnap.docs) {
    const data = docSnap.data();

    const sellerProductRef = db
      .collection("sellers")
      .doc(TARGET_SELLER_ID)
      .collection("products")
      .doc(docSnap.id);

    batch.set(
      sellerProductRef,
      {
        name: data.name || "",
        category: data.category || "Sem categoria",

        costPrice: Number(data.costPrice || data.shadowCost || 0),
        sellPrice: Number(data.sellPrice || data.price || data.shadowSell || 0),
        shadowCost: Number(data.costPrice || data.shadowCost || 0),
        shadowSell: Number(data.sellPrice || data.price || data.shadowSell || 0),

        quantity: Number(data.quantity || 1),
        stockQty: Number(data.stockQty || 0),
        lowStockThreshold: Number(data.lowStockThreshold || 5),

        imageUrl: data.imageUrl || data.image || "",
        extraImageUrls: Array.isArray(data.extraImageUrls)
          ? data.extraImageUrls
          : [],

        status: data.status || "active",

        ownerUid: TARGET_SELLER_ID,
        sellerId: TARGET_SELLER_ID,
        sellerEmail: TARGET_SELLER_EMAIL,

        migratedFrom: "products",
        migratedFromId: docSnap.id,

        createdAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    count++;

    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }

  await batch.commit();
  console.log(`Migração concluída: ${count} produtos copiados.`);
}

migrateGlobalProductsToSeller().catch(console.error);