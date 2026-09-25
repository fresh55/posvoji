<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
    <img src="docs/assets/logo.svg" alt="Logotip Posvoji.si: pes, mačka in zajec pod isto streho" width="128">
  </picture>
</p>

<h1 align="center">Posvoji.si</h1>

<p align="center">
  Živali iz slovenskih zavetišč, ki iščejo dom, na enem mestu.<br>
  <a href="https://posvoji.si"><b>posvoji.si</b></a>
</p>

<p align="center">
  <a href="https://github.com/fresh55/posvoji/actions/workflows/ci.yml"><img src="https://github.com/fresh55/posvoji/actions/workflows/ci.yml/badge.svg" alt="Stanje CI"></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/fresh55/posvoji"><img src="https://api.scorecard.dev/projects/github.com/fresh55/posvoji/badge" alt="OpenSSF Scorecard"></a>
</p>

<p align="center">
  <b><a href="README.md">English</a></b> ·
  <a href="CONTRIBUTING.md">Za razvijalce</a> ·
  <a href="docs/DATA-POLICY.md">Podatkovna politika</a> ·
  <a href="SECURITY.md">Varnost</a> ·
  <a href="https://github.com/fresh55/posvoji/issues/new/choose">Prijavi napako</a>
</p>

Slovenska zavetišča objavljajo svoje živali na svojih spletnih straneh, vsako
po svoje. Posvoji.si jih zbere na enem mestu, z enakimi osnovnimi podatki za
vsako žival: ime, vrsta, spol, približna starost, status in zavetišče.

Posvoji.si ne vodi posvojitev. Vsaka žival je povezana na objavo zavetišča
ali, pri zavetišču brez spletne strani, na objavo, ki jo je zavetišče
pripravilo pri nas. Posvojitev vedno poteka pri zavetišču.

> [!IMPORTANT]
> Niso vključena vsa zavetišča, objava pa lahko zaostaja za stranjo
> zavetišča. Pri zavetišču preverite, ali je žival še na voljo.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/preview-sl-dark.png">
  <img src="docs/assets/preview-sl.png" alt="Vrh domače strani posvoji.si: naslov, število zavetišč, zavihki po vrstah s števili in Srečko, maček projekta">
</picture>

## Za zavetišča

Vaše vsebine ostanejo vaše. Vaše živali se prikažejo šele, ko izdate pisno in
datirano dovoljenje, fotografije, opisi in logotip pa samo, če jih dovoljenje
zajema. Kadarkoli lahko zahtevate spremembo prikaza, umik fotografij ali
opisov ali izklop objav. Zahteve za umik imajo prednost:
[info@posvoji.si](mailto:info@posvoji.si).

Zajem se predstavi kot `PosvojiBot`, spoštuje `robots.txt` in pošilja eno
zahtevo naenkrat. Projekt nikoli ne zbira zasebnih oglasov, osebnih podatkov
lastnikov, posvojiteljev ali prosilcev in številk mikročipov. Zavezujoča
pravila so v [podatkovni politiki](docs/DATA-POLICY.md).

## Zagon na svojem računalniku

Potrebujete Node.js 24 in pnpm 10.

```bash
git clone https://github.com/fresh55/posvoji.git
cd posvoji
pnpm install --frozen-lockfile
pnpm --filter web dev
```

Stran se odpre na <http://localhost:3000> s prazno mrežo živali: podatki
nastanejo z zajemom spletnih strani zavetišč in niso v repozitoriju.
Preverjanja pred zahtevo za združitev (pull request) so v
[CONTRIBUTING.md](CONTRIBUTING.md).

## Prispevanje

Koristno je popraviti razčlenjevalnik, ko zavetišče spremeni spletno stran,
dodati zavetišče, ki ga še ni, izboljšati slovensko ali angleško besedilo na
strani in prijaviti napačno objavo. Adapter za novo zavetišče lahko združimo,
preden zavetišče izda dovoljenje, a do takrat ostane izklopljen; glej
[Adding a provider](docs/ADDING-A-PROVIDER.md).

Projekt vzdržuje [@fresh55](https://github.com/fresh55), ki združuje zahteve.

```text
spletna stran zavetišča ──▶ vljuden zajem ──▶ podatki JSON ──▶ statična stran
                                                    ▲
osebje zavetišča ──▶ zasebni portal ────────────────┘
```

## Ste našli napako?

Napačna ali zastarela objava: [odprite prijavo](https://github.com/fresh55/posvoji/issues/new/choose)
in ne vpisujte osebnih podatkov drugih ljudi. Ranljivosti in vse, kar bi lahko
razkrilo osebne podatke, prijavite zasebno po navodilih v
[SECURITY.md](SECURITY.md). Vprašanja o posvojitvi naslovite na zavetišče.

## Licence

Koda je odprtokodna: `apps/*` pod licenco AGPL-3.0-only, `packages/*` in
`providers/*` pod licenco MIT.

Vsebine zavetišč niso. Fotografije, opisi, logotipi in podatki o živalih na
posvoji.si so uporabljeni z dovoljenjem zavetišča samo za to stran; vsaka
druga uporaba potrebuje dovoljenje zavetišča. Licence kode ne pokrivajo imena
in logotipa Posvoji.si. Seznam zavetišč v `data/shelters.yaml` temelji na
javnem registru, ki ga vodi UVHVVR.
