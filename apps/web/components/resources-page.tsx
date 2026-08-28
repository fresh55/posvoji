import { I18nProvider } from "@/components/i18n-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import type { Locale } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

type LocalizedText = Record<Locale, string>;

type Resource = {
  title: string;
  description: LocalizedText;
  organization: string;
  kind: LocalizedText;
  href: string;
};

type ResourceSection = {
  id: string;
  title: LocalizedText;
  resources: Resource[];
};

const sections: ResourceSection[] = [
  {
    id: "dogs-and-cats",
    title: { sl: "Psi in mačke", en: "Dogs and cats" },
    resources: [
      {
        title: "10 mitov o surovi hrani za pse in mačke",
        description: {
          sl: "Je surova hrana res bolj naravna in zdrava? Veterinarska fakulteta pojasnjuje deset najpogostejših mitov ter ključna prehranska in mikrobiološka tveganja.",
          en: "Is raw food really more natural and healthy? The Veterinary Faculty explains ten common myths and the key nutritional and microbiological risks.",
        },
        organization: "UL Veterinarska fakulteta",
        kind: { sl: "Veterinarska fakulteta", en: "Veterinary faculty" },
        href: "https://www.vf.uni-lj.si/novice/10-mitov-o-surovi-hrani-za-pse-macke",
      },
      {
        title:
          "Current Evidence on Raw Meat Diets in Pets: A Natural Symbol, but a Nutritional Controversy",
        description: {
          sl: "Kaj o surovi prehrani dejansko kažejo raziskave? Pregled iz leta 2025 ločuje trditve o koristih od dokumentiranih prehranskih in mikrobioloških tveganj.",
          en: "What does research actually show about raw diets? This 2025 review separates claimed benefits from documented nutritional and microbiological risks.",
        },
        organization: "Animals",
        kind: { sl: "Recenzirani pregled", en: "Peer-reviewed review" },
        href: "https://www.mdpi.com/2076-2615/15/3/293",
      },
      {
        title: "WSAVA Global Nutrition Guidelines",
        description: {
          sl: "Dobra prehrana se začne z oceno posamezne živali. Globalne smernice WSAVA pomagajo povezati telesno kondicijo, življenjsko obdobje, prehrano in zdravstveno stanje.",
          en: "Good nutrition starts with assessing the individual animal. WSAVA connects body condition, life stage, diet and health status.",
        },
        organization: "WSAVA",
        kind: { sl: "Veterinarske smernice", en: "Veterinary guidelines" },
        href: "https://wsava.org/global-guidelines/global-nutrition-guidelines/",
      },
      {
        title:
          "FEDIAF Nutritional Guidelines for Complete and Complementary Pet Food for Cats and Dogs",
        description: {
          sl: "Evropske prehranske smernice določajo referenčne potrebe zdravih psov in mačk po ključnih hranilih ter merila za prehransko popolnost hrane.",
          en: "European guidelines set reference nutrient requirements for healthy cats and dogs and criteria for nutritionally complete food.",
        },
        organization: "FEDIAF",
        kind: {
          sl: "Industrijski prehranski standard",
          en: "Pet food industry standard",
        },
        href: "https://www.fediaf.org/self-regulation/nutritional-guidelines/",
      },
      {
        title: "WSAVA 2024 Guidelines for the Vaccination of Dogs and Cats",
        description: {
          sl: "Cepljenje ni enako za vsakega psa ali mačko. Smernice WSAVA pojasnjujejo razliko med osnovnimi in dodatnimi cepivi ter pomen individualne ocene tveganja.",
          en: "Vaccination is not the same for every cat or dog. WSAVA explains core and non-core vaccines and the importance of individual risk assessment.",
        },
        organization: "WSAVA",
        kind: { sl: "Veterinarske smernice", en: "Veterinary guidelines" },
        href: "https://wsava.org/global-guidelines/vaccination-guidelines/",
      },
      {
        title: "2019 AAHA Canine Life Stage Guidelines",
        description: {
          sl: "Potrebe mladiča, odraslega in starejšega psa niso enake. AAHA združuje prehrano, preventivo, vedenje in zdravstvene preglede v vseživljenjski načrt oskrbe.",
          en: "Puppies, adult dogs and senior dogs have different needs. AAHA combines nutrition, prevention, behaviour and examinations into lifelong care.",
        },
        organization: "AAHA",
        kind: { sl: "Veterinarske smernice", en: "Veterinary guidelines" },
        href: "https://www.aaha.org/resources/life-stage-canine-2019/life-stage-canine-2019-2/",
      },
      {
        title: "2021 AAHA/AAFP Feline Life Stage Guidelines",
        description: {
          sl: "Od mladiča do seniorja se potrebe mačke postopoma spreminjajo. Smernice AAHA/AAFP pomagajo načrtovati preventivo, preglede in oskrbo skozi vse življenje.",
          en: "A cat’s needs change from kitten to senior. AAHA/AAFP helps plan prevention, examinations and care throughout life.",
        },
        organization: "AAHA / FelineVMA",
        kind: { sl: "Veterinarske smernice", en: "Veterinary guidelines" },
        href: "https://catvets.com/resource/aaha-aafp-feline-life-stage-guidelines/",
      },
      {
        title:
          "2024 AAFP Intercat Tension Guidelines: Recognition, Prevention, and Management",
        description: {
          sl: "Napetost med mačkami je pogosto tiha in jo zlahka spregledamo. Strokovne smernice pojasnjujejo, kako prepoznati stres ter varneje uvajati in upravljati večmačje gospodinjstvo.",
          en: "Tension between cats is often quiet and easily missed. These guidelines cover recognising stress and safely introducing and managing cats in multi-cat homes.",
        },
        organization: "FelineVMA",
        kind: { sl: "Veterinarske smernice", en: "Veterinary guidelines" },
        href: "https://catvets.com/resource/2024-intercat-tension-guidelines/",
      },
      {
        title: "AAHA Canine and Feline Behavior Management Guidelines",
        description: {
          sl: "Vedenjske težave niso vprašanje »pridnosti«. AAHA poudarja zgodnjo socializacijo, pozitivno učenje, manj stresno ravnanje in preverjanje možnih zdravstvenih vzrokov.",
          en: "Behaviour problems are not about being ‘good’. AAHA emphasises early socialisation, positive training, low-stress handling and checking for medical causes.",
        },
        organization: "AAHA",
        kind: { sl: "Veterinarske smernice", en: "Veterinary guidelines" },
        href: "https://www.aaha.org/resources/2015-aaha-canine-and-feline-behavior-management-guidelines/",
      },
      {
        title: "Nekaj praktičnih nasvetov za ustno zdravje vašega psa in mačka",
        description: {
          sl: "Zobna bolečina je pri psu ali mački lahko dolgo neopazna. Veterinarska fakulteta pojasnjuje, katere znake lahko lastnik prepozna doma in kdaj je potreben strokovni pregled.",
          en: "Dental pain can remain unnoticed in cats and dogs. The Veterinary Faculty explains signs owners can spot at home and when a professional examination is needed.",
        },
        organization: "UL Veterinarska fakulteta",
        kind: { sl: "Veterinarska fakulteta", en: "Veterinary faculty" },
        href: "https://www.vf.uni-lj.si/novice/nekaj-prakticnih-nasvetov-za-ustno-zdravje-vasega-psa-macka",
      },
    ],
  },
  {
    id: "rabbits",
    title: { sl: "Kunci", en: "Rabbits" },
    resources: [
      {
        title: "How to feed rabbits",
        description: {
          sl: "Pri kuncu je seno temelj prehrane, ne le nastilj. Visok delež vlaknine podpira prebavila in naravno obrabo stalno rastočih zob.",
          en: "Hay is the foundation of a rabbit’s diet, not merely bedding. Plenty of fibre supports digestion and the natural wear of continuously growing teeth.",
        },
        organization: "Rabbit Welfare Association & Fund",
        kind: { sl: "Organizacija za dobrobit", en: "Welfare organisation" },
        href: "https://rabbitwelfare.co.uk/welfare-need/how-to-feed-rabbits/",
      },
      {
        title: "FEDIAF Nutritional Guidelines for Feeding Pet Rabbits",
        description: {
          sl: "Kunec ima izrazito posebne prehranske potrebe. Evropske smernice izpostavljajo zlasti vlaknino, ki je pomembna tako za prebavila kot za vzdrževanje zob.",
          en: "Rabbits have distinct nutritional needs. European guidelines particularly highlight fibre for digestive and dental health.",
        },
        organization: "FEDIAF",
        kind: {
          sl: "Industrijski prehranski standard",
          en: "Pet food industry standard",
        },
        href: "https://www.fediaf.org/self-regulation/nutritional-guidelines/",
      },
      {
        title:
          "Rabbit welfare: determining priority welfare issues for pet rabbits using a modified Delphi method",
        description: {
          sl: "Največje težave dobrobiti kuncev niso omejene na hrano. Strokovni konsenz izpostavlja tudi prostor, pravilno rokovanje, socialne potrebe, cepljenje in znanje skrbnikov.",
          en: "The biggest rabbit welfare issues go beyond food. Expert consensus also highlights housing, handling, social needs, vaccination and owner knowledge.",
        },
        organization: "Veterinary Record Open",
        kind: { sl: "Recenzirana raziskava", en: "Peer-reviewed research" },
        href: "https://doi.org/10.1136/vetreco-2019-000363",
      },
      {
        title:
          "When touch is stressful: acute endocrine and behavioral responses of domestic rabbits to unfamiliar human handling",
        description: {
          sl: "Kunec, ki miruje v naročju, ni nujno sproščen. Nova raziskava kaže, da lahko rokovanje neznane osebe sproži merljiv fiziološki in vedenjski stres.",
          en: "A rabbit sitting still on someone’s lap is not necessarily relaxed. New research shows that handling by an unfamiliar person can trigger measurable stress responses.",
        },
        organization: "Frontiers in Veterinary Science",
        kind: { sl: "Recenzirana raziskava", en: "Peer-reviewed research" },
        href: "https://www.frontiersin.org/journals/veterinary-science/articles/10.3389/fvets.2026.1793812/full",
      },
    ],
  },
  {
    id: "other-pets",
    title: { sl: "Druge hišne živali", en: "Other companion animals" },
    resources: [
      {
        title: "What should I feed my guinea pigs?",
        description: {
          sl: "Morski prašiček potrebuje prehrano z veliko vlaknine in ustrezen vir vitamina C. Seno oziroma trava naj predstavljata temelj dnevnega obroka.",
          en: "Guinea pigs need a high-fibre diet and a suitable source of vitamin C. Hay or grass should form the basis of their daily food.",
        },
        organization: "RSPCA",
        kind: { sl: "Organizacija za dobrobit", en: "Welfare organisation" },
        href: "https://www.rspca.org.uk/adviceandwelfare/pets/rodents/guineapigs/diet",
      },
      {
        title: "Hamster health",
        description: {
          sl: "Pri hrčku so lahko prvi znaki bolezni zelo neopazni, stanje pa se lahko hitro poslabša. Spremembe apetita, izločkov ali vedenja zato zahtevajo zgodnjo pozornost.",
          en: "Early signs of illness in hamsters can be subtle and their condition may deteriorate quickly. Changes in appetite, waste or behaviour need prompt attention.",
        },
        organization: "RSPCA",
        kind: { sl: "Organizacija za dobrobit", en: "Welfare organisation" },
        href: "https://www.rspca.org.uk/adviceandwelfare/pets/rodents/hamsters/health",
      },
      {
        title: "Bird Owner Resource Series",
        description: {
          sl: "Zdrava ptica potrebuje več kot kletko in semena. Veterinarji za ptice ponujajo strokovna navodila o prehrani, okolju, obogatitvi in zgodnjem prepoznavanju bolezni.",
          en: "A healthy bird needs more than a cage and seeds. Avian veterinarians provide expert guidance on diet, environment, enrichment and recognising illness early.",
        },
        organization: "Association of Avian Veterinarians",
        kind: { sl: "Veterinarsko združenje", en: "Veterinary association" },
        href: "https://www.aav.org/page/birdownerbrochures",
      },
      {
        title: "Salmonella Bacteria and Reptiles",
        description: {
          sl: "Plazilec je lahko videti popolnoma zdrav in kljub temu izloča salmonelo. Pravilna higiena rok in ločevanje opreme živali od kuhinjskih površin sta ključna preventivna ukrepa.",
          en: "A reptile can look completely healthy while carrying Salmonella. Hand hygiene and keeping animal equipment away from food-preparation surfaces are key precautions.",
        },
        organization: "ARAV",
        kind: { sl: "Veterinarsko združenje", en: "Veterinary association" },
        href: "https://arav.org/salmonella-bacteria-and-reptiles/",
      },
      {
        title: "Ferret health",
        description: {
          sl: "Beli dihur potrebuje redno preventivno veterinarsko oskrbo. Lastniki morajo poznati tudi vrsti značilna zdravstvena tveganja in pomen pravočasnega cepljenja.",
          en: "Ferrets need regular preventive veterinary care. Owners should also understand species-specific health risks and the importance of timely vaccination.",
        },
        organization: "RSPCA",
        kind: { sl: "Organizacija za dobrobit", en: "Welfare organisation" },
        href: "https://www.rspca.org.uk/adviceandwelfare/pets/ferrets/health",
      },
    ],
  },
];

