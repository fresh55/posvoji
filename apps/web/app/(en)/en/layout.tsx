import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { getMessages } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";
import "../../globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-sans" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Posvoji.si",
  description: getMessages("en").metadataDescription,
};

// Without this, env(safe-area-inset-*) resolves to 0 on iOS: the page draws
// under the notch and home indicator, but nothing is told it may.
export const viewport: Viewport = { viewportFit: "cover" };

export default function EnglishLayout({ children }: LayoutProps<"/en">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
