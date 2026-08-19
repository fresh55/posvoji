import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getMessages } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";
import "../globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-sans" });

export const metadata: Metadata = {
  // Link previews need absolute URLs, and a static export has no request to
  // build one from, so every relative URL below is resolved against this.
  metadataBase: new URL(SITE_URL),
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
