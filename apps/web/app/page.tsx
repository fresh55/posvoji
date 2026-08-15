import { AnimalGrid } from "@/components/animal-grid";
import { loadAnimals } from "@/lib/dataset";

export default function Home() {
  const animals = loadAnimals();

  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between border-b py-4">
        <span className="font-medium tracking-tight">posvoji.si</span>
        <a
          href="https://github.com/fresh55/posvoji"
          target="_blank"
          rel="noreferrer"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          GitHub
        </a>
      </header>

      <main className="flex-1 space-y-10 py-12">
        <div className="space-y-2">
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
            Najdi svojega psa ali mačko.
          </h1>
          <p className="text-muted-foreground">
            Živali iz slovenskih zavetišč na enem mestu.
          </p>
        </div>

        <AnimalGrid animals={animals} />
      </main>

      <footer className="border-t py-6 text-xs leading-relaxed text-muted-foreground">
        Podatke zagotavljajo zavetišča. Pri vsaki živali je naveden vir in
        povezava na izvorno objavo — posvojitev vedno poteka pri zavetišču.
      </footer>
    </div>
  );
}
