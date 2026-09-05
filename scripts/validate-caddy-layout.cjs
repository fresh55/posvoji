#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PUBLIC_PROBES = ["/", "/viri"];
const RESPONSE_HANDLERS = new Set([
  "acme_server",
  "error",
  "file_server",
  "reverse_proxy",
  "static_response",
]);

function usage() {
  console.error(
    "usage: validate-caddy-layout.cjs --host HOST --root PATH [--require-route PATH=ROOT ...] [--require-root PATH ...] [--require-clean-html] [--allow-root PATH ...] [--forbid-root PATH] [FILE]",
  );
}

function parseRequiredRoute(value) {
  const separator = value.indexOf("=");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error("--require-route needs PATH=ROOT");
  }
  const pattern = value.slice(0, separator);
  const root = value.slice(separator + 1);
  if (!pattern.startsWith("/")) {
    throw new Error(`required route pattern must start with /: ${pattern}`);
  }
  return { pattern, root };
}

function parseArgs(argv) {
  const options = {
    host: "",
    root: "",
    requiredRoutes: [],
    requiredRoots: [],
    requireCleanHtml: false,
    allowedRoots: [],
    forbiddenRoot: "",
    file: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--require-clean-html") {
      options.requireCleanHtml = true;
      continue;
    }
    if (
      arg === "--host" ||
      arg === "--root" ||
      arg === "--require-route" ||
      arg === "--require-root" ||
      arg === "--allow-root" ||
      arg === "--forbid-root"
    ) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} needs a value`);
      if (arg === "--host") options.host = value.toLowerCase();
      else if (arg === "--root") options.root = value;
      else if (arg === "--require-route") {
        options.requiredRoutes.push(parseRequiredRoute(value));
      } else if (arg === "--require-root") options.requiredRoots.push(value);
      else if (arg === "--allow-root") options.allowedRoots.push(value);
      else options.forbiddenRoot = value;
      index += 1;
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option: ${arg}`);
    } else if (options.file) {
      throw new Error("only one config file may be supplied");
    } else {
      options.file = arg;
    }
  }
  if (!options.host || !options.root) {
    throw new Error("--host and --root are required");
  }
  return options;
}

function walk(value, visit) {
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit);
    return;
  }
  if (!value || typeof value !== "object") return;
  visit(value);
  for (const child of Object.values(value)) walk(child, visit);
}

function matchedHosts(route) {
  if (!Array.isArray(route.match)) return [];
  return route.match.flatMap((matcher) =>
    matcher && Array.isArray(matcher.host)
      ? matcher.host.filter((host) => typeof host === "string")
      : [],
  );
}

function normalizeRoot(root) {
  const normalized = path.posix.normalize(root);
  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized;
}

function union(left, right) {
  return new Set([...left, ...right]);
}

function routeCanMatchHost(route, host) {
  if (!Array.isArray(route.match) || route.match.length === 0) return true;
  return route.match.some((matcher) => {
    if (!matcher || typeof matcher !== "object") return false;
    if (!Array.isArray(matcher.host)) return true;
    return matcher.host.some(
      (candidate) =>
        typeof candidate === "string" && candidate.toLowerCase() === host,
    );
  });
}

function pathMatches(pattern, requestPath) {
  let expression = "^";
  for (const character of pattern) {
    if (character === "*") expression += ".*";
    else expression += character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  }
  return new RegExp(`${expression}$`).test(requestPath);
}

// Unknown matcher types are deliberately treated as possibly matching. A
// response-producing or terminal route must not be waved past the validator
// merely because a plugin matcher was not understood here.
function matcherMayMatchProbe(matcher, probe, host) {
  if (!matcher || typeof matcher !== "object") return false;
  if (
    Array.isArray(matcher.host) &&
    !matcher.host.some(
      (candidate) =>
        typeof candidate === "string" && candidate.toLowerCase() === host,
    )
  ) {
    return false;
  }
  if (
    Array.isArray(matcher.path) &&
    !matcher.path.some(
      (pattern) => typeof pattern === "string" && pathMatches(pattern, probe),
    )
  ) {
    return false;
  }
  return true;
}

