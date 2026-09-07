import { flagList, flagValue, hasFlag } from "./cli";
import { runExport } from "./export-run";

const argv = process.argv.slice(2);
const result = await runExport({
  providerId: flagValue(argv, "--provider"),
  acceptRemovals: flagList(argv, "--accept-removals"),
  discardPrevious: hasFlag(argv, "--discard-previous"),
  refreshAll: hasFlag(argv, "--refresh-all"),
  republish: hasFlag(argv, "--republish"),
});
process.exitCode = result.exitCode;
