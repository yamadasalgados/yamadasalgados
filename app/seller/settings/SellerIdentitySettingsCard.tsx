"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  AtSign,
  ImageIcon,
  Link2,
  LoaderCircle,
  Mail,
  Palette,
  Phone,
  ReceiptText,
  Save,
  Store,
  Trash2,
  Upload,
} from "lucide-react";

import { useSellerSession } from "@/app/_components/SellerSessionContext";
import FeedbackBanner from "@/app/_components/FeedbackBanner";
import { db } from "@/app/lib/firebase";
import {
  EMPTY_SELLER_IDENTITY,
  normalizeSellerIdentity,
  sellerIdentityWritePayload,
  sellerInitials,
  type SellerIdentity,
} from "@/app/lib/seller-identity";
import {
  uploadSellerBrandAsset,
  validateSellerBrandAsset,
} from "@/app/lib/seller-branding-upload";

type Language = "pt" | "en" | "ja";

type IdentityCopy = {
  title: string;
  subtitle: string;
  publicName: string;
  publicNameHelp: string;
  description: string;
  descriptionPlaceholder: string;
  logo: string;
  logoHelp: string;
  banner: string;
  bannerHelp: string;
  chooseImage: string;
  removeImage: string;
  colors: string;
  primaryColor: string;
  accentColor: string;
  contacts: string;
  contactsHelp: string;
  phone: string;
  publicEmail: string;
  whatsapp: string;
  instagram: string;
  website: string;
  receipt: string;
  receiptHelp: string;
  receiptHeader: string;
  receiptFooter: string;
  preview: string;
  save: string;
  saving: string;
  saved: string;
  loading: string;
  requiredName: string;
  invalidImage: string;
  logoTooLarge: string;
  bannerTooLarge: string;
};

