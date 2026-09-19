import { readFileSync } from "node:fs";

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const title = event.pull_request?.title;
const match = typeof title === "string"
  ? title.match(/^(feat|fix|docs|refactor|perf|test|style|chore)(\([a-z0-9][a-z0-9/-]*\))?: (?<description>[\p{Ll}\p{N}][^\r\n]*)$/u)
  : null;
const description = match?.groups?.description;
if (!description || match[0] !== title || description !== description.trimEnd() || description.endsWith(".")) {
  console.error("Use a Conventional Commit PR title with a lowercase opening and no trailing period, for example: fix(web): correct the species filter");
  process.exitCode = 1;
} else {
  console.log("Pull request title: OK");
}
