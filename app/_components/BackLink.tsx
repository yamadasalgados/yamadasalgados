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
        "inline-flex min-h-9 items-center gap-2 rounded-xl text-xs font-black text-neutral-500 transition hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white",
        className,
      ].join(" ")}
    >
      <ArrowLeft size={15} />
      <span>{label}</span>
    </Link>
  );
}
