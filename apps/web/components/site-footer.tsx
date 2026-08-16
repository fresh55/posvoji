import { getMessages, type Locale } from "@/lib/i18n";

export function SiteFooter({
  locale,
  showResourcesLink = true,
}: {
  locale: Locale;
  showResourcesLink?: boolean;
}) {
  const messages = getMessages(locale);
  const resourcesHref = locale === "sl" ? "/viri" : "/en/resources";

  return (
    <footer className="bleed border-t py-6 text-xs leading-relaxed text-muted-foreground">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-3xl">{messages.footer}</p>
        {showResourcesLink && (
          <nav aria-label={messages.moreInformation} className="shrink-0">
            <a
              href={resourcesHref}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {messages.resources}
            </a>
          </nav>
        )}
      </div>
    </footer>
  );
}
