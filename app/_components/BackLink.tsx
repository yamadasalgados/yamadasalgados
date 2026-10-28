import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function BackLink({
  href,
  label,
  className = "",
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={[
        "inline-flex min-h-11 items-center gap-2 rounded-xl border border-neutral-200/80 bg-neutral-100/70 px-3.5 py-2 text-xs font-black text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-950 active:scale-[0.98] dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-200 dark:hover:border-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-white",
        className,
      ].join(" ")}
    >
      <ArrowLeft size={16} className="shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}