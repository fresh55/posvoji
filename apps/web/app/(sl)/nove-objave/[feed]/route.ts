import { loadDataset } from "@/lib/dataset";
import { feedFileParams, feedResponse } from "@/lib/feeds";

// The Slovenian feeds of new listings, /nove-objave/vse.xml and one per
// species tab, written once at build time. What they carry and what they
// leave out is lib/feeds.ts; app/(en)/en/new-listings is the English half.

// A Route Handler under output: export has to declare itself static, the way
// app/robots.ts does, and it reads the dataset off disk and nothing off a
// request.
export const dynamic = "force-static";

// Four files and no others.
export const dynamicParams = false;

export function generateStaticParams() {
  return feedFileParams("sl");
}

export async function GET(
  _request: Request,
  { params }: RouteContext<"/nove-objave/[feed]">,
) {
  const { feed } = await params;
  return feedResponse("sl", feed, loadDataset());
}
