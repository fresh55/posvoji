// Flag parsing for the pipeline's entry points, kept apart from export.ts so
// the flags can be exercised without running an export.

export function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(name);
}

function valueAfter(argv: readonly string[], name: string, at: number): string {
  const value = argv[at + 1];
  // A flag left without its value is a typo, and guessing what was meant is
  // how a targeted run turns into a full one.
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

export function flagValue(
  argv: readonly string[],
  name: string,
): string | undefined {
  const at = argv.indexOf(name);
  if (at === -1) return undefined;
  return valueAfter(argv, name, at);
}

// Repeatable, and each occurrence may carry a comma-separated list.
export function flagList(argv: readonly string[], name: string): string[] {
  const values: string[] = [];
  for (const [at, arg] of argv.entries()) {
    if (arg !== name) continue;
    for (const part of valueAfter(argv, name, at).split(",")) {
      const trimmed = part.trim();
      if (trimmed) values.push(trimmed);
    }
  }
  return values;
}
