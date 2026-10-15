# Retention-purge scheduler — validated this round, still not installed

Milestone 2, round 4. `sutriva-purge-saved-borrow-checks.service` + `.timer` are prepared, reviewable
systemd unit files for running `app/purge_saved_borrow_checks.py` on a schedule. **Neither file has been
copied to any host, `systemctl enable`d, or started anywhere.** This session has no way to do either (SSH
to `sutriva-alpha` remains blocked), and installing them is a separate, future deployment decision this
document does not make.

## What "validated" means here, precisely

This machine itself has no `systemd` (macOS). Per instruction to validate on a compatible environment
rather than document around the gap, this round actually did: a disposable `debian:bookworm-slim` Docker
container with `systemd` installed, destroyed immediately after — never a host, never persistent.

1. **First run, against the unit files exactly as written, no stubbing**:
   `systemd-analyze verify sutriva-purge-saved-borrow-checks.service sutriva-purge-saved-borrow-checks.timer`
   → **failed**, correctly: `Command /opt/sutriva/venv/bin/python is not executable: No such file or
   directory`. This is systemd doing real, substantive validation (it checks that `ExecStart`'s binary
   actually exists and is executable) — not a false pass, and not a bug in the unit file either: that path
   legitimately doesn't exist in a throwaway container, only on the real host once installed.
2. **Second run, with the host's expected layout stubbed** (a dummy executable at
   `/opt/sutriva/venv/bin/python`, an empty `/etc/sutriva/api.env`, a `sutriva` system user, the unit files
   copied to `/etc/systemd/system/` exactly as a real install would place them): `systemd-analyze verify`
   → **exit code 0, no errors, no warnings**, for both files together and for the timer alone. This is a
   real pass from a real `systemd 252` binary, not a syntax-only check — confirms the `[Unit]`/`[Service]`/
   `[Install]` and `[Unit]`/`[Timer]`/`[Install]` sections, directive names, and value types are all valid
   systemd unit syntax that a real systemd accepts.

**What this does not prove**: that `/opt/sutriva/venv/bin/python`, `/etc/sutriva/api.env`, and a `sutriva`
system user actually exist in that exact shape on `sutriva-alpha` — those remain documented assumptions
to confirm against the real host (this session has no SSH access to check directly), not independently
re-verified. It also doesn't prove the timer actually fires on schedule end-to-end on a live system,
since a disposable container was never booted as PID 1 with systemd actually running services — only
unit-file validity was checked this way. The underlying command's actual *effect* (removing expired rows,
keeping active ones) was separately proven in the previous round by running it directly against a real
database — that evidence still stands and isn't repeated here.

## Install steps (prepared — not performed)

For whoever has host access, when this is approved to go live:

1. Copy both files to `/etc/systemd/system/` on `sutriva-alpha`.
2. Confirm the `ExecStart` venv path and `EnvironmentFile` path against what the API service's own,
   already-installed unit actually uses (not re-derived here — read the real file on the host).
3. `sudo systemctl daemon-reload`
4. `sudo systemctl enable --now sutriva-purge-saved-borrow-checks.timer`

## Verification steps (after install)

5. `systemctl status sutriva-purge-saved-borrow-checks.timer` — confirm `active (waiting)`, and
   `systemctl list-timers sutriva-purge-saved-borrow-checks.timer` — confirm a `NEXT`/`LEFT` time is
   scheduled, not blank.
6. `journalctl -u sutriva-purge-saved-borrow-checks.service` after the first scheduled fire (or
   `sudo systemctl start sutriva-purge-saved-borrow-checks.service` to trigger one run immediately,
   independent of the timer, for a faster first check) — confirm the expected
   `{"saved_borrow_checks_deleted": N}` line appears, with no traceback.
7. Confirm via a direct, read-only database query that a row known to be past `expires_at` was actually
   removed by that run, and that an active row was not — the same check this round's end-to-end test
   already performed once; worth re-confirming once against the real production database specifically,
   not assumed to transfer automatically from the test database.

## Disable instructions (if this ever needs to be turned off)

8. `sudo systemctl disable --now sutriva-purge-saved-borrow-checks.timer` — stops future scheduled runs
   immediately and removes the boot-enablement symlink; a run already in progress (rare, given each
   invocation is a bounded, fast batch) completes normally and is not killed by this command.
9. Confirm with `systemctl list-timers` that it no longer appears, and `systemctl status
   sutriva-purge-saved-borrow-checks.timer` reports `inactive (dead)`.
10. The `.service` unit itself needs no separate disable action — it is `Type=oneshot` with no
    `[Install] WantedBy` dependency on boot by itself; only the timer controls whether it ever runs.
    Removing the two files from `/etc/systemd/system/` and running `sudo systemctl daemon-reload` fully
    uninstalls both, if ever wanted.
11. Disabling this scheduler does not delete anything already purged, and does not affect the application
    route's own `savedCheckEnabled` flag or any other part of the feature — it only stops the periodic
    cleanup job; expired/deleted rows simply accumulate again until the timer (or a manual run of
    `python -m app.purge_saved_borrow_checks`) is used again.

**This closes the scheduling gap for the saved-check purge specifically.** The *existing*
`app/purge_anonymous_data.py` job has the identical gap (no scheduler found for it either — see
`docs/execution/B1_SAVED_CHECK_LAUNCH_GAPS.md`) and the same pattern would close it too, as a natural
follow-up, not addressed by these two files.
