import type { Metadata, Viewport } from "next";
import { I18nProvider } from "@/app/lib/i18n"; // Ajustado para _old
import StoreNavClientOnly from "@/app/_components/StoreNavClientOnly"; // Ajustado para _old
import PwaRegister from "@/app/_components/PwaRegister"; // Ajustado para _old
import PWAClient from "@/app/_components/pwa-client"; // Ajustado para _old
import "./globals.css";

export const metadata: Metadata = {
  title: "Order System",
  description: "Gerenciamento de Eventos e Vendas",
  manifest: "/manifest.json",
};

// Configuração estrita de Viewport ideal para Mobile/PWA (Evita zoom indesejado no Safari)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt" suppressHydrationWarning>
      <head>
        {/* Script anti-flash para evitar flickering branco no Dark Mode */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('yamada_theme_v1');
                  var supportDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  if (!theme && supportDarkMode) theme = 'dark';
                  if (!theme) theme = 'light';
                  
                  document.documentElement.dataset.theme = theme;
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                    document.documentElement.style.colorScheme = 'dark';
                  } else {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.style.colorScheme = 'light';
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>

      <body className="antialiased bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 transition-colors duration-300">
        <I18nProvider>
          {/* Inicializadores do PWA vindos da pasta de backup */}
          <PwaRegister />
          <PWAClient />

          <div className="flex min-h-screen flex-col">
            <StoreNavClientOnly />
            <main className="flex-1 flex flex-col">{children}</main>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}