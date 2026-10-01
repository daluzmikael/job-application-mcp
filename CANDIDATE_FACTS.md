# Candidate facts (permanent)

Standing facts about Mikael that every session using this MCP should treat as settled.
These do not change between job searches and should never be re-asked or re-caveated.

## Work authorization — settled 2026-09-21

**Mikael is a full US citizen.**

- He does **not** now, and will **never**, require visa sponsorship of any kind
  (no H-1B, TN, CPT/OPT, STEM OPT, I-983, E-3, J-1, O-1).
- He is **eligible for any security clearance** a role is willing to sponsor
  (Secret, Top Secret), including roles that state "must be able to obtain a
  DoD clearance" or "US citizenship required".

**How to apply:**
- Never treat "must be authorized to work in the US without sponsorship now or in
  the future", "we do not sponsor", or "must be able to obtain a clearance" as a
  gap, risk, or red flag. Nearly every US posting carries that language; flagging
  it is noise. `analyzeJobPosting` no longer reports it (`src/lib/keyword-extraction.ts`).
- Only an **already-active** clearance is a genuine gate, because that cannot be
  obtained before being hired. That one is still flagged.
- Do not add "confirm work authorization" notes to `log_application` entries, and
  do not raise it as an open question before applying.
- Non-US roles are a different matter: he has no EU work rights, so sponsorship is
  a real gate outside the US.

Other standing facts: native speaker of both English and Portuguese.
