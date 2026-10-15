from __future__ import annotations

from types import MappingProxyType

# The immutable registry a `saved_borrow_checks.notice_version` value resolves to. Per instruction:
# "notice_version maps to immutable notice text" — a version *string* alone (e.g. stored next to
# `created_at` as evidence) is not evidence of anything unless the text it refers to is pinned somewhere
# that cannot silently drift. This module is that pin.
#
# Rules, enforced by tests/test_saved_check_notice_versions.py, not just stated here:
# 1. Every entry's text, once added, is never edited or removed. A wording change gets a NEW version key
#    (see app/services/saved_borrow_checks.py's SAVE_CHECK_NOTICE_VERSION) and a new entry below — the old
#    entry stays exactly as it was, forever, so a past row's `notice_version` always resolves to what was
#    actually shown at the time, not a later rewrite.
# 2. `SAVE_CHECK_NOTICE_VERSION` (the version every *new* save is stamped with) must always be a key here —
#    a save using a version this registry doesn't recognize is itself a bug the tests catch.
# 3. The text here must match SaveCheckForm.tsx's actual rendered notice copy for that version, checked
#    directly by reading the frontend source file in a test — not asserted by comment alone. If the
#    frontend copy ever changes without this registry gaining a new entry, that test fails.
NOTICE_VERSIONS: MappingProxyType[str, str] = MappingProxyType({
    "save-check-notice-v1-2026-10-15": (
        "We'll email you a private link to this exact result. It isn't shared with anyone else and isn't "
        "linked to any account."
    ),
})
