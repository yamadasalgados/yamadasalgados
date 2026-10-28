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
    <header className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:rounded-[2rem]">
      <div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between lg:p-7">
        <div className="min-w-0 flex-1">
          {back && <div className="mb-2.5">{back}</div>}

          {eyebrow && (
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-600 dark:text-orange-300">
              {eyebrow}
            </p>
          )}

          <h1 className="mt-1 text-2xl font-black tracking-tight text-neutral-950 dark:text-white sm:text-3xl lg:text-4xl">
            {title}
          </h1>

          {description && (
            <p className="mt-1.5 max-w-3xl text-xs font-medium leading-relaxed text-neutral-500 dark:text-neutral-400 sm:text-sm">
              {description}
            </p>
          )}
        </div>

        {action && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1 lg:pt-0">
            {action}
          </div>
        )}
      </div>

      {meta && (
        <div className="border-t border-neutral-100 bg-neutral-50/80 px-4 py-3.5 dark:border-neutral-800 dark:bg-neutral-950/40 sm:px-6 lg:px-7">
          {meta}
        </div>
      )}
    </header>
  );
}