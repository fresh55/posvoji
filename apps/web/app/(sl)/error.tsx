"use client";

import { ErrorPage } from "@/components/error-page";

export default function Error(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPage locale="sl" {...props} />;
}
