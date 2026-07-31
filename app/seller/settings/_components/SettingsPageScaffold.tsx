import type { ReactNode } from "react";

import BackLink from "@/app/_components/BackLink";
import PageHeader from "@/app/_components/PageHeader";
import SettingsSectionNav from "@/app/seller/settings/_components/SettingsSectionNav";

export default function SettingsPageScaffold({
  eyebrow,
  title,
  description,
  backLabel,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  backLabel: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        back={<BackLink href="/seller/settings" label={backLabel} />}
      />
      <SettingsSectionNav />
      {children}
    </main>
  );
}
