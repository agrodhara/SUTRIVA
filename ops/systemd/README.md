# Retention-purge scheduler — wired and tested, not installed

Milestone 2, round 3. `sutriva-purge-saved-borrow-checks.service` + `.timer` are prepared, reviewable
systemd unit files for running `app/purge_saved_borrow_checks.py` on a schedule. **Neither file has been
copied to any host, `systemctl enable`d, or started anywhere.** This session has no way to do either (SSH
to `sutriva-alpha` remains blocked), and installing them is a separate, future deployment decision this
document does not make.

## What "tested" means here, precisely

This machine has no `systemd` (macOS) — `systemd-analyze verify` could not be run against these unit
files, and that gap is stated here rather than silently skipped. What **was** tested, directly:

- The exact command the service's `ExecStart` invokes — `python -m app.purge_saved_borrow_checks`, run
  from `services/api` — against a real, migrated Postgres 16 database seeded with one expired row and one
  active row. Output: `{"saved_borrow_checks_deleted": 1}`, and a direct follow-up query confirmed only
  the expired row was removed; the active row survived untouched. This proves the command itself is
  correct; it does not prove the systemd unit syntax is accepted by a real systemd (untestable on this
  machine).
- The unit files' syntax follows standard systemd conventions (`[Unit]`/`[Service]`/`[Install]` for the
  service, `[Unit]`/`[Timer]`/`[Install]` for the timer) and mirrors the one concrete detail this
  project's own deployment runbook documents about the existing API service: the release lives at
  `/opt/sutriva/current` (a symlink to `/opt/sutriva/releases/<sha>`), and secret environment files live
  under `/etc/sutriva/` at mode `0600` — see `docs/execution/UAT_DEPLOYMENT.md`. The exact venv path
  (`/opt/sutriva/venv`) is a documented assumption to confirm against the real host before installing this,
  not independently re-verified this round (this session has no SSH access to check it directly).
- Both files parse as well-formed INI section structure (`python3 -c "import configparser; ...".read(...)`
  confirms `[Unit]`/`[Service]`/`[Install]` and `[Unit]`/`[Timer]`/`[Install]` each parse cleanly) — a weak
  but real, independently-run check, not a substitute for `systemd-analyze verify` on real systemd.

## Install steps (prepared — not performed)

For whoever has host access, when this is approved to go live:

1. Copy both files to `/etc/systemd/system/` on `sutriva-alpha`.
2. Confirm the `ExecStart` venv path and `EnvironmentFile` path against what the API service's own,
   already-installed unit actually uses (not re-derived here — read the real file on the host).
3. `sudo systemctl daemon-reload`
4. `sudo systemctl enable --now sutriva-purge-saved-borrow-checks.timer`
5. Confirm with `systemctl list-timers` and `journalctl -u sutriva-purge-saved-borrow-checks.service` that
   it fires on schedule and logs the expected `{"saved_borrow_checks_deleted": N}` line.

**This closes the scheduling gap for the saved-check purge specifically.** The *existing*
`app/purge_anonymous_data.py` job has the identical gap (no scheduler found for it either — see
`docs/execution/B1_SAVED_CHECK_LAUNCH_GAPS.md`) and the same pattern would close it too, as a natural
follow-up, not addressed by these two files.
