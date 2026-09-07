import type { ReactNode } from "react";

/** One titled block of rows. Four or five of them make a form. */
export function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5">
      <h2 className="border-b pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
