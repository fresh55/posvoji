# Podatkovna politika Posvoji.si

Ta dokument je zaveza projekta zavetiščem, posvojiteljem in prispevkarjem.
Strojno berljiva različica teh pravil živi v `providers/*/policy.yaml` in jo
preverja CI. Provider, ki pravil ne izpolnjuje, se tehnično ne more vklopiti.

Različica za zavetišča, brez sheme in imen datotek, je na strani
[Vsebine in dovoljenja](https://posvoji.si/o-nas/vsebine)
([English](https://posvoji.si/en/about/content)). Stran izriše
`apps/web/components/data-policy-page.tsx` iz lastnega besedila, zato
spremenjeno načelo tukaj pomeni spremembo tudi tam.

## Načela

1. **Dovoljenje pred zajemom.** Provider se vklopi šele, ko zavetišče pisno
   dovoli uporabo svojih podatkov. Dovoljenje je zabeleženo z datumom v
   `policy.yaml`. Parser brez dovoljenja lahko obstaja v repozitoriju, vendar
   je izklopljen.

2. **Dejstva, ne vsebine.** Privzeto indeksiramo samo objektivna dejstva: ime
   živali, vrsto, spol, približno starost, status, zavetišče in povezavo na
   izvorno objavo. Fotografije in avtorski opisi se prikažejo samo v obsegu,
   ki ga zavetišče izrecno dovoli.

3. **Vir je vedno viden.** Vsaka žival ima navedeno zavetišče, čas zadnje
   sinhronizacije in povezavo na originalno objavo. Posvojitev vedno poteka
   pri zavetišču.

4. **Brez osebnih podatkov.** Ne zbiramo in ne objavljamo podatkov zasebnih
   lastnikov, posvojiteljev ali prosilcev. Rubrike tipa "oddajo lastniki" in
   "privat oddaja" so trajno izključene. Številk mikročipov ne shranjujemo.
   Shema podatkov takšna polja zavrne že tehnično.

5. **Vljuden zajem.** Crawler se predstavi kot `PosvojiBot` s kontaktom,
   spoštuje `robots.txt`, `Retry-After`, `ETag`/`Last-Modified`, pošilja
   največ eno zahtevo naenkrat na strežnik z večsekundnim razmikom in ob
   napakah odneha. Družbenih omrežij ne zajemamo.

6. **Pravica do izhoda.** Zavetišče lahko kadarkoli zahteva spremembo prikaza,
   izključitev fotografij, nižjo frekvenco osveževanja ali popolno izključitev,
   prek [obrazca](../../issues/new/choose) ali po e-pošti. Zahteve za
   odstranitev obravnavamo prednostno.

7. **Neposredna objava.** Zavetišče, ki nima lastnega seznama živali, lahko
   svoje živali objavi neposredno prek portala. Objavimo to, kar zavetišče
   vnese. Izvorna objava take živali je njena objava na Posvoji.si, zato je
   pri njej kot vir navedena javna stran zavetišča na Posvoji.si, torej
   `/zavetisca/<slug>`; vir zapiše `listingSourceUrl` v
   `apps/ingest/src/portal-listings.ts`. Portal je za prijavljene in ni vir.
   Umik objave je v rokah zavetišča. Tehnični opis je v
   [MANUAL-LISTINGS.md](MANUAL-LISTINGS.md).

   Portal zavetišču nikjer ne pove, da je vnos hkrati dovoljenje za prikaz
   vnesenega. Dokler tega ne pove, tega ne trdimo ne tukaj ne na strani za
   zavetišča.

## Kaj dovoljenje zavetišča ureja

- prikaz pomanjšanih fotografij in njihovo tehnično predpomnjenje,
- ali fotografija sme biti vključena v sliko za predogled povezave
  (`images: cache-permitted`); brez tega dovoljenja žival dobi tipografsko
  kartico brez fotografije,
- ali smemo prikazati logotip zavetišča (`logo.use: permitted`); logotip je
  znamka zavetišča in ne spada pod dovoljenje za fotografije živali, zato ima
  svoj vpis in svoj datum,
- obseg opisa (samo dejstva / kratek izvleček / celoten opis),
- frekvenco osveževanja in morebitne izključene poti,
- način navedbe vira.

Avtorske pravice ostajajo v celoti zavetišču oziroma izvornim imetnikom.
Vsebine zavetišč niso del odprtokodne licence repozitorija in niso odprt
dataset.

---

## English summary

Posvoji.si is a permission-first index. Providers only run with the shelter's
written, dated permission recorded in `policy.yaml` (CI-enforced). By default
only objective facts are indexed; photos and creative descriptions require
explicit permission, and that permission also decides whether a photo may be
drawn into the animal's link preview card. A shelter's logo is its trademark
rather than one of its animal photographs, so it carries its own dated grant
(`logo.use`) and is not covered by the photo permission. Every animal links back to its
source. No personal data
of private individuals is ever collected, private-owner listings are excluded,
and the crawler is conservative: identified bot, robots.txt, one request at a
time to any one server, and it gives up rather than retrying when a server
errors. A shelter with no catalogue of its own can list animals directly
through the portal; we publish what it enters, its original listing is the one
on Posvoji.si, and the source credited is that shelter's own public page here.
The shelter withdraws a listing itself. Shelters can change or revoke their
participation at any time; shelter content is not covered by the repository's
open-source licence.
