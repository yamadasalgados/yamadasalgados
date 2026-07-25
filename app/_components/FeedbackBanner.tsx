import type { ReactNode } from "react";

const STYLE = {
  error:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200",
  info:
    "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200",
} as const;

export default function FeedbackBanner({
  tone,
  children,
  role = "status",
}: {
  tone: keyof typeof STYLE;
  children: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div role={role} className={`rounded-2xl border px-4 py-3.5 text-sm font-bold ${STYLE[tone]}`}>
      {children}
    </div>
  );
}
