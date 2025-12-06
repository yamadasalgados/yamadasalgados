// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yamada Salgados – Eventos",
  description: "Landing + painel de eventos por vendedora",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-gray-100 text-slate-900">
        <div className="max-w-4xl mx-auto px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
