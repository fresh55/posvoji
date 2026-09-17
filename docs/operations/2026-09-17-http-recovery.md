# Bounded HTTP recovery

The crawler uses a 24-hour ceiling for server retry deferrals. Ordinary
shorter `Retry-After` values remain honored; longer numeric or date values are
capped. Negative, fractional, non-HTTP-date and overflowing values are rejected
and use the existing exponential backoff instead. HTTP dates support the three
forms specified by [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-5.6.7).
The ceiling is an explicit crawler policy, not a limit imposed by that RFC.

On loading scheduling state, expired host cooldowns are removed and legacy
extreme timestamps are capped once and written back. Restarting an export
does not slide that repaired deadline into the future. Corrupt JSON and invalid
stored value types still fail closed. No operator reset is needed for an old
overflow-generated timestamp; it becomes eligible within one day of repair.

If a provider-source host cooldown extends beyond its last successful check
plus the provider interval, the schedule reports a degraded skip through the
existing export exit-code machinery. It retains the animal records and their
real observation times. A shorter cooldown inside the check interval remains a
clean skip. The provider is eligible again when both the schedule and cooldown
allow it. No automatic animal expiry is introduced.

Connection failures when obtaining robots.txt are cached per origin for five
minutes, with at most 256 failure entries per client. Other URLs on that origin
reuse the failure without another connection/retry cycle. Other origins remain
independent. Expiry permits a fresh robots attempt, not an unchecked content
request; content stays blocked until robots rules are obtained. Existing
successful rules and HTTP deny-all handling remain unchanged.

Offline regressions cover malformed/large headers, legacy date forms, negative
cache expiry and origin isolation, persisted deferral repair without deadline
drift, and a degraded export that retains records and recovers after expiry.
