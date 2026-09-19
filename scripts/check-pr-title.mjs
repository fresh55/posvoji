import { readFileSync } from "node:fs";

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const title = event.pull_request?.title;
if (title === undefined) {
  console.log("No pull request title to validate for this event.");
} else if (!/^(feat|fix|docs|refactor|perf|test|style|chore)(\([a-z0-9][a-z0-9/-]*\))?: \S[^\r\n]*$/u.test(title)) {
  console.error("Use a Conventional Commit PR title, for example: fix(web): correct the species filter");
  process.exitCode = 1;
} else {
  console.log("Pull request title: OK");
}
