import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "scripts", "deploy.sh"), "utf8").replaceAll(
  "\r\n",
  "\n",
);

assert.ok(
  source.includes('LC_ALL=C comm -13 \\"\\${desired}\\"'),
  "the orphan diff must compare its C-sorted lists under the C locale",
);
assert.ok(
  source.includes("umask 077\nmkdir -m 700 ${HOST_VERIFY_DIR}"),
  "the host verifier directory must be private from creation",
);
assert.ok(
  source.includes("--no-same-owner --no-same-permissions"),
  "host verifier extraction must not restore group/world archive modes",
);
assert.ok(
  source.includes("find ${HOST_VERIFY_DIR} -perm /077 -print -quit"),
  "host verifier upload must reject exposed inputs",
);
assert.ok(
  source.includes("stat -c '%u:%a' ${HOST_VERIFY_DIR}"),
  "host verification must recheck root ownership and mode",
);

const startMarker = 'NEXT_LINK="${CURRENT_LINK}.${RELEASE_NAME}.next"';
const endMarker = "REMOTE_RELEASE_UNHEALTHY=false";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);

assert.notEqual(start, -1, "deploy.sh has no flip transaction start marker");
assert.notEqual(end, -1, "deploy.sh has no flip transaction end marker");

const transaction = source.slice(start, end + endMarker.length);
const base = String.raw`
set -euo pipefail
CURRENT_LINK=/srv/posvoji/current
RELEASE_NAME=abc123-20260902T000000Z-0123456789abcdef
RELEASE_DIR=/srv/posvoji/releases/$RELEASE_NAME
OWNERSHIP=posvoji:caddy
VERIFIED_ROLLBACK_STATUS=42
REMOTE_LOCK_RELEASE_SAFE=true
REMOTE_RELEASE_UNHEALTHY=true
HOST_CONTROL_DIR=/srv/posvoji/.deploy-control-test
CURRENT_SITE_SUFFIX=/public
HEALTH_NETRC=/etc/posvoji/health.netrc
`;

function run(harness) {
  const result = spawnSync("bash", ["-s"], {
    cwd: root,
    encoding: "utf8",
    input: `${base}\n${harness}\n${transaction}\n`,
  });
  return {
    ...result,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function innerHarness(oldStatus = 200, newStatus = 500) {
  return String.raw`
current_target=/srv/posvoji/releases/old
next_target=
NEW_STATUS=${newStatus}
OLD_STATUS=${oldStatus}

readlink() { printf '%s\n' "$current_target"; }
cat() { printf '%s\n' "$RELEASE_NAME"; }
ln() {
  while [ "$#" -gt 2 ]; do shift; done
  next_target="$1"
}
chown() { return 0; }
mv() { current_target="$next_target"; next_target=; }
rm() { next_target=; }
bash() {
  if [ "$current_target" = "$RELEASE_DIR" ]; then
    [ "$NEW_STATUS" = 200 ]
  else
    [ "$OLD_STATUS" = 200 ]
  fi
}
node() { return 0; }
fail() { printf 'UNEXPECTED_FAIL:%s\n' "$*"; exit 96; }
remote() {
  set +e
  ( eval "$2" )
  inner_status=$?
  set -e
  printf 'INNER_STATUS=%s\n' "$inner_status"
  [ "$inner_status" -eq "$EXPECTED_REMOTE_STATUS" ]
}
`;
}

{
  const result = run(`EXPECTED_REMOTE_STATUS=42\n${innerHarness()}`);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /restored after failed deploy/);
  assert.match(result.output, /verified rollback release bytes/);
  assert.match(result.output, /INNER_STATUS=42/);
}

{
  const result = run(`EXPECTED_REMOTE_STATUS=0\n${innerHarness(200, 200)}`);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /verified live release bytes/);
  assert.match(result.output, /INNER_STATUS=0/);
  assert.doesNotMatch(result.output, /restored after failed deploy/);
}

{
  const result = run(`EXPECTED_REMOTE_STATUS=1\n${innerHarness(500)}`);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /restored target failed authenticated release verification/);
  assert.match(result.output, /INNER_STATUS=1/);
  assert.doesNotMatch(result.output, /verified rollback release bytes/);
}

function classificationHarness(status, transportSafe) {
  return String.raw`
REMOTE_RESULT=${status}
TRANSPORT_SAFE=${transportSafe}
remote() {
  REMOTE_LOCK_RELEASE_SAFE="$TRANSPORT_SAFE"
  return "$REMOTE_RESULT"
}
fail() {
  printf 'FAIL:%s\n' "$*"
  printf 'LOCK_RELEASE_SAFE=%s\n' "$REMOTE_LOCK_RELEASE_SAFE"
  printf 'RELEASE_UNHEALTHY=%s\n' "$REMOTE_RELEASE_UNHEALTHY"
  exit 97
}
`;
}

{
  const result = run(classificationHarness(42, true));
  assert.equal(result.status, 97, result.output);
  assert.match(result.output, /previous release was restored and verified/);
  assert.match(result.output, /LOCK_RELEASE_SAFE=true/);
  assert.match(result.output, /RELEASE_UNHEALTHY=true/);
}

for (const [status, transportSafe] of [
  [1, true],
  [42, false],
]) {
  const result = run(classificationHarness(status, transportSafe));
  assert.equal(result.status, 97, result.output);
  assert.match(result.output, /retained the host lock for inspection/);
  assert.match(result.output, /LOCK_RELEASE_SAFE=false/);
}

process.stdout.write("deploy-rollback: OK\n");