const COPY: Record<Language, IdentityCopy> = {
  pt: {
    title: "Identidade white-label",
    subtitle:
      "Defina como sua marca aparece na loja, nos eventos e nas próximas etapas de recibos e notificações.",
    publicName: "Nome comercial público",
    publicNameHelp: "Este nome será exibido aos clientes.",
    description: "Descrição da loja",
    descriptionPlaceholder: "Apresente sua loja, seus produtos e seu diferencial.",
    logo: "Logo",
    logoHelp: "PNG, JPG ou WebP. Máximo de 5 MB.",
    banner: "Banner ou capa",
    bannerHelp: "Imagem horizontal. Máximo de 10 MB.",
    chooseImage: "Escolher imagem",
    removeImage: "Remover",
    colors: "Cores da marca",
    primaryColor: "Cor principal",
    accentColor: "Cor de contraste",
    contacts: "Contatos públicos",
    contactsHelp: "Preencha apenas os contatos que deseja exibir ou usar no atendimento.",
    phone: "Telefone",
    publicEmail: "E-mail público",
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    website: "Site",
    receipt: "Dados-base do recibo",
    receiptHelp:
      "Esses textos ficarão disponíveis para a etapa 06D6 de recibos personalizados.",
    receiptHeader: "Texto acima dos dados do pedido",
    receiptFooter: "Texto no rodapé",
    preview: "Prévia da identidade",
    save: "Salvar identidade",
    saving: "Salvando identidade…",
    saved: "Identidade da loja salva.",
    loading: "Carregando identidade…",
    requiredName: "Informe o nome comercial público.",
    invalidImage: "Selecione um arquivo de imagem válido.",
    logoTooLarge: "O logo deve ter no máximo 5 MB.",
    bannerTooLarge: "O banner deve ter no máximo 10 MB.",
  },
  en: {
    title: "White-label identity",
    subtitle:
      "Define how your brand appears in the store, events, and upcoming receipt and notification features.",
    publicName: "Public business name",
    publicNameHelp: "This is the name customers will see.",
    description: "Store description",
    descriptionPlaceholder: "Introduce your store, products, and what makes it different.",
    logo: "Logo",
    logoHelp: "PNG, JPG, or WebP. Maximum 5 MB.",
    banner: "Banner or cover",
    bannerHelp: "Horizontal image. Maximum 10 MB.",
    chooseImage: "Choose image",
    removeImage: "Remove",
    colors: "Brand colors",
    primaryColor: "Primary color",
    accentColor: "Contrast color",
    contacts: "Public contacts",
    contactsHelp: "Fill only the contacts you want to display or use for support.",
    phone: "Phone",
    publicEmail: "Public email",
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    website: "Website",
    receipt: "Receipt identity base",
    receiptHelp:
      "These texts will be available for stage 06D6 personalized receipts.",
    receiptHeader: "Text above order details",
    receiptFooter: "Footer text",
    preview: "Identity preview",
    save: "Save identity",
    saving: "Saving identity…",
    saved: "Store identity saved.",
    loading: "Loading identity…",
    requiredName: "Enter the public business name.",
    invalidImage: "Select a valid image file.",
    logoTooLarge: "The logo must be no larger than 5 MB.",
    bannerTooLarge: "The banner must be no larger than 10 MB.",
  },
  ja: {
    title: "ホワイトラベル店舗情報",
    subtitle:
      "店舗、イベント、今後のレシートや通知に表示するブランド情報を設定します。",
    publicName: "公開店舗名",
    publicNameHelp: "お客様に表示される名称です。",
    description: "店舗紹介",
    descriptionPlaceholder: "店舗、商品、特徴を紹介してください。",
    logo: "ロゴ",
    logoHelp: "PNG、JPG、WebP。最大5MB。",
    banner: "バナー・カバー",
    bannerHelp: "横長画像。最大10MB。",
    chooseImage: "画像を選択",
    removeImage: "削除",
    colors: "ブランドカラー",
    primaryColor: "メインカラー",
    accentColor: "コントラストカラー",
    contacts: "公開連絡先",
    contactsHelp: "表示または問い合わせに使用する連絡先のみ入力してください。",
    phone: "電話番号",
    publicEmail: "公開メール",
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    website: "ウェブサイト",
    receipt: "レシート基本情報",
    receiptHelp: "06D6のカスタムレシートで使用できる文章です。",
    receiptHeader: "注文情報の上に表示する文章",
    receiptFooter: "フッター文章",
    preview: "表示プレビュー",
    save: "店舗情報を保存",
    saving: "保存中…",
    saved: "店舗情報を保存しました。",
    loading: "店舗情報を読み込んでいます…",
    requiredName: "公開店舗名を入力してください。",
    invalidImage: "有効な画像ファイルを選択してください。",
    logoTooLarge: "ロゴは5MB以下にしてください。",
    bannerTooLarge: "バナーは10MB以下にしてください。",
  },
};

function assetErrorMessage(error: unknown, copy: IdentityCopy): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "BRAND_ASSET_MUST_BE_IMAGE") return copy.invalidImage;
  if (code === "LOGO_FILE_TOO_LARGE") return copy.logoTooLarge;
  if (code === "BANNER_FILE_TOO_LARGE") return copy.bannerTooLarge;
  return code || "BRAND_IDENTITY_SAVE_FAILED";
}

function normalizeLanguage(value: string): Language {
  return value === "en" || value === "ja" ? value : "pt";
}

