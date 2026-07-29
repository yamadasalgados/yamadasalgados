"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Network,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";

import { useSellerSession } from "@/app/_components/SellerSessionContext";

type Copies = "both" | "production" | "customer";
type ConnectionMode = "local" | "preview" | "windows" | "cups" | "tcp";

type PrintProfileResponse = {
  id: string;
  name: string;
  stationName: string;
  enabled: boolean;
  autoPrint: boolean;
  copies: Copies;
  connectionMode: ConnectionMode;
  printerName: string;
  networkHost: string;
  networkPort: number;
  paperWidthMm: 58 | 80;
  dpi: number;
  dotsPerLine: number;
  intensity: number;
  useAdvancedThreshold: boolean;
  rasterThreshold: number;
  cutAfterPrint: boolean;
  feedLines: number;
  windowsPrintSettings: string;
  lpOptions: string;
  copyDelayMs: number;
  configured: boolean;
  tokenPrefix: string;
  online: boolean;
  lastSeenAt: string | null;
  lastPrintedAt: string | null;
  lastError: string | null;
  reportedStationName: string | null;
  stationVersion: string | null;
  platform: string | null;
  arch: string | null;
};

type PrintSettingsResponse = {
  schemaVersion: number;
  enabled: boolean;
  profiles: PrintProfileResponse[];
};

const EMPTY: PrintSettingsResponse = {
  schemaVersion: 2,
  enabled: true,
  profiles: [],
};

