#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const { validateLayout } = require("./validate-caddy-layout.cjs");

const publicRoot = "/srv/posvoji/current/public";
const mediaRoot = "/srv/posvoji/media";
const forbiddenRoot = "/srv/posvoji/current";

function cleanHtmlRoute({ constrained = false, reversed = false } = {}) {
  const requestPath = "{http.request.uri.path}";
  return {
    match: [
      {
        ...(constrained ? { path: ["/never*"] } : {}),
        file: {
          try_files: reversed
            ? [requestPath, `${requestPath}.html`, `${requestPath}/index.html`]
            : [`${requestPath}.html`, requestPath, `${requestPath}/index.html`],
        },
      },
    ],
    handle: [
      {
        handler: "rewrite",
        uri: "{http.matchers.file.relative}",
      },
    ],
  };
}

function mediaRoute(pattern = "/media/*", root = mediaRoot) {
  return {
    match: [{ path: [pattern] }],
    handle: [
      {
        handler: "subroute",
        routes: [
          {
            handle: [
              { handler: "rewrite", strip_path_prefix: "/media" },
            ],
          },
          { handle: [{ handler: "vars", root }] },
          { handle: [{ handler: "file_server" }] },
        ],
      },
    ],
    terminal: true,
  };
}

function publicRoutes({ clean = true, cleanOptions, publicPattern } = {}) {
  const fileServer = { handle: [{ handler: "file_server" }] };
  return [
    { handle: [{ handler: "vars", root: publicRoot }] },
    ...(clean ? [cleanHtmlRoute(cleanOptions)] : []),
    ...(publicPattern
      ? [
          {
            match: [{ path: [publicPattern] }],
            handle: [
              { handler: "subroute", routes: [fileServer] },
            ],
          },
        ]
      : [fileServer]),
  ];
}

