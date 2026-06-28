import "./globals.css";
import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";

// Self-hosted at build time (no runtime third-party request, no layout shift).
const fontSans = Space_Grotesk({
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
import RouteProgress from "@/components/organisms/route-progress/RouteProgress";

export const metadata: Metadata = {
  title: "Sunday",
  description: "Where productivity meets peace of mind",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
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
        <ThemeProvider>
          <ConfirmProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </ConfirmProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
