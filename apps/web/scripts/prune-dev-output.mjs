import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const DEV_ROUTE = "/dev/[tool]/page";
const DEV_MODULE_MARKER = "/apps/web/app/dev/";
const CHUNK_PREFIX = "/_next/static/chunks/";
const TEXT_OUTPUT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".htm",
  ".js",
  ".json",
  ".mjs",
  ".txt",
  ".webmanifest",
  ".xml",
]);

function isStrictDescendant(parent, child) {
  const pathFromParent = relative(parent, child);
  return (
    pathFromParent !== "" &&
    pathFromParent !== ".." &&
    !pathFromParent.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromParent)
  );
}

function extractJsonObject(source, start) {
  let depth = 0;
  let escaped = false;
  let inString = false;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  throw new Error("dev client-reference manifest has an incomplete JSON value");
}

export function parseClientReferenceManifest(source, route = DEV_ROUTE) {
  const assignment = `globalThis.__RSC_MANIFEST[${JSON.stringify(route)}]`;
  const assignmentStart = source.indexOf(assignment);
  if (assignmentStart === -1) {
    throw new Error(`dev client-reference manifest is missing route ${route}`);
  }
  if (source.indexOf(assignment, assignmentStart + assignment.length) !== -1) {
    throw new Error(`dev client-reference manifest repeats route ${route}`);
  }

  let cursor = assignmentStart + assignment.length;
  while (/\s/.test(source[cursor] ?? "")) cursor += 1;
  if (source[cursor] !== "=") {
    throw new Error("dev client-reference manifest has an invalid assignment");
  }
  cursor += 1;
  while (/\s/.test(source[cursor] ?? "")) cursor += 1;
  if (source[cursor] !== "{") {
    throw new Error("dev client-reference manifest payload is not an object");
  }

  const json = extractJsonObject(source, cursor);
  let manifest;
  try {
    manifest = JSON.parse(json);
  } catch (error) {
    throw new Error("dev client-reference manifest contains invalid JSON", {
      cause: error,
    });
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("dev client-reference manifest payload is not an object");
  }
  return manifest;
}

function normalizeClientChunk(chunk) {
  if (typeof chunk !== "string" || chunk.length === 0) {
    throw new Error("dev client-reference manifest contains an invalid chunk");
  }
  if (chunk.includes("\\") || chunk.includes("\0")) {
    throw new Error(`refusing unsafe dev chunk path: ${JSON.stringify(chunk)}`);
  }

  const publicPath = chunk.startsWith("static/chunks/")
    ? `/_next/${chunk}`
    : chunk;
  if (!publicPath.startsWith(CHUNK_PREFIX) || !publicPath.endsWith(".js")) {
    throw new Error(`refusing unexpected dev chunk path: ${publicPath}`);
  }

  const suffix = publicPath.slice(CHUNK_PREFIX.length);
  const segments = suffix.split("/");
  if (
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        segment.includes(":"),
    )
  ) {
    throw new Error(`refusing unsafe dev chunk path: ${publicPath}`);
  }
  return publicPath;
}

function addChunks(chunks, target) {
  if (!Array.isArray(chunks)) {
    throw new Error("dev client-reference manifest has an invalid chunk list");
  }
  for (const chunk of chunks) target.add(normalizeClientChunk(chunk));
}

export function collectDevClientChunks(manifest) {
  const chunks = new Set();
  const clientModules = manifest.clientModules;
  if (
    !clientModules ||
    typeof clientModules !== "object" ||
    Array.isArray(clientModules)
  ) {
    throw new Error("dev client-reference manifest has no clientModules object");
  }

  for (const [moduleId, module] of Object.entries(clientModules)) {
    if (!moduleId.replaceAll("\\", "/").includes(DEV_MODULE_MARKER)) continue;
    if (!module || typeof module !== "object" || Array.isArray(module)) {
      throw new Error(`invalid dev client module: ${moduleId}`);
    }
    addChunks(module.chunks, chunks);
  }

  const entryFiles = manifest.entryJSFiles;
  if (entryFiles !== undefined) {
    if (
      !entryFiles ||
      typeof entryFiles !== "object" ||
      Array.isArray(entryFiles)
    ) {
      throw new Error("dev client-reference manifest has invalid entryJSFiles");
    }
    for (const [moduleId, moduleChunks] of Object.entries(entryFiles)) {
      if (!moduleId.replaceAll("\\", "/").includes(DEV_MODULE_MARKER)) continue;
      addChunks(moduleChunks, chunks);
    }
  }

  return [...chunks].sort();
}

