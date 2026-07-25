import type { ReactNode } from "react";

export default function PageHeader({
  eyebrow,
  back,
  title,
  description,
  action,
  meta,
}: {
  eyebrow?: string;
  back?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between lg:p-7">
        <div className="min-w-0">
          {back && <div className="mb-3">{back}</div>}

          {eyebrow && (
            <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600 dark:text-orange-300">
              {eyebrow}
            </p>
          )}

          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            {title}
          </h1>

          {description && (
            <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
              {description}
            </p>
          )}
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>

      {meta && (
        <div className="border-t border-neutral-100 bg-neutral-50/80 px-5 py-4 dark:border-neutral-800 dark:bg-neutral-950/40 sm:px-6 lg:px-7">
          {meta}
        </div>
      )}
    </header>
  );
}
