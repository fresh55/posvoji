import { loadDataset } from "@/lib/dataset";
import { feedFileParams, feedResponse } from "@/lib/feeds";

// The English half of app/(sl)/nove-objave, /en/new-listings/all.xml and one
// per species tab. The entries are written from the same labels the English
// pages print, so the only words of their own are the feed's title.

// Static for output: export, as the Slovenian route explains.
export const dynamic = "force-static";

export const dynamicParams = false;

export function generateStaticParams() {
  return feedFileParams("en");
}

export async function GET(
  _request: Request,
  { params }: RouteContext<"/en/new-listings/[feed]">,
) {
  const { feed } = await params;
  return feedResponse("en", feed, loadDataset());
}
