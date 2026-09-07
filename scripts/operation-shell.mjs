import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { delimiter, dirname, join, win32 } from "node:path";

/** Operations use Git Bash paths on Windows, never the WSL launcher. */
function bashExecutable() {
  if (process.env.POSVOJI_BASH) return process.env.POSVOJI_BASH;
  if (process.platform !== "win32") return "bash";
  const candidates = [
    ...[
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
      process.env.LOCALAPPDATA,
    ]
      .filter(Boolean)
      .map((root) => join(root, "Git", "bin", "bash.exe")),
    ...(process.env.PATH ?? "")
      .split(delimiter)
      .flatMap((entry) => [
        join(entry, "bash.exe"),
        join(dirname(entry), "bin", "bash.exe"),
      ]),
  ];
  const executable = candidates.find(
    (candidate) =>
      existsSync(candidate) &&
      existsSync(join(dirname(candidate), "..", "usr", "bin", "bash.exe")),
  );
  if (!executable)
    throw new Error(
      "Operations checks require Git Bash. Install Git for Windows or set POSVOJI_BASH to its bash.exe.",
    );
  return executable;
}

export function shellPath(value) {
  return value
    .replaceAll("\\", "/")
    .replace(/^([A-Za-z]):\//, (_, drive) => `/${drive.toLowerCase()}/`);
}

export function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Keep nested bash invocations in the same installation too. */
export function runBash(args, options = {}) {
  const executable = bashExecutable();
  const env = { ...process.env, ...options.env };
  if (process.platform === "win32") {
    const pathKey =
      Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "Path";
    env[pathKey] = `${win32.dirname(executable)};${env[pathKey] ?? ""}`;
  }
  return spawnSync(executable, args, {
    encoding: "utf8",
    ...options,
    env,
    windowsHide: true,
  });
}
