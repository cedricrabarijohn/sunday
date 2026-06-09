import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { locales } from '@/i18n';

// Self-hosted at build time (no runtime third-party request, no layout shift).
const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans-next",
  display: "swap",
});
const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-next",
  display: "swap",
});
import { ThemeProvider } from '@/context/ThemeContext';
import ConfirmProvider from "@/components/organisms/confirm-dialog/ConfirmDialog";
import ToastProvider from "@/components/organisms/toast/ToastProvider";
import RouteProgress from "./RouteProgress";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}


export const metadata: Metadata = {
  title: "Sunday",
  description: "Where productivity meets peace of mind",
  icons: {
    icon: "/favicon.svg",
  },
};

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Fetch messages for the locale
  const messages = await getMessages();
  return (
    <html
      lang={locale}
      data-theme="light"
      className={`${fontSans.variable} ${fontMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t){document.documentElement.setAttribute('data-theme',t)}else if(window.matchMedia('(prefers-color-scheme:dark)').matches){document.documentElement.setAttribute('data-theme','dark')}}catch(e){}})()`
          }}
        />
      </head>
      <body>
        <RouteProgress />
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <ConfirmProvider>
              <ToastProvider>
                {children}
              </ToastProvider>
            </ConfirmProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
