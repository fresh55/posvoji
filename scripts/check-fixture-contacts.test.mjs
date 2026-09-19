import assert from "node:assert/strict";
import test from "node:test";
import { findContacts, unapprovedContacts } from "./check-fixture-contacts.mjs";

test("detects plain and encoded contacts without treating dates or animal IDs as phones", () => {
  assert.deepEqual(findContacts("person&#64;sample.invalid; person%40sample.invalid; 05 000 00 00; +386 (0)5 000 00 00; 2026-09-19; animal-123456789"), {
    emails: ["person@sample.invalid"], phones: ["050000000", "386050000000"],
  });
});

test("institutional exemptions are exact and must be supplied for the fixture", () => {
  const content = "office@shelter.invalid other@shelter.invalid 05 000 00 00";
  assert.equal(unapprovedContacts(content).emails.length, 2);
  assert.deepEqual(unapprovedContacts(content, { emails: ["office@shelter.invalid"], phones: ["050000000"] }), {
    emails: ["other@shelter.invalid"], phones: [],
  });
});

test("checks contacts that occur only in HTML attributes or across markup", () => {
  assert.deepEqual(findContacts('<a href="mailto:person&#64;sample.invalid">Email</a> 05 <b>000</b> 00 00'), {
    emails: ["person@sample.invalid"], phones: ["050000000"],
  });
});

test("reserved example domains are safe placeholders, lookalike domains are not", () => {
  assert.deepEqual(unapprovedContacts("shelter@example.org shelter@example.com.attacker.invalid"), {
    emails: ["shelter@example.com.attacker.invalid"], phones: [],
  });
});
