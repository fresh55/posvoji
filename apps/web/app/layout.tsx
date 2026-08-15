import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Posvoji.si",
  description:
    "Odprt indeks živali iz slovenskih zavetišč, ki iščejo dom. Vsaka žival z jasnim virom in povezavo na zavetišče.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sl" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
