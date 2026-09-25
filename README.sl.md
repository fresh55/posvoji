<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
    <img src="docs/assets/logo.svg" alt="Logotip Posvoji.si: pes, mačka in zajec pod isto streho" width="128">
  </picture>
</p>

<h1 align="center">Posvoji.si</h1>

<p align="center">
  Odprt in brezplačen seznam živali iz slovenskih zavetišč, ki iščejo dom.<br>
  <a href="https://posvoji.si"><b>posvoji.si</b></a>
</p>

<p align="center">
  <a href="https://github.com/fresh55/posvoji/actions/workflows/ci.yml"><img src="https://github.com/fresh55/posvoji/actions/workflows/ci.yml/badge.svg" alt="Stanje CI"></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/fresh55/posvoji"><img src="https://api.scorecard.dev/projects/github.com/fresh55/posvoji/badge" alt="OpenSSF Scorecard"></a>
</p>

<p align="center">
  <b><a href="README.md">English</a></b> ·
  <a href="CONTRIBUTING.md">Za razvijalce</a> ·
  <a href="https://github.com/fresh55/posvoji/issues/new/choose">Predlagaj zavetišče</a> ·
  <a href="docs/DATA-POLICY.md">Podatkovna politika</a> ·
  <a href="SECURITY.md">Varnost</a>
</p>

> [!NOTE]
> Posvoji.si ni zavetišče in ne vodi posvojitev. Vsaka žival je povezana z
> izvirno objavo zavetišča, kjer tudi poteka posvojitev.

## Kaj projekt dela

Posvoji.si na enem mestu zbere osnovna dejstva o živalih iz sodelujočih
zavetišč: ime, vrsto, spol, približno starost in status. Pri vsakem zapisu sta
vidna vir in čas zadnje osvežitve.

- **Najprej dovoljenje.** Vir ostane izklopljen, dokler zavetišče ne izda
  pisnega in datiranega dovoljenja.
- **Vir, ne kopija.** Obiskovalca usmerimo na stran zavetišča; te strani ne
  nadomeščamo.
- **Brez osebnih podatkov.** Zasebni oglasi, kontakti posameznikov in številke
  mikročipov ne sodijo v indeks.
- **Brez družbenih omrežij.** Beremo samo dovoljene spletne strani zavetišč.
- **Portal za zavetišča.** Osebje zavetišča se prijavi in popravi podatke.
  Zavetišče brez lastnega seznama lahko živali objavi neposredno.

```text
spletna stran zavetišča ──▶ vljuden zajem ──▶ podatki ──▶ statična spletna stran
                                  ▲
osebje zavetišča ──▶ zasebni portal ──▶ popravki in neposredne objave
```

## Za zavetišča

**Vaše vsebine ostanejo vaše.** Fotografije, avtorski opisi in vaš logotip se
prikažejo samo z vašim izrecnim dovoljenjem. Obseg dovoljenja je zapisan v
repozitoriju, sistem pa nedovoljenega vira ne more vklopiti.

Zavetišče lahko kadarkoli zahteva:

- spremembo prikaza ali navedbe vira;
- umik fotografij ali opisov;
- redkejše osveževanje;
- popoln izklop vira.

Zahteve za umik imajo prednost. Pišite na
[info@posvoji.si](mailto:info@posvoji.si). Podrobnosti so v
[podatkovni politiki](docs/DATA-POLICY.md).

Pri samodejnem zajemu se `PosvojiBot` predstavi s kontaktom, spoštuje
`robots.txt`, pošilja največ eno zahtevo naenkrat na strežnik, med zahtevami
čaka in ob omejitvah odneha.

## Ste našli napako?

Napačen podatek, zastarela objava ali žival, ki je že našla dom?
[Odprite prijavo](https://github.com/fresh55/posvoji/issues/new/choose).
Prijave so javne, zato ne vpisujte osebnih podatkov drugih ljudi.

Varnostne ranljivosti in vse, kar bi lahko razkrilo osebne podatke, prijavite
zasebno po navodilih v [SECURITY.md](SECURITY.md). Vprašanja o posvojitvi
naslovite na zavetišče, ki žival oskrbuje.

## Za razvijalce

Potrebujete **Node.js 24** (glej `.node-version`) in **pnpm 10**. Za celoten
nabor testov potrebujete še **Python 3.12+** in **uv** za portal zavetišč.
Ključev API ali zunanjih storitev ne potrebujete; testi uporabljajo majhne
lokalne vzorce, portal pa lokalno bazo SQLite.

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm --filter web dev
```

Navodila za prispevanje so v [CONTRIBUTING.md](CONTRIBUTING.md), postopek za
nov vir pa v [Adding a provider](docs/ADDING-A-PROVIDER.md).

## Licence

Aplikacije v `apps/*` so pod licenco **AGPL-3.0-only**; sheme, SDK in adapterji
v `packages/*` ter `providers/*` so pod licenco **MIT**.

Fotografije, opisi, logotipi zavetišč in vzorci HTML so gradivo tretjih oseb.
Odprtokodne licence repozitorija jih ne pokrivajo.

Tudi podatki o živalih na posvoji.si niso na voljo pod odprto licenco.
Zavetišča dovolijo uporabo samo za ta indeks, zato vsaka druga uporaba
potrebuje dovoljenje zavetišča.

`data/shelters.yaml` temelji na javnem registru zavetišč, ki ga vodi Uprava RS
za varno hrano, veterinarstvo in varstvo rastlin (UVHVVR), in na poznejših
preverjanjih spletnih strani zavetišč.

Licence kode ne pokrivajo imena in logotipa Posvoji.si. Odcepljeni projekt
(fork) lahko kodo uporabi, ne sme pa se predstavljati kot Posvoji.si.
