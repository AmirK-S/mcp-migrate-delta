# Reading a delta

The delta compares two runs of the official conformance suite, check by check, inside each
scenario. Only scored scenarios of the requirements file count; the tool prints the others
apart. Read the following before calling a result good or bad.

## What is a regression

A check that was SUCCESS in the baseline and is FAILURE now, in a scored scenario. Nothing
else. One is enough for the tool to fail; the tool's own output says so. A check that was
FAILURE and is still FAILURE is "still failing": not a regression, but not done either.

## What looks like a regression and is not

- **Added and removed checks.** A migrated server exposes a different surface for the parts
  of the protocol that changed shape (server-initiated requests become multi round-trip
  results, resource subscriptions become a listen stream). The suite then runs checks that did
  not exist before and stops running some that did. They are listed as `added` and `removed`,
  never as regressions.
- **Status moves that are neither a fix nor a regression.** Any move other than FAILURE to
  SUCCESS or SUCCESS to FAILURE is listed as `changed`. The tool lists them without counting
  them as regressions.
- **A not scored scenario getting worse.** The tasks extension scenarios and the pending ones
  run but never count. They appear under "(not scored)" in the scenario list.

## What a green suite can hide

- **A scenario reported green with zero checks executed.** The tool labels it `empty`. It
  is not a pass.
- **A scenario the suite crashed on.** The suite counts it as failed in its own summary but
  writes no `checks.json`; the tool labels it `crashed` and counts it as failing.
- **A check that left SUCCESS without reaching FAILURE.** SUCCESS to WARNING and SUCCESS to
  SKIPPED are listed as `changed`, alongside the harmless moves. Read the `changed` list of
  the delta report, not only the counts.
- **A scenario that passes for the wrong reason.** Some checks expect a JSON-RPC error and
  are satisfied by any error, including the one a 2025-11-25 transport returns to every
  stateless request. One such scenario passes on an unmigrated server. Read the baseline's
  root causes, not only its counts.

## What the suite needs from the server

The 2026-07-28 requirements run scenarios against a named surface: tools, prompts and
resources with specific names and behaviours. A server that does not expose them fails
those scenarios with "not found" errors that are not protocol defects. The two bundled
fixtures of the repository implement that surface; a production server usually does not.
For a production server, read the root causes: a wall of "not found" for `test_*` names
means the surface is missing, not that the protocol is wrong. The comparison before and
after on the same server stays valid either way, because both sides miss the same surface.

## What to report

Copy the verdict line and the two summary lines of the delta, then list the regressions if
any with their scenario, check and error message from the run report. Do not summarise a
regression away.
