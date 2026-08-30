import { NotFoundPage } from "@/components/not-found-page";

// Renders for any URL under this root layout that matches no page, and for
// notFound() thrown by a page in it. Sibling to (sl)/layout.tsx, so it shares
// that layout's <html lang="sl"> rather than needing one of its own.
export default function NotFound() {
  return <NotFoundPage locale="sl" />;
}