function configFor({
  beforeHost = [],
  prelude = [],
  includeMedia = true,
  mediaPattern,
  mediaRouteRoot,
  clean = true,
  cleanOptions,
  publicPattern,
  extraServers = [],
} = {}) {
  return {
    apps: {
      http: {
        servers: {
          srv0: {
            routes: [
              ...beforeHost,
              ...extraServers,
              {
                match: [{ host: ["posvoji.si"] }],
                handle: [
                  {
                    handler: "subroute",
                    routes: [
                      ...prelude,
                      ...(includeMedia
                        ? [mediaRoute(mediaPattern, mediaRouteRoot)]
                        : []),
                      ...publicRoutes({
                        clean,
                        cleanOptions,
                        publicPattern,
                      }),
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    },
  };
}

const expected = {
  host: "posvoji.si",
  root: publicRoot,
  requiredRoutes: [{ pattern: "/media/*", root: mediaRoot }],
  requiredRoots: [],
  requireCleanHtml: true,
  allowedRoots: [],
  forbiddenRoot,
};

assert.doesNotThrow(() => validateLayout(configFor(), expected));

assert.throws(
  () => validateLayout(configFor({ clean: false }), expected),
  /preceding \.html try_files rewrite/,
);
assert.throws(
  () =>
    validateLayout(
      configFor({ cleanOptions: { reversed: true } }),
      expected,
    ),
  /preceding \.html try_files rewrite/,
);
assert.throws(
  () =>
    validateLayout(
      configFor({ cleanOptions: { constrained: true } }),
      expected,
    ),
  /preceding \.html try_files rewrite/,
);
const wrongTryFilesRoot = configFor();
wrongTryFilesRoot.apps.http.servers.srv0.routes[0].handle[0].routes[2].match[0].file.root =
  "/srv/wrong";
assert.throws(
  () => validateLayout(wrongTryFilesRoot, expected),
  /preceding \.html try_files rewrite/,
);
const wrongTryPolicy = configFor();
wrongTryPolicy.apps.http.servers.srv0.routes[0].handle[0].routes[2].match[0].file.try_policy =
  "smallest_size";
assert.throws(
  () => validateLayout(wrongTryPolicy, expected),
  /preceding \.html try_files rewrite/,
);
const unboundTryFilesRoot = configFor();
const unboundRoutes =
  unboundTryFilesRoot.apps.http.servers.srv0.routes[0].handle[0].routes;
unboundRoutes.splice(1, 1);
unboundRoutes[1].match[0].file.root = "{http.vars.root}";
unboundRoutes[2].handle[0].root = publicRoot;
assert.throws(
  () => validateLayout(unboundTryFilesRoot, expected),
  /preceding \.html try_files rewrite/,
);
const mismatchedTryFilesRoot = configFor();
const mismatchedRoutes =
  mismatchedTryFilesRoot.apps.http.servers.srv0.routes[0].handle[0].routes;
mismatchedRoutes[1].handle[0].root = "/srv/wrong";
mismatchedRoutes[2].match[0].file.root = "/srv/wrong";
mismatchedRoutes[3].handle[0].root = publicRoot;
assert.throws(
  () => validateLayout(mismatchedTryFilesRoot, expected),
  /preceding \.html try_files rewrite/,
);
assert.throws(
  () => validateLayout(configFor({ includeMedia: false }), expected),
  /no reachable \/media\/\* file_server/,
);
assert.throws(
  () => validateLayout(configFor({ mediaPattern: "/never*" }), expected),
  /no reachable \/media\/\* file_server/,
);
const unstrippedMedia = configFor();
unstrippedMedia.apps.http.servers.srv0.routes[0].handle[0].routes[0].handle[0].routes.shift();
assert.throws(
  () => validateLayout(unstrippedMedia, expected),
  /no reachable \/media\/\* file_server/,
);
const postOnlyMedia = configFor();
postOnlyMedia.apps.http.servers.srv0.routes[0].handle[0].routes[0].match[0].method = [
  "POST",
];
assert.throws(
  () => validateLayout(postOnlyMedia, expected),
  /no reachable \/media\/\* file_server/,
);
assert.throws(
  () =>
    validateLayout(
      configFor({ publicPattern: "/only-some-pages*" }),
      expected,
    ),
  /no reachable unconditional file_server/,
);

const staticResponse = {
  handle: [{ handler: "static_response", status_code: 200, body: "ok" }],
  terminal: true,
};
assert.throws(
  () =>
    validateLayout(
      configFor({ beforeHost: [staticResponse] }),
      expected,
    ),
  /no reachable unconditional file_server/,
);
assert.throws(
  () => validateLayout(configFor({ prelude: [staticResponse] }), expected),
  /no reachable unconditional file_server/,
);
assert.doesNotThrow(() =>
  validateLayout(
    configFor({
      prelude: [
        {
          match: [{ path: ["/maintenance"] }],
          ...staticResponse,
        },
      ],
    }),
    expected,
  ),
);

assert.throws(
  () =>
    validateLayout(
      configFor({ mediaRouteRoot: "/srv/elsewhere" }),
      expected,
    ),
  /unexpected root/,
);
assert.throws(
  () =>
    validateLayout(
      configFor({
        prelude: [
          {
            match: [{ path: ["/never*"] }],
            handle: [
              { handler: "vars", root: forbiddenRoot },
              { handler: "file_server" },
            ],
          },
        ],
      }),
      expected,
    ),
  /forbidden root/,
);

// A legacy root for a different virtual host does not belong to posvoji.si.
assert.doesNotThrow(() =>
  validateLayout(
    configFor({
      extraServers: [
        {
          match: [{ host: ["legacy.example"] }],
          handle: [
            { handler: "vars", root: forbiddenRoot },
            { handler: "file_server" },
          ],
        },
      ],
    }),
    expected,
  ),
);

assert.throws(
  () =>
    validateLayout(
      { apps: { http: { servers: {} } } },
      expected,
    ),
  /no file_server route/,
);

process.stdout.write("validate-caddy-layout: OK\n");
