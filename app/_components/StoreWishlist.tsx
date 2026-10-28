"use client";
import Link from "next/link";
import { Heart, Bell, BellOff, Gift, ImageIcon, Minus, Plus } from "lucide-react";
import type { CustomerWishlist } from "@/app/hooks/useCustomerWishlist";

type Language = "pt" | "en" | "ja";
const UI = {
  pt: { add: "Salvar nos favoritos", remove: "Remover dos favoritos", login: "Entre para salvar favoritos", my: "Meus favoritos", wait: "Receber aviso quando voltar", note: "O aviso depende das notificações ativadas no aparelho. Você pode desativar quando quiser.", signin: "Entre para guardar seus produtos preferidos.", open: "Ver favoritos", empty: "Ainda não escolheu favoritos." },
  en: { add: "Save to wishlist", remove: "Remove from wishlist", login: "Sign in to save favorites", my: "My wishlist", wait: "Notify me when back in stock", note: "Alerts require device push notifications. Turn off any time.", signin: "Sign in to save favorites.", open: "View favorites", empty: "No favorites yet." },
  ja: { add: "お気に入りに追加", remove: "お気に入りを解除", login: "ログインして保存", my: "お気に入り", wait: "再入荷したら通知", note: "通知には端末のプッシュ通知の許可が必要です。いつでも解除できます。", signin: "ログインしてお気に入りを保存しましょう。", open: "お気に入りを見る", empty: "お気に入りはまだありません。" },
};
export function WishlistHeart({ id, wishlist, language, next }: { id: string; wishlist: CustomerWishlist; language: Language; next: string }) {
  const t = UI[language];
  // Merchants can browse the store, but must not turn their seller identity into a customer wallet.
  if (wishlist.blocked) return null;
  if (!wishlist.active) {
    return <Link href={`/customer/login?next=${encodeURIComponent(next)}`} aria-label={t.login}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-300 bg-white/95 text-neutral-800 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"><Heart size={20} /></Link>;
  }
  const liked = wishlist.ids.has(id);
  return <button type="button" disabled={wishlist.busy === id || wishlist.loading} onClick={() => void wishlist.toggle(id)}
    aria-label={liked ? t.remove : t.add} aria-pressed={liked} title={liked ? t.remove : t.add}
    className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-sm disabled:opacity-40 ${liked ? "border-rose-400 bg-rose-50 text-rose-600 dark:bg-rose-950" : "border-neutral-300 bg-white/95 text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"}`}>
    <Heart size={20} fill={liked ? "currentColor" : "none"} />
  </button>;
}
type FavoriteProduct = {
  id: string;
  name: string;
  imageUrl?: string;
  priceLabel: string;
  quantity: number;
  soldOut: boolean;
  atStockLimit: boolean;
  configurableBundle: boolean;
};

type WishlistShelfProps = {
  wishlist: CustomerWishlist;
  language: Language;
  products: FavoriteProduct[];
  onView: (id: string) => void;
  onAdd: (id: string) => void;
  onDecrease: (id: string) => void;
  onConfigureBundle: (id: string) => void;
  next: string;
};

export function WishlistShelf({
  wishlist, language, products, onView, onAdd, onDecrease, onConfigureBundle, next,
}: WishlistShelfProps) {
  const t = UI[language];
  const copy = language === "ja"
    ? { add: "追加", customize: "セットを選ぶ", edit: "セットを変更", soldOut: "売り切れ", decrease: "数量を減らす", increase: "数量を増やす", view: "商品を見る", qty: "カート内の数量" }
    : language === "en"
      ? { add: "Add", customize: "Customize kit", edit: "Edit kit", soldOut: "Sold out", decrease: "Decrease quantity", increase: "Increase quantity", view: "View product", qty: "In cart" }
      : { add: "Adicionar", customize: "Montar kit", edit: "Editar kit", soldOut: "Esgotado", decrease: "Diminuir quantidade", increase: "Aumentar quantidade", view: "Ver produto", qty: "No carrinho" };
  const favorites = products.filter(p => wishlist.ids.has(p.id));
  if (!wishlist.active || wishlist.ids.size === 0) return null;
  return <section className="my-4 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900" aria-label={t.my}>
    <details>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-bold"><Heart size={19} className="text-rose-600" />{t.my} ({wishlist.ids.size}) <span className="ml-auto text-xs font-normal text-neutral-500">{t.open} ▾</span></summary>
      <div className="pt-3">
        {favorites.length ? <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3" aria-label={t.my}>
          {favorites.map(p => <article key={p.id} className="w-40 shrink-0 snap-start overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950 sm:w-44">
            <button type="button" onClick={() => onView(p.id)} aria-label={`${copy.view}: ${p.name}`} className="block w-full text-left">
              <div className="aspect-[4/3] overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center"><ImageIcon size={24} className="text-neutral-400" /></span>}
              </div>
              <div className="space-y-1 px-2.5 pt-2">
                <span className="block min-h-10 text-sm font-bold leading-5 line-clamp-2">{p.name}</span>
                <span className="block text-sm font-black">{p.priceLabel}</span>
              </div>
            </button>
            <div className="p-2.5 pt-2">
              {p.configurableBundle ? (
                <button type="button" disabled={p.soldOut && p.quantity === 0} onClick={() => onConfigureBundle(p.id)}
                  aria-label={`${p.quantity ? copy.edit : copy.customize}: ${p.name}`}
                  className="flex min-h-11 w-full items-center justify-center gap-1 rounded-lg bg-neutral-950 px-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-neutral-950">
                  <Gift size={15} aria-hidden="true" />{p.soldOut && p.quantity === 0 ? copy.soldOut : p.quantity ? copy.edit : copy.customize}
                </button>
              ) : p.quantity > 0 ? (
                <div className="flex min-h-11 items-center justify-between gap-1" aria-label={`${copy.qty}: ${p.quantity}`}>
                  <button type="button" onClick={() => onDecrease(p.id)} aria-label={`${copy.decrease}: ${p.name}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-300 dark:border-neutral-700"><Minus size={17} /></button>
                  <span className="min-w-0 text-center text-sm font-black" aria-live="polite">{p.quantity}</span>
                  <button type="button" onClick={() => onAdd(p.id)} disabled={p.atStockLimit || p.soldOut} aria-label={`${copy.increase}: ${p.name}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-neutral-950"><Plus size={17} /></button>
                </div>
              ) : (
                <button type="button" disabled={p.soldOut || p.atStockLimit} onClick={() => onAdd(p.id)}
                  aria-label={`${copy.add}: ${p.name}`}
                  className="flex min-h-11 w-full items-center justify-center gap-1 rounded-lg bg-neutral-950 px-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-neutral-950">
                  <Plus size={16} aria-hidden="true" />{p.soldOut ? copy.soldOut : copy.add}
                </button>
              )}
            </div>
          </article>)}
        </div> : <p className="text-sm text-neutral-500">{wishlist.ids.size > 0 ? (language === "ja" ? "現在非表示の商品もお気に入りに保存されています。" : language === "en" ? "Saved favorites are currently unavailable in the catalog." : "Há favoritos salvos que não estão disponíveis no catálogo atual.") : t.empty}</p>}
        <label className="mt-3 flex min-h-12 items-center gap-3 rounded-xl bg-neutral-100 p-3 text-sm font-bold dark:bg-neutral-800">
          <input type="checkbox" checked={wishlist.enabled} disabled={Boolean(wishlist.busy)} onChange={e => void wishlist.setAlerts(e.target.checked)} className="h-5 w-5" />{wishlist.enabled ? <Bell size={19} /> : <BellOff size={19} />}{t.wait}
        </label>
        <p className="mt-2 text-xs text-neutral-500">{t.note} <Link href={`/customer/profile?next=${encodeURIComponent(next)}`} className="underline">{language === "ja" ? "通知設定" : language === "en" ? "Notifications" : "Configurar notificações"}</Link></p>
      </div>
    </details>
    {wishlist.error && <p role="alert" className="mt-2 text-sm text-red-600">{wishlist.error}</p>}
  </section>;
}
