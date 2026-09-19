import { readdirSync, readFileSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// A narrow guard for contact data, not a replacement for reviewing names,
// addresses, permissions or other personal information in a fixture.
export function findContacts(source) {
  const decoded = source
    .replace(/&#(x[0-9a-f]+|[0-9]+);?/giu, (_, value) => {
      const code = value[0].toLowerCase() === "x"
        ? parseInt(value.slice(1), 16) : Number(value);
      return code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&commat;/giu, "@")
    .replace(/&nbsp;/giu, " ")
    .replace(/%40/giu, "@")
    .replace(/%2b/giu, "+");
  // Keep href contacts, and also inspect text split across HTML elements.
  const text = `${decoded}\n${decoded.replace(/<[^>]*>/gu, " ")}`;
  const emails = [...text.matchAll(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}/giu)]
    .map(([value]) => value.toLowerCase());
  const phones = [...text.matchAll(/(?<![\w])(?:(?:\+|00)[1-9](?:[ ()/.-]*[0-9]){7,14}|0[1-7](?:[ ()/.-]*[0-9]){7})(?![0-9])/gu)]
    .map(([value]) => value.replace(/\D/gu, "").replace(/^00/u, ""));
  return { emails: [...new Set(emails)], phones: [...new Set(phones)] };
}

export function unapprovedContacts(source, allowance = {}) {
  const contacts = findContacts(source);
  return {
    emails: contacts.emails.filter((value) =>
      !/@(?:[a-z0-9-]+\.)*example\.(?:com|org|net|invalid)$/u.test(value) &&
      !(allowance.emails ?? []).includes(value)),
    phones: contacts.phones.filter((value) => !(allowance.phones ?? []).includes(value)),
  };
}

export function checkFixtures(root) {
  const allowances = JSON.parse(readFileSync(join(root, "scripts/fixture-contact-allowlist.json"), "utf8"));
  const failures = [];
  let files = 0;
  function walk(directory, inFixtures = false) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path, inFixtures || entry.name === "fixtures");
      else if (entry.isFile() && inFixtures) {
        files++;
        const name = relative(root, path).replaceAll("\\", "/");
        const found = unapprovedContacts(readFileSync(path, "utf8"), allowances[name]);
        // Report locations and counts; do not reproduce possible personal data.
        if (found.emails.length || found.phones.length)
          failures.push(`${name}: ${found.emails.length} unapproved email(s), ${found.phones.length} unapproved phone(s)`);
      }
    }
  }
  walk(join(root, "providers"));
  return { files, failures };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkFixtures(fileURLToPath(new URL("../", import.meta.url)));
  if (result.failures.length) {
    console.error(result.failures.join("\n"));
    console.error("Remove personal contacts. Only verified institutional contacts or documented synthetic examples may be allowlisted for an exact fixture path.");
    process.exitCode = 1;
  } else console.log(`fixture contacts: ${result.files} files checked`);
}
