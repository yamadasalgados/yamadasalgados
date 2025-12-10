"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, type User, signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  serverTimestamp,
} from "firebase/firestore";

type CategoryType =
  | "Comida"
  | "Lanchonete"
  | "Assados"
  | "Sobremesa"
  | "Festa"
  | "Congelados";

type ProductDoc = {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  category: CategoryType;
  extraImageUrls?: string[];
};

const CATEGORY_ORDER: CategoryType[] = [
  "Comida",
  "Lanchonete",
  "Assados",
  "Sobremesa",
  "Festa",
  "Congelados",
];

type ProductCardProps = {
  product: ProductDoc;
  onEdit: (p: ProductDoc) => void;
  onDelete: (id: string) => void;
};

function ProductCard({ product, onEdit, onDelete }: ProductCardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const allImages = [
    product.imageUrl,
    ...(product.extraImageUrls || []),
  ].filter(Boolean) as string[];

  const mainImage = allImages[currentIndex];

  return (
    <div className="border rounded-xl bg-white overflow-hidden flex flex-col text-xs">
      {/* IMAGEM PRINCIPAL */}
      <div className="w-full bg-neutral-100 overflow-hidden aspect-[4/3]">
        {mainImage ? (
          <img
            src={mainImage}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-[10px] text-neutral-400">
            Sem imagem
          </div>
        )}
      </div>

      {/* MINIATURAS */}
      {allImages.length > 1 && (
        <div className="flex gap-1 px-2 pt-2 pb-1 overflow-x-auto">
          {allImages.map((img, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`h-10 w-10 rounded-md overflow-hidden flex-shrink-0 border ${
                idx === currentIndex
                  ? "border-orange-500"
                  : "border-neutral-200"
              }`}
            >
              <img
                src={img}
                alt={`Foto ${idx + 1}`}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* INFO */}
      <div className="p-3 flex-1 flex flex-col gap-1">
        <p className="text-xs font-semibold line-clamp-2">{product.name}</p>
        <p className="text-[11px] text-neutral-700">
          ¥{product.price.toLocaleString("ja-JP")}
        </p>
        <p className="text-[10px] text-neutral-500">{product.category}</p>
      </div>

      {/* AÇÕES */}
      <div className="px-3 pb-2 flex items-center justify-between gap-2">
        <button
          onClick={() => onEdit(product)}
          className="text-[11px] text-orange-700 underline"
        >
          Editar
        </button>
        <button
          onClick={() => onDelete(product.id)}
          className="text-[11px] text-red-600 underline"
        >
          Excluir
        </button>
      </div>
    </div>
  );
}

export default function ProductsCatalogPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Produtos
  const [products, setProducts] = useState<ProductDoc[]>([]);

  // Form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [extraImagesText, setExtraImagesText] = useState("");
  const [category, setCategory] = useState<CategoryType>("Comida");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 🔐 AUTH
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.replace("/login");
      } else {
        setUser(u);
        setCheckingAuth(false);
      }
    });
  }, [router]);

  // 🔁 PRODUTOS DO VENDEDOR
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "products"), where("sellerId", "==", user.uid));

    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data() as any;
        const extras = Array.isArray(data.extraImageUrls)
          ? data.extraImageUrls.filter((u: any) => typeof u === "string")
          : [];

        return {
          id: d.id,
          name: data.name || "",
          price: Number(data.price || 0),
          imageUrl: data.imageUrl || "",
          category: (data.category as CategoryType) || "Comida",
          extraImageUrls: extras,
        };
      });

      setProducts(list);
    });
  }, [user]);

  // RESETAR
  const resetForm = () => {
    setEditingId(null);
    setName("");
    setPrice("");
    setImageUrl("");
    setExtraImagesText("");
    setCategory("Comida");
    setError(null);
    setSuccessMessage(null);
  };

  // SALVAR
  const handleSave = async () => {
    if (!user) return;

    const numericPrice = Number(price.replace(",", "."));
    if (!name.trim()) return setError("Nome inválido.");
    if (isNaN(numericPrice)) return setError("Preço inválido.");

    const extras = extraImagesText
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);

    const payload = {
      name: name.trim(),
      price: numericPrice,
      category,
      imageUrl: imageUrl.trim(),
      extraImageUrls: extras,
      sellerId: user.uid,
      sellerEmail: user.email,
      updatedAt: serverTimestamp(),
    };

    setSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, "products", editingId), payload);
      } else {
        await addDoc(collection(db, "products"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      resetForm();
      setSuccessMessage("Produto salvo!");
    } catch {
      setError("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  // EDITAR
  const handleEdit = (p: ProductDoc) => {
    setEditingId(p.id);
    setName(p.name);
    setPrice(String(p.price));
    setImageUrl(p.imageUrl);
    setExtraImagesText((p.extraImageUrls || []).join("\n"));
    setCategory(p.category);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // EXCLUIR
  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este produto?")) return;
    await deleteDoc(doc(db, "products", id));
  };

  if (checkingAuth) {
    return (
      <main className="flex h-[70vh] items-center justify-center">
        <p>Carregando...</p>
      </main>
    );
  }

  // Agrupar produtos por categoria
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: products.filter((p) => p.category === cat),
  }));

  return (
    <main className="space-y-8">
      {/* TOPO */}
      <header className="flex justify-between gap-4">
                <div className="space-y-1">
        <h1 className="text-xl font-bold">Catálogo de Produtos</h1>
          </div>

 <div className="flex items-center gap-2">
            <button
            type="button"
            onClick={() => router.back()}
            className="bg-white text-black text-xs px-4 py-2 rounded-full"
          >
            Voltar
          </button>

            <button
            type="button"
            onClick={() => signOut(auth)}
            className="bg-red-500 text-white text-xs px-4 py-2 rounded-full"
          >
            Sair
          </button>
          </div>
      </header>

      {/* FORM */}
      <section className="bg-white p-5 rounded-2xl border shadow-sm space-y-4">
        <h2 className="font-semibold text-sm">
          {editingId ? "Editar produto" : "Novo produto"}
        </h2>

        {/* CAMPOS */}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs">Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs">Preço (¥)</label>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs">Categoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CategoryType)}
              className="w-full border rounded-md px-3 py-2 text-sm bg-white"
            >
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs">Imagem principal</label>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs">Imagens extras (uma por linha)</label>
            <textarea
              value={extraImagesText}
              onChange={(e) => setExtraImagesText(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-xs min-h-[80px]"
            />
          </div>
        </div>

        {error && <p className="text-red-600 text-xs">{error}</p>}
        {successMessage && <p className="text-green-600 text-xs">{successMessage}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-green-600 text-white text-xs px-4 py-2 rounded-full"
          >
            {editingId ? "Atualizar" : "Adicionar"}
          </button>
        </div>
      </section>

      {/* LISTAGEM */}
      {grouped.map(({ cat, items }) => (
        <section key={cat} className="space-y-3">
          <h2 className="text-sm font-semibold">{cat}</h2>

          {items.length === 0 ? (
            <p className="text-xs text-neutral-500">Nenhum produto em {cat}.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {items.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </main>
  );
}
