import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sunday",
  description: "Where productivity meets peace of mind",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
