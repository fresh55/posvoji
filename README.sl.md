<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
    <img src="docs/assets/logo.svg" alt="Logotip Posvoji.si" width="120">
  </picture>
</p>

# Posvoji.si

Odprt in brezplačen seznam živali iz slovenskih zavetišč, ki iščejo dom.

**[English](README.md)** · [Za razvijalce](CONTRIBUTING.md) ·
[Predlagaj zavetišče](../../issues/new/choose) ·
[Podatkovna politika](docs/DATA-POLICY.md)

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

```text
spletna stran zavetišča ──▶ vljuden zajem ──▶ podatki ──▶ statična spletna stran
```

## Za zavetišča

**Vaše vsebine ostanejo vaše.** Fotografije in avtorski opisi se prikažejo
samo z vašim izrecnim dovoljenjem. Obseg dovoljenja je zapisan v repozitoriju,
sistem pa nedovoljenega vira ne more vklopiti.

Zavetišče lahko kadarkoli zahteva:

- spremembo prikaza ali navedbe vira;
- umik fotografij ali opisov;
- redkejše osveževanje;
- popoln izklop vira.

Zahteve za umik imajo prednost. Podrobnosti so v
[podatkovni politiki](docs/DATA-POLICY.md).

Pri samodejnem zajemu se `PosvojiBot` predstavi s kontaktom, spoštuje
`robots.txt`, pošilja največ eno zahtevo naenkrat na strežnik, med zahtevami
čaka in ob omejitvah odneha. Tudi mačke poznajo meje. 🐈

## Ste našli napako?

Napačen podatek, zastarela objava ali žival, ki je že našla dom?
[Odprite prijavo](../../issues/new/choose). Ne vpisujte osebnih podatkov drugih
ljudi.

## Za razvijalce

Potrebujete **Node.js 22+** in **pnpm 10**. Podatkovne zbirke, ključev API ali
zunanjih storitev ne potrebujete; testi uporabljajo majhne lokalne vzorce.

```bash
pnpm install
pnpm test
pnpm --filter web dev
```

Navodila za prispevanje so v [CONTRIBUTING.md](CONTRIBUTING.md), postopek za
nov vir pa v [Adding a provider](docs/ADDING-A-PROVIDER.md).

## Licence

Aplikaciji v `apps/*` sta pod licenco **AGPL-3.0-only**; sheme, SDK in adapterji
v `packages/*` ter `providers/*` so pod licenco **MIT**.

Fotografije, opisi in vzorci HTML so gradivo tretjih oseb. Odprtokodne licence
repozitorija jih ne pokrivajo.
