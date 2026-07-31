import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

export default function SettingsCategoryCard({
  href,
  icon: Icon,
  title,
  description,
  meta,
  accent = "orange",
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  meta?: string;
  accent?: "orange" | "blue" | "emerald" | "violet" | "amber" | "rose" | "neutral";
}) {
  const accentClasses = {
    orange:
      "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-300",
    blue:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300",
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300",
    violet:
      "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/20 dark:text-violet-300",
    amber:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300",
    rose:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300",
    neutral:
      "border-neutral-200 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200",
  } as const;

  return (
    <Link
      href={href}
      className="group flex min-h-40 flex-col rounded-[1.75rem] border border-neutral-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-lg dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
    >
      <div className="flex items-start justify-between gap-4">
        <span
          className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${accentClasses[accent]}`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <ArrowRight className="h-5 w-5 text-neutral-300 transition group-hover:translate-x-1 group-hover:text-neutral-700 dark:text-neutral-700 dark:group-hover:text-neutral-200" />
      </div>

      <div className="mt-5 min-w-0">
        <h2 className="text-base font-black tracking-tight">{title}</h2>
        <p className="mt-2 text-sm font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
          {description}
        </p>
      </div>

      {meta && (
        <p className="mt-auto pt-4 text-[10px] font-black uppercase tracking-[0.16em] text-neutral-400">
          {meta}
        </p>
      )}
    </Link>
  );
}