const pageText = {
  sl: {
    title: "Strokovno preverjeni viri za skrbnike živali",
    intro:
      "Izbor veterinarskih smernic, recenziranih raziskav in preverjenih vodnikov o prehrani, zdravju, vedenju in dobrobiti.",
    notice:
      "Ti viri so namenjeni izobraževanju in ne nadomeščajo pregleda ali nasveta veterinarja. Povezave vodijo na zunanja spletišča, večinoma v angleščini.",
    back: "Živali za posvojitev",
    open: "Odpri vir",
  },
  en: {
    title: "Expert-reviewed resources for animal guardians",
    intro:
      "A curated collection of veterinary guidelines, peer-reviewed research and trusted guides on nutrition, health, behaviour and welfare.",
    notice:
      "These resources are educational and do not replace an examination or advice from a veterinarian. Links open external websites, mostly in English.",
    back: "Animals for adoption",
    open: "Open resource",
  },
} satisfies Record<Locale, Record<string, string>>;

export function ResourcesPage({ locale }: { locale: Locale }) {
  const text = pageText[locale];
  const homeHref = locale === "sl" ? "/" : "/en";

  return (
    <I18nProvider locale={locale}>
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-gutter">
        <SiteHeader
          homeHref={homeHref}
          languagePaths={{ sl: "/viri", en: "/en/resources" }}
        />

        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 py-page-y sm:gap-14">
          <div className="space-y-5">
            <a
              href={homeHref}
              className="inline-flex max-lg:tap-target text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              ← {text.back}
            </a>
            <div className="max-w-3xl space-y-3">
              <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
                {text.title}
              </h1>
              <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                {text.intro}
              </p>
            </div>
            <p className="max-w-3xl rounded-ui border bg-muted/40 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              {text.notice}
            </p>
          </div>

          {sections.map((section) => (
            <section key={section.id} id={section.id} className="space-y-5">
              <h2 className="border-b pb-3 text-xl font-medium tracking-tight sm:text-2xl">
                {section.title[locale]}
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {section.resources.map((resource) => (
                  <Card asChild key={`${section.id}-${resource.title}`}>
                    <article className="flex flex-col p-5">
                      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full border bg-muted/50 px-2.5 py-1">
                          {resource.kind[locale]}
                        </span>
                        <span>{resource.organization}</span>
                      </div>
                      <h3 className="text-base font-medium leading-snug">
                        {resource.title}
                      </h3>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                        {resource.description[locale]}
                      </p>
                      <a
                        href={resource.href}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex w-fit items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
                      >
                        {text.open}
                        <span aria-hidden>↗</span>
                      </a>
                    </article>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </main>

        <SiteFooter locale={locale} />
      </div>
    </I18nProvider>
  );
}
