import type { Metadata, Viewport } from "next";
import { I18nProvider } from "@/app/lib/i18n";
import PwaRegister from "@/app/_components/PwaRegister";
import PWAClient from "@/app/_components/pwa-client";
import GlobalPwaInstallCoach from "@/app/_components/GlobalPwaInstallCoach";
import {
  PLATFORM_DESCRIPTION,
  PLATFORM_LOGO_PATH,
  PLATFORM_NAME,
  PLATFORM_SHORT_NAME,
} from "@/app/lib/platform-brand";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: PLATFORM_NAME,
    template: `%s · ${PLATFORM_NAME}`,
  },
  description: PLATFORM_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  applicationName: PLATFORM_NAME,
  appleWebApp: {
    capable: true,
    title: PLATFORM_SHORT_NAME,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: PLATFORM_LOGO_PATH,
    apple: "/icon-192x192.png",
  },
};

// Configuração estrita de viewport ideal para Mobile/PWA.
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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  // A chave antiga é mantida para preservar a preferência de tema
                  // de usuários que já utilizavam a aplicação antes do white-label.
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
          <PwaRegister />
          <PWAClient />
          <GlobalPwaInstallCoach />

          <div className="flex min-h-screen flex-col">
            <main className="flex-1 flex flex-col">{children}</main>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
