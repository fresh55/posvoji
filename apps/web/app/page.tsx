import { AnimalGrid } from "@/components/animal-grid";
import { Logo } from "@/components/logo";
import { loadDataset } from "@/lib/dataset";
import { plural, SHELTER_FORMS } from "@/lib/labels";

export default function Home() {
  const dataset = loadDataset();
  const animals = dataset?.animals ?? [];
  const shelters = new Set(animals.map((animal) => animal.shelter.id)).size;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-gutter">
      <header className="bleed flex items-center justify-between border-b py-4">
        <span className="flex items-center gap-2 font-medium tracking-tight">
          <Logo className="h-10 w-auto" />
          posvoji.si
        </span>
        <a
          href="https://github.com/fresh55/posvoji"
          target="_blank"
          rel="noreferrer"
          title="Cepljena, sterilizirana, brez znanih napak."
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg viewBox="0 0 16 16" aria-hidden className="size-4 fill-current">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
          <span>
            odprta koda
            <span className="hidden sm:inline">, lahko pomagaš</span>
          </span>
        </a>
      </header>

      <main className="flex flex-1 flex-col gap-rhythm py-rhythm">
        <div className="space-y-2">
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
            Živali iz slovenskih zavetišč, ki iščejo dom.
          </h1>
          {dataset && shelters > 0 && (
            <p className="text-sm text-muted-foreground">
              {plural(shelters, SHELTER_FORMS)} · osveženo{" "}
              {new Date(dataset.generatedAt).toLocaleDateString("sl-SI")}
            </p>
          )}
        </div>

        <AnimalGrid animals={animals} />
      </main>

      <footer className="bleed border-t py-6 text-xs leading-relaxed text-muted-foreground">
        Podatke zagotavljajo zavetišča. Pri vsaki živali je naveden vir in
        povezava na izvorno objavo. Posvojitev vedno poteka pri zavetišču.
      </footer>
    </div>
  );
}
