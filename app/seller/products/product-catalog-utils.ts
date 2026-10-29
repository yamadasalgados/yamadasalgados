import { getApp } from "firebase/app";
import {
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
} from "firebase/storage";

export function toNum(input: unknown): number {
  const normalized = String(input ?? "")
    .trim()
    .replace(",", ".");
  const value = Number(normalized);

  return Number.isFinite(value)
    ? value
    : Number.NaN;
}

function safeExtFromType(type: string): string {
  const normalized = String(type || "").toLowerCase();

  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";

  return "jpg";
}

export async function uploadImageFile(params: {
  uid: string;
  productIdLike: string;
  file: File;
  onProgress?: (percent: number) => void;
}): Promise<string> {
  const { uid, productIdLike, file, onProgress } = params;
  const maxBytes = 10 * 1024 * 1024; // limite atual das regras Storage
  if (!file || file.size === 0) throw new Error("IMAGE_EMPTY");
  if (file.size > maxBytes) throw new Error("IMAGE_TOO_LARGE");

  // Alguns seletores mobile não informam File.type. Inferir apenas formatos conhecidos.
  const extensionInName = String(file.name || "").toLowerCase().split(".").pop();
  const inferredMime: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    webp: "image/webp", gif: "image/gif", avif: "image/avif",
    heic: "image/heic", heif: "image/heif",
  };
  const contentType = file.type || inferredMime[extensionInName || ""] || "";
  if (!contentType.startsWith("image/") || contentType === "image/svg+xml") {
    throw new Error("IMAGE_UNSUPPORTED_FORMAT");
  }

  const app = getApp();
  const storage = getStorage(app);
  const extension = safeExtFromType(contentType);
  const timestamp = Date.now();
  const cleanName = String(file.name || "image")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 80);

  // Mantém o mesmo prefixo/path por compatibilidade com as regras e produtos antigos.
  const path = `sellers/${uid}/products/${productIdLike}/${timestamp}_${cleanName}.${extension}`;
  const reference = storageRef(storage, path);
  const task = uploadBytesResumable(reference, file, { contentType });

  onProgress?.(0);
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let lastBytes = 0;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;

    const clearTimers = () => {
      if (stallTimer) clearTimeout(stallTimer);
      clearTimeout(totalTimer);
    };
    const finish = () => {
      if (settled) return false;
      settled = true;
      clearTimers();
      return true;
    };
    const fail = (reason: string) => {
      if (!finish()) return;
      task.cancel();
      reject(new Error(reason));
    };
    const resetStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => fail("IMAGE_UPLOAD_STALLED"), 60_000);
    };
    const totalTimer = setTimeout(() => fail("IMAGE_UPLOAD_TIMEOUT"), 180_000);
    resetStallTimer();

    task.on(
      "state_changed",
      (snapshot) => {
        if (settled) return;
        if (snapshot.bytesTransferred > lastBytes) {
          lastBytes = snapshot.bytesTransferred;
          resetStallTimer();
        }
        const percent = Math.round(
          (snapshot.bytesTransferred / Math.max(1, snapshot.totalBytes)) * 100,
        );
        onProgress?.(Math.min(100, Math.max(0, percent)));
      },
      (error) => {
        if (finish()) reject(error);
      },
      () => {
        if (finish()) {
          onProgress?.(100);
          resolve();
        }
      },
    );
  });

  // Mesmo que o upload termine, não manter o formulário preso obtendo o link.
  let urlTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getDownloadURL(reference),
      new Promise<string>((_, reject) => {
        urlTimer = setTimeout(() => reject(new Error("IMAGE_URL_TIMEOUT")), 25_000);
      }),
    ]);
  } finally {
    if (urlTimer) clearTimeout(urlTimer);
  }
}

