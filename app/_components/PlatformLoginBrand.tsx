import { PLATFORM_LOGO_PATH } from "@/app/lib/platform-brand";

/** Cabeçalho institucional compartilhado pelos logins; não depende de role/sessão. */
export default function PlatformLoginBrand() {
  return (
    <div className="flex flex-col items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={PLATFORM_LOGO_PATH}
        alt="Order System"
        width={96}
        height={96}
        className="h-24 w-24 rounded-2xl object-cover shadow-sm"
      />
    </div>
  );
}