function routeMayMatchProbe(route, probe, host) {
  if (!Array.isArray(route.match) || route.match.length === 0) return true;
  return route.match.some((matcher) =>
    matcherMayMatchProbe(matcher, probe, host),
  );
}

function routeIsConditional(route) {
  return (
    Array.isArray(route.match) &&
    route.match.some(
      (matcher) =>
        matcher &&
        typeof matcher === "object" &&
        Object.keys(matcher).some((key) => key !== "host"),
    )
  );
}

function routePathPatterns(route) {
  if (!Array.isArray(route.match)) return [];
  return route.match.flatMap((matcher) =>
    matcher && Array.isArray(matcher.path)
      ? matcher.path.filter((pattern) => typeof pattern === "string")
      : [],
  );
}

function routeUsesOnlyHostAndPathMatchers(route) {
  if (!Array.isArray(route.match) || route.match.length === 0) return true;
  return route.match.every(
    (matcher) =>
      matcher &&
      typeof matcher === "object" &&
      Object.keys(matcher).every((key) => key === "host" || key === "path"),
  );
}

function cleanHtmlRewriteRoot(route, effectiveRoots) {
  if (!Array.isArray(route.match) || route.match.length !== 1) return null;
  const matcher = route.match[0];
  if (!matcher || typeof matcher !== "object") return null;
  if (Object.keys(matcher).some((key) => key !== "file" && key !== "host")) {
    return null;
  }
  const tryFiles = matcher.file?.try_files;
  if (!Array.isArray(tryFiles) || tryFiles.length < 2) return null;
  const tryPolicy = matcher.file?.try_policy;
  if (tryPolicy !== undefined && tryPolicy !== "first_exist") return null;
  if (effectiveRoots.size !== 1 || effectiveRoots.has(null)) return null;
  const [effectiveRoot] = effectiveRoots;
  const matcherRoot = matcher.file?.root;
  if (
    matcherRoot !== undefined &&
    matcherRoot !== "{http.vars.root}" &&
    (typeof matcherRoot !== "string" ||
      normalizeRoot(matcherRoot) !== effectiveRoot)
  ) {
    return null;
  }
  const cleanCandidates = ["{path}", "{http.request.uri.path}"];
  const hasCorrectOrder = cleanCandidates.some(
    (candidate) =>
      tryFiles[0] === `${candidate}.html` && tryFiles[1] === candidate,
  );
  if (!hasCorrectOrder) return null;
  const rewritesToMatch =
    Array.isArray(route.handle) &&
    route.handle.some(
      (handler) =>
        handler?.handler === "rewrite" &&
        handler.uri === "{http.matchers.file.relative}",
    );
  return rewritesToMatch ? effectiveRoot : null;
}

function requiredRouteProbe(pattern) {
  return pattern.replaceAll("*", "__posvoji_layout_probe__");
}

function requiredRoutePrefix(pattern) {
  return pattern.endsWith("/*") ? pattern.slice(0, -2) : "";
}

