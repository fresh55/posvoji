import { Inter } from "next/font/google";
import "../globals.css";

// The /dev tree sits outside the (sl) and (en) locale groups, so it needs its
// own root layout to supply <html> and <body>. Kept minimal: no metadata,
// nothing meant to ship, since the pages under here 404 in production.
const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-sans" });

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
