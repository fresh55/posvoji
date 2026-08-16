import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getMessages } from "@/lib/i18n";
import "../globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Posvoji.si",
  description: getMessages("sl").metadataDescription,
};

export default function SlovenianLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sl" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
