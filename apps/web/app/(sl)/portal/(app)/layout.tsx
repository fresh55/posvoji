import { PortalProvider } from "@/components/portal/portal-provider";

// The signed-in half of the portal: the list of animals and the page one
// animal is edited on. The group adds no segment, so the two routes stay
// /portal and /portal/zival.
//
// The provider is here rather than on each page because both pages read the
// same session and the same list, and a client navigation between them has to
// keep both alive. /portal/prijava sits outside the group on purpose: it is
// the page an account with no session is sent to, so it must render without
// one.
export default function PortalAppLayout({ children }: LayoutProps<"/portal">) {
  return <PortalProvider>{children}</PortalProvider>;
}