// Caddy's `root` directive adapts to a vars handler; a later file_server reads
// that request variable. The scanner follows roots through conditional routes,
// while separately following representative request paths. That second flow
// prevents an earlier terminal/static route from making an otherwise correct-
// looking file_server unreachable.
function scanHandlers(handlers, incoming, collector, context) {
  let roots = new Set(incoming);
  let liveProbes = new Set(context.liveProbes);
  let cleanHtmlRoot = context.cleanHtmlRoot;
  let strippedPrefixes = new Set(context.strippedPrefixes);

  for (const handler of Array.isArray(handlers) ? handlers : []) {
    if (!handler || typeof handler !== "object") continue;
    if (handler.handler === "vars" && typeof handler.root === "string") {
      const root = normalizeRoot(handler.root);
      collector.configuredRoots.add(root);
      roots = new Set([root]);
    } else if (handler.handler === "file_server") {
      const effectiveRoots =
        typeof handler.root === "string"
          ? new Set([normalizeRoot(handler.root)])
          : new Set(roots);
      if (typeof handler.root === "string") {
        collector.configuredRoots.add(normalizeRoot(handler.root));
      }
      collector.fileServers.push({
        roots: effectiveRoots,
        conditional: context.conditional,
        pathPatterns: [...context.pathPatterns],
        requiredRouteSafe: context.requiredRouteSafe,
        strippedPrefixes: new Set(strippedPrefixes),
        cleanHtmlRoot,
        reachableProbes: new Set(liveProbes),
      });
      liveProbes.clear();
    } else if (handler.handler === "subroute") {
      const outgoing = scanRoutes(handler.routes, roots, collector, {
        ...context,
        cleanHtmlRoot,
        liveProbes,
        strippedPrefixes,
      });
      roots = outgoing.roots;
      liveProbes = outgoing.liveProbes;
      cleanHtmlRoot = outgoing.cleanHtmlRoot;
      strippedPrefixes = outgoing.strippedPrefixes;
    } else if (
      handler.handler === "rewrite" &&
      typeof handler.strip_path_prefix === "string"
    ) {
      strippedPrefixes.add(handler.strip_path_prefix);
    } else if (RESPONSE_HANDLERS.has(handler.handler)) {
      liveProbes.clear();
    }
  }
  return { roots, liveProbes, cleanHtmlRoot, strippedPrefixes };
}

function scanRoutes(routes, incoming, collector, context) {
  let roots = new Set(incoming);
  let liveProbes = new Set(context.liveProbes);
  let cleanHtmlRoot = context.cleanHtmlRoot;
  let strippedPrefixes = new Set(context.strippedPrefixes);

  for (const route of Array.isArray(routes) ? routes : []) {
    if (!route || typeof route !== "object") continue;
    if (!routeCanMatchHost(route, context.host)) continue;

    const matchingProbes = new Set(
      [...liveProbes].filter((probe) =>
        routeMayMatchProbe(route, probe, context.host),
      ),
    );
    const bypassingProbes = new Set(
      [...liveProbes].filter((probe) => !matchingProbes.has(probe)),
    );
    const conditional = routeIsConditional(route);
    const configuredCleanRoot = cleanHtmlRewriteRoot(route, roots);
    const outgoing = scanHandlers(route.handle, roots, collector, {
      host: context.host,
      conditional: context.conditional || conditional,
      pathPatterns: [
        ...context.pathPatterns,
        ...routePathPatterns(route),
      ],
      requiredRouteSafe:
        context.requiredRouteSafe && routeUsesOnlyHostAndPathMatchers(route),
      cleanHtmlRoot,
      liveProbes: matchingProbes,
      strippedPrefixes,
    });

    if (route.terminal === true) outgoing.liveProbes.clear();
    liveProbes = union(bypassingProbes, outgoing.liveProbes);
    roots = conditional ? union(roots, outgoing.roots) : outgoing.roots;

    if (configuredCleanRoot !== null) {
      // This matched route is the adapted form of `try_files`: the rewrite is
      // conditional on a candidate existing, but its presence configures the
      // following file_server for every clean URL that does exist.
      cleanHtmlRoot = configuredCleanRoot;
    } else if (!conditional) {
      cleanHtmlRoot = outgoing.cleanHtmlRoot;
    }
    if (!conditional) strippedPrefixes = outgoing.strippedPrefixes;
  }
  return { roots, liveProbes, cleanHtmlRoot, strippedPrefixes };
}

function inspectHostRoutes(config, host, probes) {
  const collector = { configuredRoots: new Set(), fileServers: [] };
  const servers = config?.apps?.http?.servers;
  if (!servers || typeof servers !== "object") return collector;

  for (const server of Object.values(servers)) {
    if (!server || !Array.isArray(server.routes)) continue;
    let hasTargetHost = false;
    walk(server.routes, (node) => {
      if (
        matchedHosts(node).some(
          (candidate) => candidate.toLowerCase() === host,
        )
      ) {
        hasTargetHost = true;
      }
    });
    if (!hasTargetHost) continue;
    scanRoutes(server.routes, new Set([null]), collector, {
      host,
      conditional: false,
      pathPatterns: [],
      requiredRouteSafe: true,
      cleanHtmlRoot: null,
      liveProbes: new Set(probes),
      strippedPrefixes: new Set(),
    });
  }
  return collector;
}

