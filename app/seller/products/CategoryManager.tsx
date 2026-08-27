"use client";

import { useMemo, useState } from "react";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { ChevronDown, ChevronRight, Plus, Save, Trash2, X } from "lucide-react";

import { db } from "@/app/lib/firebase";
import { normalizeCategoryLabel, slugify } from "./product-catalog-utils";
import type { SellerCategoryDoc, SellerCategoryNames } from "./product-types";

type Props = {
  sellerId: string;
  ownerUid: string;
  categories: SellerCategoryDoc[];
  lang: string;
  disabled?: boolean;
  onClose?: () => void;
};

type Draft = {
  id: string;
  names: SellerCategoryNames;
  parentId: string;
  order: string;
  tags: string;
  mixedPackEligible: boolean;
  isNew?: boolean;
};

const emptyNames = (): SellerCategoryNames => ({ pt: "", en: "", ja: "" });

function categoryLabel(category: SellerCategoryDoc, lang: string) {
  const preferred = lang === "ja" ? category.names.ja : lang === "en" ? category.names.en : category.names.pt;
  return preferred || category.names.pt || category.names.en || category.names.ja || category.name || category.id;
}

function createsCycle(categories: SellerCategoryDoc[], categoryId: string, parentId: string) {
  if (!parentId) return false;
  if (parentId === categoryId) return true;
  const byId = new Map(categories.map((category) => [category.id, category]));
  let cursor: string | null = parentId;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === categoryId) return true;
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return false;
}