export default function PrinterSettingsCard({ lang }: { lang: string }) {
  const { user, sellerId } = useSellerSession();
  const [settings, setSettings] = useState<PrintSettingsResponse>(EMPTY);
  const [stationTokens, setStationTokens] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const copy = useMemo(() => getCopy(lang), [lang]);

  const callApi = useCallback(
    async (body?: Record<string, unknown>) => {
      const token = await user.getIdToken(true);
      const url = body
        ? "/api/print/settings"
        : `/api/print/settings?sellerId=${encodeURIComponent(sellerId)}`;
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify({ sellerId, ...body }) } : {}),
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        settings?: PrintSettingsResponse;
        token?: string;
        profileId?: string;
        error?: string;
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "PRINT_SETTINGS_FAILED");
      return payload;
    },
    [sellerId, user],
  );

  const refresh = useCallback(async (statusOnly = false) => {
    setError("");
    try {
      const payload = await callApi();
      if (payload.settings) {
        if (!statusOnly) {
          setSettings(payload.settings);
        } else {
          setSettings((current) => ({
            ...current,
            schemaVersion: payload.settings!.schemaVersion,
            enabled: payload.settings!.enabled,
            profiles: payload.settings!.profiles.map((remote) => {
              const local = current.profiles.find((profile) => profile.id === remote.id);
              if (!local) return remote;
              return {
                ...local,
                configured: remote.configured,
                tokenPrefix: remote.tokenPrefix,
                online: remote.online,
                lastSeenAt: remote.lastSeenAt,
                lastPrintedAt: remote.lastPrintedAt,
                lastError: remote.lastError,
                reportedStationName: remote.reportedStationName,
                stationVersion: remote.stationVersion,
                platform: remote.platform,
                arch: remote.arch,
              };
            }),
          }));
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "PRINT_SETTINGS_FAILED");
    } finally {
      setLoading(false);
    }
  }, [callApi]);

  useEffect(() => {
    void refresh(false);
    const timer = window.setInterval(() => void refresh(true), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const run = useCallback(
    async (workingKey: string, body: Record<string, unknown>, successMessage: string) => {
      setWorkingId(workingKey);
      setError("");
      setMessage("");
      try {
        const payload = await callApi(body);
        if (payload.settings) setSettings(payload.settings);
        if (payload.token && payload.profileId) {
          setStationTokens((current) => ({ ...current, [payload.profileId!]: payload.token! }));
        }
        setMessage(successMessage);
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "PRINT_SETTINGS_FAILED");
      } finally {
        setWorkingId("");
      }
    },
    [callApi],
  );

  const updateLocalProfile = useCallback((profileId: string, patch: Partial<PrintProfileResponse>) => {
    setSettings((current) => ({
      ...current,
      profiles: current.profiles.map((profile) =>
        profile.id === profileId ? { ...profile, ...patch } : profile,
      ),
    }));
  }, []);

  if (loading) {
    return (
      <section className="rounded-3xl border border-violet-200 bg-violet-50/60 p-5 dark:border-violet-900/50 dark:bg-violet-950/20">
        <p className="text-sm font-black text-violet-700 dark:text-violet-200">{copy.loading}</p>
      </section>
    );
  }

  return (
    <section className="space-y-5 rounded-3xl border border-violet-200 bg-violet-50/60 p-5 dark:border-violet-900/50 dark:bg-violet-950/20">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Printer className="mt-0.5 h-5 w-5 shrink-0 text-violet-700 dark:text-violet-300" />
          <div>
            <h2 className="font-black">{copy.title}</h2>
            <p className="mt-1 max-w-3xl text-xs font-semibold leading-relaxed text-violet-900/75 dark:text-violet-200/80">
              {copy.subtitle}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh(false)}
          className="rounded-xl border border-violet-200 bg-white p-2 dark:border-violet-800 dark:bg-neutral-950"
          aria-label={copy.refresh}
        >
          <RefreshCw size={17} />
        </button>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-white p-4 dark:border-violet-900/50 dark:bg-neutral-950/60">
        <span>
          <b className="block text-sm">{copy.globalEnabled}</b>
          <small className="mt-1 block font-semibold text-neutral-500">{copy.globalEnabledHelp}</small>
        </span>
        <input
          type="checkbox"
          checked={settings.enabled}
          disabled={Boolean(workingId)}
          onChange={(event) => {
            const enabled = event.target.checked;
            setSettings((current) => ({ ...current, enabled }));
            void run("global", { action: "update_global", enabled }, copy.saved);
          }}
          className="h-5 w-5 accent-violet-700"
        />
      </label>

      <div className="space-y-4">
        {settings.profiles.map((profile, index) => (
          <ProfileCard
            key={profile.id}
            profile={profile}
            index={index}
            sellerId={sellerId}
            token={stationTokens[profile.id] || ""}
            working={workingId === profile.id}
            copy={copy}
            onChange={(patch) => updateLocalProfile(profile.id, patch)}
            onSave={() => void run(profile.id, {
              action: "update_profile",
              profileId: profile.id,
              profile,
            }, copy.saved)}
            onRotate={() => void run(profile.id, {
              action: "rotate_token",
              profileId: profile.id,
            }, copy.tokenCreated)}
            onTest={() => void run(profile.id, {
              action: "test",
              profileId: profile.id,
            }, copy.queued)}
            onDelete={() => {
              if (!window.confirm(copy.deleteConfirm)) return;
              void run(profile.id, {
                action: "delete_profile",
                profileId: profile.id,
              }, copy.deleted);
            }}
            onCopied={() => setMessage(copy.copied)}
          />
        ))}
      </div>

      <button
        type="button"
        disabled={Boolean(workingId) || settings.profiles.length >= 12}
        onClick={() => void run("new", {
          action: "create_profile",
          profile: {
            name: `${copy.defaultProfile} ${settings.profiles.length + 1}`,
            stationName: `${copy.defaultStation} ${settings.profiles.length + 1}`,
            connectionMode: "preview",
            enabled: true,
            autoPrint: true,
            copies: "both",
          },
        }, copy.created)}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-violet-400 bg-white px-4 py-3 text-sm font-black text-violet-800 disabled:opacity-50 dark:border-violet-700 dark:bg-neutral-950 dark:text-violet-200"
      >
        <Plus size={18} /> {copy.addProfile}
      </button>

      {message && (
        <p className="flex items-center gap-2 text-sm font-black text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 size={17} /> {message}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-black text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      )}
    </section>
  );
}

function ProfileCard({
  profile,
  index,
  sellerId,
  token,
  working,
  copy,
  onChange,
  onSave,
  onRotate,
  onTest,
  onDelete,
  onCopied,
}: {
  profile: PrintProfileResponse;
  index: number;
  sellerId: string;
  token: string;
  working: boolean;
  copy: ReturnType<typeof getCopy>;
  onChange: (patch: Partial<PrintProfileResponse>) => void;
  onSave: () => void;
  onRotate: () => void;
  onTest: () => void;
  onDelete: () => void;
  onCopied: () => void;
}) {
  const isTcp = profile.connectionMode === "tcp";
  const needsQueue = profile.connectionMode === "windows" || profile.connectionMode === "cups";
  const setupText = token
    ? [
        "PRINT_BASE_URL=https://SEU-DOMINIO",
        `PRINT_SELLER_ID=${sellerId}`,
        `PRINT_PROFILE_ID=${profile.id}`,
        `PRINT_STATION_TOKEN=${token}`,
        `PRINT_STATION_NAME=${profile.stationName}`,
      ].join("\n")
    : "";

  return (
    <article className="space-y-4 rounded-3xl border border-violet-200 bg-white p-4 shadow-sm dark:border-violet-900/60 dark:bg-neutral-950/70">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-100 font-black text-violet-800 dark:bg-violet-950 dark:text-violet-200">
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black">{profile.name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-neutral-500">
              {profile.online ? <Wifi size={13} className="text-emerald-600" /> : <WifiOff size={13} />}
              {profile.online ? copy.online : copy.offline}
              {profile.platform ? ` · ${profile.platform}/${profile.arch || "?"}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black">
            {copy.enabled}
            <input
              type="checkbox"
              checked={profile.enabled}
              onChange={(event) => onChange({ enabled: event.target.checked })}
              className="h-4 w-4 accent-violet-700"
            />
          </label>
          <button type="button" onClick={onDelete} disabled={working} className="rounded-xl border p-2 text-red-600 disabled:opacity-50" aria-label={copy.delete}>
            <Trash2 size={17} />
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={copy.profileName} value={profile.name} onChange={(value) => onChange({ name: value })} />
        <Field label={copy.stationName} value={profile.stationName} onChange={(value) => onChange({ stationName: value })} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField label={copy.mode} value={profile.connectionMode} onChange={(value) => onChange({ connectionMode: value as ConnectionMode })}>
          {profile.connectionMode === "local" && <option value="local">{copy.modeLocal}</option>}
          <option value="preview">{copy.modePreview}</option>
          <option value="windows">{copy.modeWindows}</option>
          <option value="cups">{copy.modeCups}</option>
          <option value="tcp">{copy.modeTcp}</option>
        </SelectField>
        <SelectField label={copy.copies} value={profile.copies} onChange={(value) => onChange({ copies: value as Copies })}>
          <option value="both">{copy.both}</option>
          <option value="production">{copy.production}</option>
          <option value="customer">{copy.customer}</option>
        </SelectField>
        <SelectField label={copy.paper} value={String(profile.paperWidthMm)} onChange={(value) => {
          const paperWidthMm = Number(value) === 58 ? 58 : 80;
          onChange({ paperWidthMm, dotsPerLine: paperWidthMm === 58 ? 384 : 576 });
        }}>
          <option value="80">80 mm</option>
          <option value="58">58 mm</option>
        </SelectField>
      </div>

      {needsQueue && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={copy.printerName} value={profile.printerName} onChange={(value) => onChange({ printerName: value })} placeholder={copy.printerPlaceholder} />
          <Field
            label={profile.connectionMode === "windows" ? copy.windowsSettings : copy.cupsOptions}
            value={profile.connectionMode === "windows" ? profile.windowsPrintSettings : profile.lpOptions}
            onChange={(value) => profile.connectionMode === "windows"
              ? onChange({ windowsPrintSettings: value })
              : onChange({ lpOptions: value })}
            placeholder={profile.connectionMode === "windows" ? "fit" : "-o media=Custom.80x200mm"}
          />
        </div>
      )}

      {isTcp && (
        <div className="space-y-3 rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 dark:border-cyan-900/60 dark:bg-cyan-950/20">
          <p className="flex items-center gap-2 text-xs font-black text-cyan-900 dark:text-cyan-200">
            <Network size={16} /> {copy.tcpHelp}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={copy.host} value={profile.networkHost} onChange={(value) => onChange({ networkHost: value })} placeholder="192.168.1.80" />
            <NumberField label={copy.port} value={profile.networkPort} min={1} max={65535} onChange={(value) => onChange({ networkPort: value })} />
            <NumberField label={copy.dots} value={profile.dotsPerLine} min={128} max={2048} onChange={(value) => onChange({ dotsPerLine: value })} />
            <NumberField label={copy.dpi} value={profile.dpi} min={180} max={600} onChange={(value) => onChange({ dpi: value })} />
          </div>
          <label className="block">
            <span className="mb-2 flex justify-between text-xs font-black uppercase tracking-wide">
              <span>{copy.intensity}</span><span>{profile.intensity}%</span>
            </span>
            <input type="range" min="0" max="100" value={profile.intensity} onChange={(event) => onChange({ intensity: Number(event.target.value) })} className="w-full accent-violet-700" />
            <small className="mt-1 block font-semibold text-neutral-500">{copy.intensityHelp}</small>
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-cyan-200 bg-white p-3 text-xs font-black dark:border-cyan-900 dark:bg-neutral-950">
            {copy.advancedThreshold}
            <input type="checkbox" checked={profile.useAdvancedThreshold} onChange={(event) => onChange({ useAdvancedThreshold: event.target.checked })} className="h-4 w-4 accent-violet-700" />
          </label>
          {profile.useAdvancedThreshold && (
            <NumberField label={copy.threshold} value={profile.rasterThreshold} min={1} max={254} onChange={(value) => onChange({ rasterThreshold: value })} />
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex items-center justify-between gap-2 rounded-xl border p-3 text-xs font-black">
          {copy.auto}
          <input type="checkbox" checked={profile.autoPrint} onChange={(event) => onChange({ autoPrint: event.target.checked })} className="h-4 w-4 accent-violet-700" />
        </label>
        <label className="flex items-center justify-between gap-2 rounded-xl border p-3 text-xs font-black">
          {copy.cut}
          <input type="checkbox" checked={profile.cutAfterPrint} onChange={(event) => onChange({ cutAfterPrint: event.target.checked })} className="h-4 w-4 accent-violet-700" />
        </label>
        <NumberField label={copy.feedLines} value={profile.feedLines} min={0} max={20} onChange={(value) => onChange({ feedLines: value })} />
        <NumberField label={copy.copyDelay} value={profile.copyDelayMs} min={0} max={30000} onChange={(value) => onChange({ copyDelayMs: value })} />
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <button type="button" disabled={working} onClick={onSave} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-700 px-3 text-xs font-black text-white disabled:opacity-50">
          <Save size={16} /> {copy.save}
        </button>
        <button type="button" disabled={working} onClick={onRotate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-black disabled:opacity-50">
          <KeyRound size={16} /> {profile.configured ? copy.rotate : copy.generate}
        </button>
        <button type="button" disabled={working || !profile.configured || !profile.enabled} onClick={onTest} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-black disabled:opacity-50">
          <Send size={16} /> {copy.test}
        </button>
        <span className="flex min-h-11 items-center justify-center rounded-xl bg-neutral-100 px-3 font-mono text-[10px] font-bold dark:bg-neutral-900">
          {profile.id}
        </span>
      </div>

      {token && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-xs font-black text-amber-900 dark:text-amber-200">{copy.tokenHelp}</p>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl border border-amber-300 bg-white p-3 font-mono text-[10px] dark:border-amber-800 dark:bg-neutral-950">{setupText}</pre>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(setupText);
              onCopied();
            }}
            className="mt-2 inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-black dark:border-amber-800 dark:bg-neutral-950"
          >
            <Copy size={16} /> {copy.copyConfig}
          </button>
        </div>
      )}

      <div className="text-[11px] font-semibold text-neutral-500">
        <p>{copy.lastSeen}: {formatDate(profile.lastSeenAt, copy.never)} · {copy.lastPrint}: {formatDate(profile.lastPrintedAt, copy.never)}</p>
        {profile.configured && !token && <p>{copy.keyConfigured}: {profile.tokenPrefix}…</p>}
        {profile.lastError && <p className="mt-2 rounded-xl bg-red-50 p-2 font-black text-red-700 dark:bg-red-950/30 dark:text-red-200">{profile.lastError}</p>}
      </div>
    </article>
  );
}

function Field({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-neutral-600 dark:text-neutral-300">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold dark:bg-neutral-950" />
    </label>
  );
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-neutral-600 dark:text-neutral-300">{label}</span>
      <input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value) || min)))} className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold dark:bg-neutral-950" />
    </label>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-neutral-600 dark:text-neutral-300">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-black dark:bg-neutral-950">{children}</select>
    </label>
  );
}

function formatDate(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : fallback;
}

function getCopy(lang: string) {
  if (lang === "ja") {
    return {
      title: "印刷サービスとプリンタープロファイル", subtitle: "店舗ごとに複数の印刷ステーションを登録し、Windows、macOS、Linux、ARM、CUPS、TCP/IP ESC/POSを利用できます。", loading: "印刷設定を読み込んでいます…", refresh: "更新", globalEnabled: "印刷システムを有効にする", globalEnabledHelp: "オフにすると、新しい注文は自動印刷キューへ送信されません。", saved: "印刷設定を保存しました。", created: "プリンタープロファイルを作成しました。", deleted: "プリンタープロファイルを削除しました。", tokenCreated: "新しい接続キーを生成しました。", queued: "テスト印刷をキューに追加しました。", copied: "設定をコピーしました。", addProfile: "プリンタープロファイルを追加", defaultProfile: "プリンター", defaultStation: "ステーション", online: "接続中", offline: "未接続", enabled: "有効", profileName: "プロファイル名", stationName: "ステーション名", mode: "接続方式", modeLocal: "旧ローカル設定", modePreview: "PDFプレビュー", modeWindows: "Windowsドライバー", modeCups: "CUPS (macOS/Linux)", modeTcp: "TCP/IP ESC/POS (9100)", copies: "印刷する控え", both: "製造用 + お客様用", production: "製造用のみ", customer: "お客様用のみ", paper: "用紙幅", printerName: "プリンター/キュー名", printerPlaceholder: "OSに表示される正確な名前", windowsSettings: "Windows印刷設定", cupsOptions: "CUPS詳細オプション", tcpHelp: "LANプリンターへ直接ラスターESC/POSデータを送信します。", host: "プリンターIP/ホスト", port: "TCPポート", dots: "1行のドット数", dpi: "解像度 (DPI)", intensity: "印刷濃度/コントラスト", intensityHelp: "直接ESC/POS印刷のラスター化しきい値を使いやすく調整します。", advancedThreshold: "高度なしきい値を手動設定", threshold: "ラスターしきい値 (1–254)", auto: "新規注文を自動印刷", cut: "各控えの後にカット", feedLines: "カット前の改行数", copyDelay: "控え間の待機時間 (ms)", save: "保存", generate: "接続キーを生成", rotate: "キーを再発行", test: "テスト", delete: "削除", deleteConfirm: "このプリンタープロファイルを削除しますか？", tokenHelp: "キーは一度だけ表示されます。Print Serviceの.envに貼り付けてください。", copyConfig: "設定をコピー", lastSeen: "最終接続", lastPrint: "最終印刷", never: "なし", keyConfigured: "設定済みキー",
    };
  }
  if (lang === "en") {
    return {
      title: "Print Service and printer profiles", subtitle: "Register multiple printer stations per seller and use Windows, macOS, Linux, ARM, CUPS, or direct TCP/IP ESC/POS.", loading: "Loading print settings…", refresh: "Refresh", globalEnabled: "Enable printing system", globalEnabledHelp: "Turning this off stops new orders from entering automatic print queues.", saved: "Print settings saved.", created: "Printer profile created.", deleted: "Printer profile deleted.", tokenCreated: "New connection key generated.", queued: "Test print queued.", copied: "Configuration copied.", addProfile: "Add printer profile", defaultProfile: "Printer", defaultStation: "Station", online: "Online", offline: "Offline", enabled: "Enabled", profileName: "Profile name", stationName: "Station name", mode: "Connection", modeLocal: "Legacy local configuration", modePreview: "PDF preview", modeWindows: "Windows driver", modeCups: "CUPS (macOS/Linux)", modeTcp: "TCP/IP ESC/POS (9100)", copies: "Copies", both: "Production + customer", production: "Production only", customer: "Customer only", paper: "Paper width", printerName: "Printer/queue name", printerPlaceholder: "Exact name shown by the operating system", windowsSettings: "Windows print settings", cupsOptions: "Advanced CUPS options", tcpHelp: "Sends raster ESC/POS data directly to a LAN printer.", host: "Printer IP/host", port: "TCP port", dots: "Dots per line", dpi: "Resolution (DPI)", intensity: "Print intensity/contrast", intensityHelp: "Friendly control for the raster threshold used by direct ESC/POS printing.", advancedThreshold: "Set advanced threshold manually", threshold: "Raster threshold (1–254)", auto: "Auto-print new orders", cut: "Cut after each copy", feedLines: "Feed lines before cut", copyDelay: "Delay between copies (ms)", save: "Save", generate: "Generate connection key", rotate: "Replace key", test: "Test", delete: "Delete", deleteConfirm: "Delete this printer profile?", tokenHelp: "The key is shown once. Paste these values into Print Service .env.", copyConfig: "Copy configuration", lastSeen: "Last connection", lastPrint: "Last print", never: "Never", keyConfigured: "Configured key",
    };
  }
  return {
    title: "Print Service e perfis de impressora", subtitle: "Cadastre várias estações por seller e use Windows, macOS, Linux, ARM, CUPS ou conexão direta TCP/IP ESC/POS.", loading: "Carregando configurações de impressão…", refresh: "Atualizar", globalEnabled: "Ativar sistema de impressão", globalEnabledHelp: "Ao desligar, novos pedidos não entram nas filas automáticas dos perfis.", saved: "Configurações de impressão salvas.", created: "Perfil de impressora criado.", deleted: "Perfil de impressora excluído.", tokenCreated: "Nova chave de conexão gerada.", queued: "Impressão de teste adicionada à fila.", copied: "Configuração copiada.", addProfile: "Adicionar perfil de impressora", defaultProfile: "Impressora", defaultStation: "Estação", online: "Conectada", offline: "Desconectada", enabled: "Ativo", profileName: "Nome do perfil", stationName: "Nome da estação", mode: "Conexão", modeLocal: "Configuração local antiga", modePreview: "Somente gerar PDF", modeWindows: "Driver do Windows", modeCups: "CUPS (macOS/Linux)", modeTcp: "TCP/IP ESC/POS direto (9100)", copies: "Vias", both: "Produção + cliente", production: "Somente produção", customer: "Somente cliente", paper: "Largura do papel", printerName: "Nome da impressora/fila", printerPlaceholder: "Nome exato mostrado pelo sistema operacional", windowsSettings: "Ajustes do Windows", cupsOptions: "Opções avançadas do CUPS", tcpHelp: "Envia o recibo rasterizado diretamente para a impressora LAN, sem depender de driver.", host: "IP/host da impressora", port: "Porta TCP", dots: "Pontos por linha", dpi: "Resolução (DPI)", intensity: "Intensidade/contraste", intensityHelp: "Controle amigável que ajusta o limiar da rasterização ESC/POS direta.", advancedThreshold: "Definir limiar avançado manualmente", threshold: "Limiar raster (1–254)", auto: "Imprimir novos pedidos automaticamente", cut: "Cortar após cada via", feedLines: "Linhas de avanço antes do corte", copyDelay: "Intervalo entre vias (ms)", save: "Salvar perfil", generate: "Gerar chave", rotate: "Substituir chave", test: "Testar", delete: "Excluir", deleteConfirm: "Excluir este perfil de impressora?", tokenHelp: "A chave aparece uma única vez. Cole estes valores no arquivo .env do Print Service.", copyConfig: "Copiar configuração", lastSeen: "Última conexão", lastPrint: "Última impressão", never: "Nunca", keyConfigured: "Chave configurada",
  };
}
