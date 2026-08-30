// Shared network boundary for one-off web data generators. Keeping these
// downloads behind the provider SDK gives them robots.txt handling, per-host
// serialization, delays, retries and a streaming response-size limit.
import { PoliteClient } from "../../../packages/provider-sdk/src/polite-client.ts";

const DEFAULT_USER_AGENT =
  "PosvojiWebDataBuilder/1.0 (+https://posvoji.si/bot; bot@posvoji.si)";
const clients = new Map();

function clientFor(userAgent, botName) {
  const key = `${botName}\u0000${userAgent}`;
  let client = clients.get(key);
  if (client === undefined) {
    client = new PoliteClient({ userAgent, botName });
    clients.set(key, client);
  }
  return client;
}

export async function readRemoteBytes(
  url,
  {
    maxBytes,
    accept = "*/*",
    userAgent = DEFAULT_USER_AGENT,
    botName = "PosvojiWebDataBuilder",
    label = String(url),
  },
) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError("remote downloads require an explicit positive maxBytes");
  }
  const response = await clientFor(userAgent, botName).getBytes(String(url), {
    accept,
    maxBytes,
  });
  if (
    response.status < 200 ||
    response.status >= 300 ||
    response.body === null
  ) {
    throw new Error(`${label}: HTTP ${response.status}`);
  }
  return response.body;
}

export async function readRemoteText(url, options) {
  return (await readRemoteBytes(url, options)).toString("utf8");
}

export async function readRemoteJson(url, options) {
  const text = await readRemoteText(url, options);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${options.label ?? String(url)}: invalid JSON`, {
      cause: error,
    });
  }
}