export default function CategoryManager({ sellerId, ownerUid, categories, lang, disabled = false, onClose }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const copy = lang === "ja"
    ? {
        title: "カテゴリー 2.0",
        subtitle: "階層、翻訳、表示順、タグ、ミックスパック対象を管理します。",
        add: "カテゴリーを追加",
        edit: "編集",
        namePt: "名前 (PT)", nameEn: "名前 (EN)", nameJa: "名前 (JA)", parent: "親カテゴリー", root: "ルートカテゴリー",
        order: "表示順", tags: "タグ（カンマ区切り）", capacity: "このカテゴリーの商品をミックスパックで選択可能にする",
        save: "保存", cancel: "キャンセル", remove: "削除", confirmDelete: "このカテゴリーを削除しますか？ 商品は削除されません。",
        invalidName: "少なくとも1つの言語で名前を入力してください。", cycle: "カテゴリー階層が循環しています。", saved: "保存しました。",
      }
    : lang === "en"
      ? {
          title: "Categories 2.0",
          subtitle: "Manage hierarchy, translations, display order, tags, and mixed-pack eligibility.",
          add: "Add category",
          edit: "Edit",
          namePt: "Name (PT)", nameEn: "Name (EN)", nameJa: "Name (JA)", parent: "Parent category", root: "Root category",
          order: "Display order", tags: "Tags (comma separated)", capacity: "Products in this category are eligible for Mixed Packs",
          save: "Save", cancel: "Cancel", remove: "Delete", confirmDelete: "Delete this category? Products will not be deleted.",
          invalidName: "Enter a name in at least one language.", cycle: "This parent would create a category cycle.", saved: "Saved.",
        }
      : {
          title: "Categorias 2.0",
          subtitle: "Gerencie hierarquia, traduções, ordem, tags e elegibilidade para Pack Misto.",
          add: "Adicionar categoria",
          edit: "Editar",
          namePt: "Nome (PT)", nameEn: "Nome (EN)", nameJa: "Nome (JA)", parent: "Categoria pai", root: "Categoria raiz",
          order: "Ordem de exibição", tags: "Tags (separadas por vírgula)", capacity: "Produtos desta categoria podem ser usados em Pack Misto",
          save: "Salvar", cancel: "Cancelar", remove: "Excluir", confirmDelete: "Excluir esta categoria? Os produtos não serão apagados.",
          invalidName: "Informe o nome em pelo menos um idioma.", cycle: "Essa categoria pai criaria um ciclo na hierarquia.", saved: "Salvo.",
        };

  const ordered = useMemo(() => {
    const byParent = new Map<string, SellerCategoryDoc[]>();
    for (const category of categories) {
      const key = category.parentId || "";
      byParent.set(key, [...(byParent.get(key) || []), category]);
    }
    for (const list of byParent.values()) {
      list.sort((a, b) => a.order - b.order || categoryLabel(a, lang).localeCompare(categoryLabel(b, lang)));
    }
    const result: Array<{ category: SellerCategoryDoc; depth: number }> = [];
    const visited = new Set<string>();
    const visit = (parentId: string, depth: number) => {
      for (const category of byParent.get(parentId) || []) {
        if (visited.has(category.id)) continue;
        visited.add(category.id);
        result.push({ category, depth });
        visit(category.id, depth + 1);
      }
    };
    visit("", 0);
    for (const category of categories) {
      if (!visited.has(category.id)) result.push({ category, depth: 0 });
    }
    return result;
  }, [categories, lang]);

  const startNew = () => {
    setError("");
    setExpanded("__new__");
    setDraft({ id: "", names: emptyNames(), parentId: "", order: String(categories.length + 1), tags: "", mixedPackEligible: false, isNew: true });
  };

  const startEdit = (category: SellerCategoryDoc) => {
    setError("");
    setExpanded(category.id);
    setDraft({
      id: category.id,
      names: { ...category.names },
      parentId: category.parentId || "",
      order: String(category.order),
      tags: category.tags.join(", "),
      mixedPackEligible: category.capabilities.mixedPackEligible,
    });
  };

  const save = async () => {
    if (!draft || saving || disabled) return;
    const names: SellerCategoryNames = {
      pt: normalizeCategoryLabel(draft.names.pt),
      en: normalizeCategoryLabel(draft.names.en),
      ja: normalizeCategoryLabel(draft.names.ja),
    };
    const fallbackName = names.pt || names.en || names.ja;
    if (!fallbackName) {
      setError(copy.invalidName);
      return;
    }
    const id = draft.id || `${slugify(fallbackName)}-${Date.now().toString(36).slice(-5)}`;
    if (createsCycle(categories, id, draft.parentId)) {
      setError(copy.cycle);
      return;
    }
    const orderValue = Number(draft.order);
    const order = Number.isFinite(orderValue) ? Math.trunc(orderValue) : 0;
    const tags = Array.from(new Set(draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean))).slice(0, 30);
    setSaving(true);
    setError("");
    try {
      await setDoc(doc(db, "sellers", sellerId, "categories", id), {
        schemaVersion: 2,
        ownerUid,
        name: fallbackName,
        slug: id,
        names,
        parentId: draft.parentId || null,
        order,
        tags,
        capabilities: { mixedPackEligible: draft.mixedPackEligible },
        ...(draft.isNew ? { createdAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setDraft(null);
      setExpanded(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a categoria.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (category: SellerCategoryDoc) => {
    if (disabled || saving || !window.confirm(copy.confirmDelete)) return;
    setSaving(true);
    setError("");
    try {
      await deleteDoc(doc(db, "sellers", sellerId, "categories", category.id));
      if (expanded === category.id) {
        setExpanded(null);
        setDraft(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível excluir a categoria.");
    } finally {
      setSaving(false);
    }
  };

  const editor = draft ? (
    <div className="mt-3 space-y-4 rounded-2xl border border-orange-200 bg-orange-50/70 p-4 dark:border-orange-900/50 dark:bg-orange-950/20">
      <div className="grid gap-3 sm:grid-cols-3">
        {(["pt", "en", "ja"] as const).map((language) => (
          <label key={language} className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wider">{language === "pt" ? copy.namePt : language === "en" ? copy.nameEn : copy.nameJa}</span>
            <input value={draft.names[language]} onChange={(event) => setDraft({ ...draft, names: { ...draft.names, [language]: event.target.value } })} disabled={saving || disabled} className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
          </label>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[11px] font-black uppercase tracking-wider">{copy.parent}</span>
          <select value={draft.parentId} onChange={(event) => setDraft({ ...draft, parentId: event.target.value })} disabled={saving || disabled} className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900">
            <option value="">{copy.root}</option>
            {ordered.filter(({ category }) => category.id !== draft.id).map(({ category, depth }) => (
              <option key={category.id} value={category.id}>{`${"— ".repeat(depth)}${categoryLabel(category, lang)}`}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-black uppercase tracking-wider">{copy.order}</span>
          <input type="number" value={draft.order} onChange={(event) => setDraft({ ...draft, order: event.target.value })} disabled={saving || disabled} className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
        </label>
      </div>
      <label className="space-y-1 block">
        <span className="text-[11px] font-black uppercase tracking-wider">{copy.tags}</span>
        <input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} disabled={saving || disabled} placeholder="fritos, festa, delivery" className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
      </label>
      <label className="flex items-start gap-3 rounded-xl border border-orange-200 bg-white p-3 text-sm font-bold dark:border-orange-900/50 dark:bg-neutral-900">
        <input type="checkbox" checked={draft.mixedPackEligible} onChange={(event) => setDraft({ ...draft, mixedPackEligible: event.target.checked })} disabled={saving || disabled} className="mt-0.5 h-5 w-5 accent-orange-600" />
        <span>{copy.capacity}</span>
      </label>
      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => { setDraft(null); setExpanded(null); setError(""); }} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-neutral-300 px-4 text-sm font-black dark:border-neutral-700"><X size={16} />{copy.cancel}</button>
        <button type="button" onClick={save} disabled={saving || disabled} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-black text-white disabled:opacity-50"><Save size={16} />{copy.save}</button>
      </div>
    </div>
  ) : null;

  return (
    <section className="rounded-3xl border border-orange-200 bg-white p-4 shadow-sm dark:border-orange-900/50 dark:bg-neutral-900 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-black">{copy.title}</h2>
          <p className="mt-1 text-sm font-semibold text-neutral-500 dark:text-neutral-400">{copy.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={startNew} disabled={saving || disabled} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-black text-white disabled:opacity-50"><Plus size={16} />{copy.add}</button>
          {onClose ? <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-300 dark:border-neutral-700"><X size={18} /></button> : null}
        </div>
      </div>

      {expanded === "__new__" ? editor : null}

      <div className="mt-5 space-y-2">
        {ordered.map(({ category, depth }) => {
          const isOpen = expanded === category.id;
          return (
            <div key={category.id} style={{ marginLeft: `${Math.min(depth, 4) * 18}px` }} className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-950/40">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => isOpen ? (setExpanded(null), setDraft(null)) : startEdit(category)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
                  {isOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-black">{categoryLabel(category, lang)}</p>
                    {category.capabilities.mixedPackEligible ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black uppercase text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">Pack Misto</span> : null}
                    <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-black text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">#{category.order}</span>
                  </div>
                  <p className="mt-1 truncate text-[11px] font-semibold text-neutral-400">PT: {category.names.pt || "—"} · EN: {category.names.en || "—"} · JA: {category.names.ja || "—"}</p>
                </div>
                <button type="button" onClick={() => startEdit(category)} disabled={saving || disabled} className="rounded-xl border border-neutral-300 px-3 py-2 text-xs font-black dark:border-neutral-700">{copy.edit}</button>
                <button type="button" onClick={() => remove(category)} disabled={saving || disabled} className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 text-red-600 dark:border-red-900/60 dark:text-red-300" aria-label={copy.remove}><Trash2 size={16} /></button>
              </div>
              {isOpen ? editor : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
