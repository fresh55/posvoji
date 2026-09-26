import { PortalProvider } from "@/components/portal/portal-provider";
// The crossfade between the pages below. Loaded here rather than in
// globals.css so the rules ship with the routes that use them: this is the
// one part of the site that navigates inside the document.
import "@/components/portal/portal-transitions.css";

// The signed-in half of the portal: the list of animals, the page one animal
// is edited on, and the page that asks the quick answers. The group adds no
// segment, so the routes stay /portal, /portal/zival and /portal/odgovori.
//
// The provider is here rather than on each page because every page reads the
// same session and the same list, and a client navigation between them has to
// keep both alive. /portal/prijava sits outside the group on purpose: it is
// the page an account with no session is sent to, so it must render without
// one.
export default function PortalAppLayout({ children }: LayoutProps<"/portal">) {
  return <PortalProvider>{children}</PortalProvider>;
}
