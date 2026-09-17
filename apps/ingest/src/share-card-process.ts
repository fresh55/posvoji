import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Species } from "@posvoji/schema";
import type { CardText } from "./share-cards";

export type ShareCardRequest =
  | { kind: "photo"; source: string; text: CardText }
  | { kind: "typographic"; species: Species; text: CardText };

/** Native heap corruption cannot be caught by a JavaScript try/catch. On
 * Windows, render each card in a disposable process and accept its bytes only
 * after a clean exit. A crash or hang then becomes an ordinary card failure. */
export function renderCardInChild(
  request: ShareCardRequest,
  options: { worker?: URL; timeoutMs?: number } = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--import", import.meta.resolve("tsx"),
      fileURLToPath(options.worker ?? new URL("./share-card-worker.ts", import.meta.url)),
    ], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let stderr = "";
    let failure: Error | undefined;
    const timer = setTimeout(() => {
      failure = new Error("share-card renderer timed out");
      child.kill();
    }, options.timeoutMs ?? 30_000);
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 8 * 1024 * 1024) {
        failure = new Error("share-card renderer exceeded its output limit");
        child.kill();
      } else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4096);
    });
    // A renderer can die before reading stdin. The close handler reports its
    // exit, rather than allowing an unhandled EPIPE to kill the parent too.
    child.stdin.on("error", () => {});
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0 || bytes === 0) {
        reject(new Error(`share-card renderer exited ${signal ?? code}: ${stderr.trim()}`));
      } else resolve(Buffer.concat(chunks));
    });
    child.stdin.end(JSON.stringify(request));
  });
}
