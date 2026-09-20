# Copy voice

How the site addresses its reader, and the words it uses for one action. Two
rules, both of them things the site got wrong once and fixed.

## Who is "ti" and who is "vi"

Decide per sentence, by who it talks to.

- **A visitor is "ti".** This is the site's ordinary voice: "Si našel žival?",
  "Vpiši kraj", "Poglej vse živali", "Pred obiskom preveri pri zavetišču".
- **A shelter is "vi".** On the about page's own shelter section, on the
  content policy's shelter rules, on the demo gate, and throughout the portal,
  which serves shelter staff and says so in `components/portal/portal-text.ts`.

The public pages carry both audiences, so the split is visible inside single
files. `components/about-page.tsx` keeps its adopter and shelter points in
separate lists for that reason: a point moved between them moves its address
with it. Where one line introduces both audiences, use an infinitive and name neither,
which is what the content policy's lead does.

Do not switch address mid-paragraph. A sentence that has to mention the other
audience names them in the third person instead ("Na isti naslov pišejo tudi
zavetišča ...").

English has no T-V distinction, so the `en` records need no counterpart.

## One verb for revealing a list

**"Pokaži", never "Prikaži".** The filter sheet's CTA, the shelter picker it
opens and the grid's load-more button are three presses of one flow, and they
used to carry two different verbs.

`lib/i18n.test.ts` walks the Slovenian catalogues and fails on the imperative
"Prikaži" / "Prikažite". It cannot see strings built inside components, so a
new label belongs in a catalogue: `lib/i18n.ts`, `lib/label-messages.ts`,
`components/filters/location-picker/model.ts` or
`components/portal/portal-text.ts`.

The participle is a different word and is left alone: "Prikazane so živali z
izrecno navedeno zahtevo ..." reports a result, it is not a control asking to
be pressed.
