import Link from "next/link";
import type { ReactNode } from "react";

export type MetricStripItem = {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "warning" | "danger" | "success" | "violet";
  onClick?: () => void;
  href?: string;
  active?: boolean;
};

const TONE_CLASS = {
  default: "text-neutral-950 dark:text-white",
  warning: "text-amber-700 dark:text-amber-300",
  danger: "text-red-600 dark:text-red-300",
  success: "text-emerald-700 dark:text-emerald-300",
  violet: "text-violet-700 dark:text-violet-300",
} as const;

export default function MetricStrip({ items }: { items: MetricStripItem[] }) {
  const columns =
    items.length >= 7
      ? "lg:grid-cols-4 xl:grid-cols-7"
      : items.length === 6
        ? "lg:grid-cols-3 xl:grid-cols-6"
        : items.length === 5
          ? "lg:grid-cols-5"
          : items.length === 4
            ? "lg:grid-cols-4"
            : items.length === 3
              ? "sm:grid-cols-3"
              : "sm:grid-cols-2";

  return (
    <section className={`grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-200 shadow-sm dark:border-neutral-800 dark:bg-neutral-800 ${columns}`}>
      {items.map((item) => {
        const content = (
          <>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              {item.icon}
              <span>{item.label}</span>
            </div>
            <p className={`mt-2 text-2xl font-black ${TONE_CLASS[item.tone ?? "default"]}`}>
              {item.value}
            </p>
          </>
        );

        const className = [
          "min-w-0 bg-white p-4 text-left transition dark:bg-neutral-900 sm:p-5",
          item.onClick || item.href ? "hover:bg-neutral-50 dark:hover:bg-neutral-800" : "",
          item.active ? "bg-orange-50 ring-1 ring-inset ring-orange-300 dark:bg-orange-950/30 dark:ring-orange-800" : "",
        ].join(" ");

        if (item.href) {
          return (
            <Link key={item.label} href={item.href} className={className}>
              {content}
            </Link>
          );
        }

        return item.onClick ? (
          <button key={item.label} type="button" onClick={item.onClick} className={className}>
            {content}
          </button>
        ) : (
          <div key={item.label} className={className}>
            {content}
          </div>
        );
      })}
    </section>
  );
}