function validateLayout(
  config,
  {
    host,
    root,
    requiredRoutes = [],
    requiredRoots = [],
    requireCleanHtml = false,
    allowedRoots = [],
    forbiddenRoot,
  },
) {
  const normalizedRequiredRoutes = requiredRoutes.map(({ pattern, root }) => ({
    pattern,
    root: normalizeRoot(root),
    probe: requiredRouteProbe(pattern),
    prefix: requiredRoutePrefix(pattern),
  }));
  const probes = new Set([
    ...PUBLIC_PROBES,
    ...normalizedRequiredRoutes.map(({ probe }) => probe),
  ]);
  const { configuredRoots, fileServers } = inspectHostRoutes(
    config,
    host,
    probes,
  );
  if (fileServers.length === 0) {
    throw new Error(`active Caddy config has no file_server route for ${host}`);
  }

  const expected = normalizeRoot(root);
  const forbidden = forbiddenRoot ? normalizeRoot(forbiddenRoot) : "";
  if (forbidden && configuredRoots.has(forbidden)) {
    throw new Error(
      `active ${host} file_server route still contains forbidden root ${forbiddenRoot}`,
    );
  }

  const required = requiredRoots.map(normalizeRoot);
  const allowed = new Set([
    expected,
    ...required,
    ...normalizedRequiredRoutes.map(({ root: routeRoot }) => routeRoot),
    ...allowedRoots.map(normalizeRoot),
  ]);
  const effectiveServers = [];
  for (const server of fileServers) {
    if (server.roots.size !== 1 || server.roots.has(null)) {
      throw new Error(
        `active ${host} file_server route has an ambiguous or missing effective root`,
      );
    }
    const [effectiveRoot] = server.roots;
    if (!allowed.has(effectiveRoot)) {
      throw new Error(
        `active ${host} file_server route contains an unexpected root: ${effectiveRoot}`,
      );
    }
    effectiveServers.push({ ...server, effectiveRoot });
  }

  const publicServer = effectiveServers.find(
    (server) =>
      server.effectiveRoot === expected &&
      !server.conditional &&
      PUBLIC_PROBES.every((probe) => server.reachableProbes.has(probe)) &&
      (!requireCleanHtml || server.cleanHtmlRoot === expected),
  );
  if (!publicServer) {
    const cleanRequirement = requireCleanHtml
      ? ", with a preceding .html try_files rewrite"
      : "";
    throw new Error(
      `active ${host} config has no reachable unconditional file_server effectively rooted at ${root}${cleanRequirement}`,
    );
  }

  for (const requiredRoot of required) {
    if (
      !effectiveServers.some(
        (server) => server.effectiveRoot === requiredRoot,
      )
    ) {
      throw new Error(
        `active ${host} config has no file_server effectively rooted at required root ${requiredRoot}`,
      );
    }
  }

  for (const requiredRoute of normalizedRequiredRoutes) {
    const found = effectiveServers.some(
      (server) =>
        server.effectiveRoot === requiredRoute.root &&
        server.requiredRouteSafe &&
        server.pathPatterns.includes(requiredRoute.pattern) &&
        (!requiredRoute.prefix ||
          server.strippedPrefixes.has(requiredRoute.prefix)) &&
        server.reachableProbes.has(requiredRoute.probe),
    );
    if (!found) {
      throw new Error(
        `active ${host} config has no reachable ${requiredRoute.pattern} file_server effectively rooted at ${requiredRoute.root}`,
      );
    }
  }
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    const input = options.file
      ? fs.readFileSync(options.file, "utf8")
      : fs.readFileSync(0, "utf8");
    validateLayout(JSON.parse(input), options);
    process.stdout.write(`active Caddy route for ${options.host}: ${options.root}\n`);
  } catch (error) {
    usage();
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { inspectHostRoutes, validateLayout };
