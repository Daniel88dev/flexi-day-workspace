# Native sessions are device-bound, with a flat ten-year expiry

The phone app (designed in Daniel88dev/flexi-day-workspace#12, session decisions in
Daniel88dev/flexi-day-workspace#20) signs in once and should stay signed in until the person
signs out. The backend has one better-auth instance with one `session.expiresIn`, seven days for
the browser, and no per-client lifetime. We chose to keep the cookie transport for the phone
through the better-auth `expo` plugin and to mark a session as native by one header,
`x-client-device-id`: a random id the app mints on first launch and keeps in the iOS Keychain.
A native session is stamped with the device id and a ten-year `expires_at` when it is created,
the cookie is re-issued with a matching `Max-Age`, and every later request must carry the same id.
A different id, or none, deletes the session and answers 401 with `SESSION_DEVICE_MISMATCH`, and
the app responds by wiping its cookie jar, session cache and local store. A completed sign-in
evicts any earlier session bound to the same device, so a phone holds at most one.

The alternatives were the `bearer` plugin, a sliding lifetime, and App Attest. `bearer` never
mirrors the two-factor challenge cookie, so the app would have parsed `Set-Cookie` itself and
still needed the expo origin header, and it copies the raw session token into a response header
that every browser tab can read. A sliding lifetime is not expressible per client: the refresh
condition is one global formula, and raising `expiresIn` would stretch web sessions to the same
length on their first session read. App Attest needs the paid Apple Developer Program, its key
rotates on reinstall with Apple advising not to revoke on a new key, the opposite of the mismatch
rule, and it proves the binary rather than the person while the same backend accepts a browser
sign-in with a password. The trade is that the binding is only as strong as the Keychain: a
stolen cookie is useless without the id, but a phone that gives up both gives up the session, and
the ten years mean the row outlives most phones unless a password reset or a later devices page
ends it. Web sessions carry a null device id and ignore the header entirely, so nothing about the
browser changes.

## What would reverse this

Shipping the app through the App Store with the paid program, which makes App Attest available;
it would take its own columns next to `device_id`, not replace it. Or better-auth gaining a
per-request session lifetime, which would let the native session slide and drop the after hook
that re-issues the cookie.