/** Mensagem legível para problemas de imagem; retorna null para erros não relacionados. */
export function imageUploadFailureMessage(error: unknown, lang: string): string | null {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code || "")
    : "";
  const message = error instanceof Error ? error.message : "";
  const reason = code || message;
  const translations: Record<string, [string, string, string]> = {
    IMAGE_EMPTY: ["A imagem está vazia. Selecione outra.", "The image is empty. Choose another file.", "画像が空です。別の画像を選択してください。"],
    IMAGE_TOO_LARGE: ["Imagem acima de 10 MB. Reduza-a antes de enviar.", "Image exceeds 10 MB. Reduce it before uploading.", "画像が10MBを超えています。縮小してください。"],
    IMAGE_UNSUPPORTED_FORMAT: ["Formato de imagem não aceito. Use JPG, PNG ou WebP.", "Unsupported image format. Use JPG, PNG, or WebP.", "この画像形式には対応していません。JPG、PNG、WebPを使用してください。"],
    IMAGE_UPLOAD_STALLED: ["O envio da imagem parou de avançar por 60 segundos. Verifique a conexão e tente novamente.", "Image upload made no progress for 60 seconds. Check your connection and retry.", "画像のアップロードが60秒間進みませんでした。通信状態を確認して再試行してください。"],
    IMAGE_UPLOAD_TIMEOUT: ["O envio da imagem excedeu 3 minutos. Tente novamente ou use uma imagem menor.", "Image upload exceeded 3 minutes. Retry or use a smaller image.", "画像のアップロードが3分を超えました。再試行するか小さい画像を使用してください。"],
    IMAGE_URL_TIMEOUT: ["A imagem foi enviada, mas não foi possível obter seu link. Tente novamente.", "Image uploaded, but its link could not be retrieved. Please retry.", "画像は送信されましたが、URLを取得できませんでした。再試行してください。"],
    "storage/unauthorized": ["Sem permissão para enviar a imagem. Confira a conta e a loja.", "No permission to upload this image. Check the account and store.", "画像の送信権限がありません。アカウントと店舗を確認してください。"],
    "storage/unauthenticated": ["Sua sessão expirou. Faça login novamente.", "Your session expired. Sign in again.", "ログインの有効期限が切れました。再度ログインしてください。"],
    "storage/retry-limit-exceeded": ["Não foi possível completar o envio. Verifique a conexão e tente novamente.", "Upload could not finish. Check your connection and retry.", "アップロードが完了しませんでした。通信状態を確認して再試行してください。"],
    "storage/quota-exceeded": ["Limite de armazenamento atingido. Entre em contato com o administrador.", "Storage quota exceeded. Contact an administrator.", "ストレージの上限に達しました。管理者に連絡してください。"],
    "storage/canceled": ["Envio da imagem cancelado. Tente novamente.", "Image upload canceled. Please retry.", "画像のアップロードがキャンセルされました。再試行してください。"],
  };
  const translated = translations[reason];
  if (translated) return translated[lang === "ja" ? 2 : lang === "en" ? 1 : 0];
  if (reason.startsWith("storage/")) {
    const prefix = lang === "ja"
      ? "画像のアップロードに失敗しました"
      : lang === "en" ? "Image upload failed" : "Falha no envio da imagem";
    return `${prefix} (${reason}).`;
  }
  return null;
}

function hashText(input: string): string {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

export function slugify(input: string): string {
  const normalized = String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const asciiSlug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

  if (asciiSlug) return asciiSlug;

  return `category-${hashText(normalized || "category")}`;
}

export function normalizeCategoryLabel(input: unknown): string {
  return String(input || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 60);
}

export function categoryKey(input: string): string {
  return normalizeCategoryLabel(input)
    .normalize("NFKC")
    .toLocaleLowerCase();
}

export function mergeCategoryLabels(
  ...groups: string[][]
): string[] {
  const result = new Map<string, string>();

  for (const group of groups) {
    for (const rawName of group) {
      const label = normalizeCategoryLabel(rawName);
      const key = categoryKey(label);

      if (label && key && !result.has(key)) {
        result.set(key, label);
      }
    }
  }

  return Array.from(result.values());
}