function assertDirectory(path, description) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${description} is not a regular directory: ${path}`);
  }
}

function inspectContainedRegularFile(root, path) {
  if (!isStrictDescendant(root, path)) {
    throw new Error(`refusing dev chunk outside the chunk directory: ${path}`);
  }

  const segments = relative(root, path).split(sep);
  let current = root;
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        return false;
      }
      throw error;
    }
    const isLast = index === segments.length - 1;
    if (stat.isSymbolicLink()) {
      throw new Error(`refusing symbolic link in dev chunk path: ${current}`);
    }
    if (isLast ? !stat.isFile() : !stat.isDirectory()) {
      throw new Error(`dev chunk path has an unexpected file type: ${current}`);
    }
  }
  return true;
}

function pathIdentity(path) {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function listTextOutputFiles(root, excludedDirectory) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (path === excludedDirectory) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        visit(path);
      } else if (
        entry.isFile() &&
        TEXT_OUTPUT_EXTENSIONS.has(extname(entry.name).toLowerCase())
      ) {
        files.push(path);
      }
    }
  };
  visit(root);
  return files;
}

function referencesChunk(content, chunk) {
  return content.includes(chunk.publicPath) || content.includes(chunk.name);
}

function findSharedChunks(chunks, outputFiles) {
  const chunkByPath = new Map(
    chunks.map((chunk) => [pathIdentity(chunk.path), chunk]),
  );
  const references = new Map(
    chunks.map((chunk) => [chunk.publicPath, new Set()]),
  );
  const shared = new Set();

  for (const outputFile of outputFiles) {
    const content = readFileSync(outputFile, "utf8");
    const sourceChunk = chunkByPath.get(pathIdentity(outputFile));
    for (const targetChunk of chunks) {
      if (!referencesChunk(content, targetChunk)) continue;
      if (sourceChunk) {
        references.get(sourceChunk.publicPath).add(targetChunk.publicPath);
      } else {
        shared.add(targetChunk.publicPath);
      }
    }
  }

  const queue = [...shared];
  for (let index = 0; index < queue.length; index += 1) {
    for (const dependency of references.get(queue[index]) ?? []) {
      if (shared.has(dependency)) continue;
      shared.add(dependency);
      queue.push(dependency);
    }
  }
  return shared;
}

/**
 * @param {{
 *   webRoot?: string,
 *   logger?: {log: (message: string) => void},
 * }} [options]
 */
export function pruneDevOnlyOutput({
  webRoot: configuredWebRoot,
  logger = console,
} = {}) {
  const defaultWebRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const webRoot = resolve(configuredWebRoot ?? defaultWebRoot);
  const outDir = resolve(webRoot, "out");
  const devOutput = resolve(outDir, "dev");
  const chunkDirectory = resolve(outDir, "_next", "static", "chunks");
  const manifestPath = resolve(
    webRoot,
    ".next",
    "server",
    "app",
    "dev",
    "[tool]",
    "page_client-reference-manifest.js",
  );

  if (
    dirname(devOutput) !== outDir ||
    basename(devOutput) !== "dev" ||
    !isStrictDescendant(outDir, chunkDirectory)
  ) {
    throw new Error("refusing unsafe dev-output configuration");
  }

  assertDirectory(outDir, "static output");
  const hasDevOutput = existsSync(devOutput);
  if (hasDevOutput) assertDirectory(devOutput, "dev static output");

  if (!existsSync(manifestPath)) {
    if (hasDevOutput) {
      throw new Error(
        `cannot prune dev output without its client-reference manifest: ${manifestPath}`,
      );
    }
    logger.log("no dev-only static output found");
    return { deletedChunks: [], preservedChunks: [], removedDevOutput: false };
  }

  const manifest = parseClientReferenceManifest(
    readFileSync(manifestPath, "utf8"),
  );
  const publicChunks = collectDevClientChunks(manifest);
  if (publicChunks.length === 0 && hasDevOutput) {
    throw new Error("dev output exists but its manifest has no client chunks");
  }

  assertDirectory(chunkDirectory, "static chunk directory");
  const seenChunkPaths = new Set();
  const chunks = publicChunks.map((publicPath) => {
    const suffix = publicPath.slice(CHUNK_PREFIX.length);
    const path = resolve(chunkDirectory, ...suffix.split("/"));
    const identity = pathIdentity(path);
    if (seenChunkPaths.has(identity)) {
      throw new Error(`dev manifest repeats a chunk file: ${path}`);
    }
    seenChunkPaths.add(identity);
    const exists = inspectContainedRegularFile(chunkDirectory, path);
    return { exists, name: basename(path), path, publicPath };
  });
  const outputFiles = listTextOutputFiles(outDir, devOutput);
  const sharedChunks = findSharedChunks(chunks, outputFiles);
  const missingSharedChunk = chunks.find(
    (chunk) => sharedChunks.has(chunk.publicPath) && !chunk.exists,
  );
  if (missingSharedChunk) {
    throw new Error(`referenced shared chunk is missing: ${missingSharedChunk.path}`);
  }
  const chunksToDelete = chunks.filter(
    (chunk) => chunk.exists && !sharedChunks.has(chunk.publicPath),
  );

  for (const chunk of chunksToDelete) unlinkSync(chunk.path);
  if (hasDevOutput) rmSync(devOutput, { recursive: true });

  const deletedChunks = chunksToDelete.map((chunk) => chunk.publicPath);
  const preservedChunks = chunks
    .filter((chunk) => sharedChunks.has(chunk.publicPath))
    .map((chunk) => chunk.publicPath);
  logger.log(
    `pruned dev-only routes and ${deletedChunks.length} unreferenced dev chunks; preserved ${preservedChunks.length} shared chunks`,
  );
  return { deletedChunks, preservedChunks, removedDevOutput: hasDevOutput };
}

const invokedPath = process.argv[1];
if (invokedPath && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    pruneDevOnlyOutput();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
