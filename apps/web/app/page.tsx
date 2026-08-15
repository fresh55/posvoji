import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <Badge variant="secondary">v pripravi</Badge>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Posvoji.si
      </h1>
      <p className="max-w-md text-balance text-lg text-muted-foreground">
        Odprt indeks živali iz slovenskih zavetišč, ki iščejo dom. Vsaka žival
        z jasnim virom in povezavo na svoje zavetišče.
      </p>
    </main>
  );
}