export default function SellerIdentitySettingsCard({
  language,
}: {
  language: string;
}) {
  const copy = COPY[normalizeLanguage(language)];
  const session = useSellerSession();

  const [identity, setIdentity] = useState<SellerIdentity>(
    EMPTY_SELLER_IDENTITY,
  );
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [bannerPreview, setBannerPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const snapshot = await getDoc(doc(db, "sellers", session.sellerId));
        if (!cancelled) {
          setIdentity(
            snapshot.exists()
              ? normalizeSellerIdentity(snapshot.data())
              : {
                  ...EMPTY_SELLER_IDENTITY,
                  storeName: session.profile.storeName || "",
                },
          );
        }
      } catch (loadError: unknown) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "BRAND_IDENTITY_LOAD_FAILED",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [session.profile.storeName, session.sellerId]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview("");
      return;
    }
    const preview = URL.createObjectURL(logoFile);
    setLogoPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [logoFile]);

  useEffect(() => {
    if (!bannerFile) {
      setBannerPreview("");
      return;
    }
    const preview = URL.createObjectURL(bannerFile);
    setBannerPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [bannerFile]);

  const effectiveLogo = logoPreview || identity.logoUrl;
  const effectiveBanner = bannerPreview || identity.bannerUrl;

  const previewStyle = useMemo(
    () => ({
      borderColor: identity.primaryColor,
      boxShadow: `0 16px 50px ${identity.primaryColor}20`,
    }),
    [identity.primaryColor],
  );

  const updateIdentity = useCallback(
    <Key extends keyof SellerIdentity>(key: Key, value: SellerIdentity[Key]) => {
      setIdentity((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const updateContact = useCallback(
    (key: keyof SellerIdentity["contact"], value: string) => {
      setIdentity((current) => ({
        ...current,
        contact: { ...current.contact, [key]: value },
      }));
    },
    [],
  );

  const updateReceipt = useCallback(
    (key: keyof SellerIdentity["receipt"], value: string) => {
      setIdentity((current) => ({
        ...current,
        receipt: { ...current.receipt, [key]: value },
      }));
    },
    [],
  );

  const handleAsset = useCallback(
    (
      kind: "logo" | "banner",
      event: ChangeEvent<HTMLInputElement>,
    ) => {
      const file = event.target.files?.[0] || null;
      event.target.value = "";
      if (!file) return;

      try {
        validateSellerBrandAsset(file, kind);
        setError("");
        setMessage("");
        if (kind === "logo") setLogoFile(file);
        else setBannerFile(file);
      } catch (assetError: unknown) {
        setError(assetErrorMessage(assetError, copy));
      }
    },
    [copy],
  );

  const save = useCallback(async () => {
    const normalizedName = identity.storeName.trim();
    if (!normalizedName) {
      setError(copy.requiredName);
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      let logoUrl = identity.logoUrl;
      let bannerUrl = identity.bannerUrl;

      if (logoFile) {
        logoUrl = await uploadSellerBrandAsset({
          sellerId: session.sellerId,
          kind: "logo",
          file: logoFile,
        });
      }

      if (bannerFile) {
        bannerUrl = await uploadSellerBrandAsset({
          sellerId: session.sellerId,
          kind: "banner",
          file: bannerFile,
        });
      }

      const nextIdentity: SellerIdentity = {
        ...identity,
        storeName: normalizedName,
        logoUrl,
        bannerUrl,
      };

      await setDoc(
        doc(db, "sellers", session.sellerId),
        {
          ...sellerIdentityWritePayload(nextIdentity),
          updatedAt: serverTimestamp(),
          updatedBy: session.user.uid,
        },
        { merge: true },
      );

      setIdentity(nextIdentity);
      setLogoFile(null);
      setBannerFile(null);
      await session.reloadProfile();
      setMessage(copy.saved);
    } catch (saveError: unknown) {
      console.error("[SellerIdentitySettingsCard] save:", saveError);
      setError(assetErrorMessage(saveError, copy));
    } finally {
      setSaving(false);
    }
  }, [bannerFile, copy, identity, logoFile, session]);

  if (loading) {
    return (
      <section className="rounded-[2rem] border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950 sm:p-8">
        <div className="flex items-center gap-3 text-sm font-black text-neutral-500">
          <LoaderCircle className="h-5 w-5 animate-spin" />
          {copy.loading}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6 rounded-[2rem] border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950 sm:p-8">
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
          style={{ backgroundColor: identity.primaryColor }}
        >
          <Store className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-black">{copy.title}</h2>
          <p className="mt-1 max-w-2xl text-sm font-medium leading-relaxed text-neutral-500">
            {copy.subtitle}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <IdentityField label={copy.publicName} help={copy.publicNameHelp}>
            <input
              value={identity.storeName}
              maxLength={120}
              onChange={(event) => updateIdentity("storeName", event.target.value)}
              className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold dark:border-neutral-700 dark:bg-neutral-900"
            />
          </IdentityField>

          <IdentityField label={copy.description}>
            <textarea
              value={identity.storeDescription}
              maxLength={1200}
              rows={4}
              placeholder={copy.descriptionPlaceholder}
              onChange={(event) =>
                updateIdentity("storeDescription", event.target.value)
              }
              className="w-full resize-none rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          </IdentityField>

          <div className="grid gap-4 sm:grid-cols-2">
            <AssetPicker
              label={copy.logo}
              help={copy.logoHelp}
              imageUrl={effectiveLogo}
              chooseLabel={copy.chooseImage}
              removeLabel={copy.removeImage}
              onSelect={(event) => handleAsset("logo", event)}
              onRemove={() => {
                setLogoFile(null);
                updateIdentity("logoUrl", "");
              }}
              square
            />
            <AssetPicker
              label={copy.banner}
              help={copy.bannerHelp}
              imageUrl={effectiveBanner}
              chooseLabel={copy.chooseImage}
              removeLabel={copy.removeImage}
              onSelect={(event) => handleAsset("banner", event)}
              onRemove={() => {
                setBannerFile(null);
                updateIdentity("bannerUrl", "");
              }}
            />
          </div>

          <div className="rounded-3xl border border-neutral-200 p-5 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-orange-600" />
              <h3 className="text-sm font-black">{copy.colors}</h3>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <ColorField
                label={copy.primaryColor}
                value={identity.primaryColor}
                onChange={(value) => updateIdentity("primaryColor", value)}
              />
              <ColorField
                label={copy.accentColor}
                value={identity.accentColor}
                onChange={(value) => updateIdentity("accentColor", value)}
              />
            </div>
          </div>

          <div className="rounded-3xl border border-neutral-200 p-5 dark:border-neutral-800">
            <div className="flex items-start gap-2">
              <AtSign className="mt-0.5 h-4 w-4 text-orange-600" />
              <div>
                <h3 className="text-sm font-black">{copy.contacts}</h3>
                <p className="mt-1 text-xs font-medium text-neutral-500">
                  {copy.contactsHelp}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <CompactField icon={Phone} label={copy.phone}>
                <input
                  value={identity.contact.phone}
                  maxLength={80}
                  onChange={(event) => updateContact("phone", event.target.value)}
                  className="field-input"
                />
              </CompactField>
              <CompactField icon={Mail} label={copy.publicEmail}>
                <input
                  value={identity.contact.email}
                  maxLength={180}
                  inputMode="email"
                  onChange={(event) => updateContact("email", event.target.value)}
                  className="field-input"
                />
              </CompactField>
              <CompactField icon={Phone} label={copy.whatsapp}>
                <input
                  value={identity.contact.whatsapp}
                  maxLength={80}
                  onChange={(event) =>
                    updateContact("whatsapp", event.target.value)
                  }
                  className="field-input"
                />
              </CompactField>
              <CompactField icon={AtSign} label={copy.instagram}>
                <input
                  value={identity.contact.instagram}
                  maxLength={180}
                  placeholder="@loja"
                  onChange={(event) =>
                    updateContact("instagram", event.target.value)
                  }
                  className="field-input"
                />
              </CompactField>
              <CompactField icon={Link2} label={copy.website} full>
                <input
                  value={identity.contact.website}
                  maxLength={500}
                  inputMode="url"
                  placeholder="https://"
                  onChange={(event) =>
                    updateContact("website", event.target.value)
                  }
                  className="field-input"
                />
              </CompactField>
            </div>
          </div>

          <div className="rounded-3xl border border-neutral-200 p-5 dark:border-neutral-800">
            <div className="flex items-start gap-2">
              <ReceiptText className="mt-0.5 h-4 w-4 text-orange-600" />
              <div>
                <h3 className="text-sm font-black">{copy.receipt}</h3>
                <p className="mt-1 text-xs font-medium text-neutral-500">
                  {copy.receiptHelp}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-4">
              <IdentityField label={copy.receiptHeader}>
                <input
                  value={identity.receipt.headerText}
                  maxLength={500}
                  onChange={(event) =>
                    updateReceipt("headerText", event.target.value)
                  }
                  className="field-input"
                />
              </IdentityField>
              <IdentityField label={copy.receiptFooter}>
                <textarea
                  value={identity.receipt.footerText}
                  maxLength={1000}
                  rows={3}
                  onChange={(event) =>
                    updateReceipt("footerText", event.target.value)
                  }
                  className="field-input resize-none"
                />
              </IdentityField>
            </div>
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-neutral-400">
            {copy.preview}
          </p>
          <div
            className="overflow-hidden rounded-3xl border-2 bg-white dark:bg-neutral-900"
            style={previewStyle}
          >
            <div
              className="h-28 bg-neutral-100 bg-cover bg-center dark:bg-neutral-800"
              style={
                effectiveBanner
                  ? { backgroundImage: `url(${effectiveBanner})` }
                  : { backgroundColor: `${identity.primaryColor}18` }
              }
            />
            <div className="relative px-5 pb-5">
              <div className="-mt-9 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-white text-xl font-black text-white shadow-lg dark:border-neutral-900">
                {effectiveLogo ? (
                  <img
                    src={effectiveLogo}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span
                    className="flex h-full w-full items-center justify-center"
                    style={{ backgroundColor: identity.primaryColor }}
                  >
                    {sellerInitials(identity.storeName)}
                  </span>
                )}
              </div>
              <h3 className="mt-3 break-words text-xl font-black">
                {identity.storeName || copy.publicName}
              </h3>
              {identity.storeDescription && (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-500">
                  {identity.storeDescription}
                </p>
              )}
              <div className="mt-4 flex gap-2">
                <span
                  className="h-7 flex-1 rounded-xl"
                  style={{ backgroundColor: identity.primaryColor }}
                />
                <span
                  className="h-7 flex-1 rounded-xl"
                  style={{ backgroundColor: identity.accentColor }}
                />
              </div>
            </div>
          </div>
        </aside>
      </div>

      {(message || error) && (
        <FeedbackBanner tone={error ? "error" : "success"} role={error ? "alert" : "status"}>
          {error || message}
        </FeedbackBanner>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black py-4 text-sm font-black text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {saving ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {saving ? copy.saving : copy.save}
      </button>
    </section>
  );
}

function IdentityField({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-black">{label}</span>
      {help && <span className="block text-xs font-medium text-neutral-500">{help}</span>}
      {children}
    </label>
  );
}

function CompactField({
  icon: Icon,
  label,
  full = false,
  children,
}: {
  icon: typeof Phone;
  label: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`block space-y-2 ${full ? "sm:col-span-2" : ""}`}>
      <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-neutral-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      {children}
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="block text-xs font-black uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      <div className="flex items-center gap-3 rounded-2xl border border-neutral-300 p-2 dark:border-neutral-700">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-12 cursor-pointer rounded-xl border-0 bg-transparent p-0"
        />
        <input
          value={value}
          readOnly
          aria-label={label}
          className="min-w-0 flex-1 bg-transparent text-sm font-black uppercase outline-none"
        />
      </div>
    </label>
  );
}

function AssetPicker({
  label,
  help,
  imageUrl,
  chooseLabel,
  removeLabel,
  onSelect,
  onRemove,
  square = false,
}: {
  label: string;
  help: string;
  imageUrl: string;
  chooseLabel: string;
  removeLabel: string;
  onSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  square?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-black">{label}</p>
        <p className="mt-1 text-xs font-medium text-neutral-500">{help}</p>
      </div>
      <div
        className={`flex items-center justify-center overflow-hidden rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 ${
          square ? "aspect-square max-h-48" : "aspect-[16/7]"
        }`}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-8 w-8 text-neutral-400" />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-black hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900">
          <Upload className="h-4 w-4" />
          {chooseLabel}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onSelect}
            className="sr-only"
          />
        </label>
        {imageUrl && (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300"
          >
            <Trash2 className="h-4 w-4" />
            {removeLabel}
          </button>
        )}
      </div>
    </div>
  );
}
