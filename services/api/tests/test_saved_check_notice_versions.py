from __future__ import annotations

from pathlib import Path

from app.saved_check_notice_versions import NOTICE_VERSIONS
from app.services.saved_borrow_checks import SAVE_CHECK_NOTICE_VERSION

# Repo-relative, not test-file-relative in a fragile way: services/api/tests/.. -> services/api ->
# services -> repo root -> apps/pwa/...
_FRONTEND_SOURCE = (
    Path(__file__).resolve().parents[3] / "apps" / "pwa" / "app" / "situations" / "SaveCheckForm.tsx"
)


def test_the_current_notice_version_has_an_immutable_registry_entry() -> None:
    # Mirrors the assertion already in saved_borrow_checks.py — re-checked here as an actual test, not
    # just an import-time assertion that could be skipped if the module import order ever changed.
    assert SAVE_CHECK_NOTICE_VERSION in NOTICE_VERSIONS


def test_every_registered_version_has_real_nonempty_text() -> None:
    assert NOTICE_VERSIONS, "the registry must never be empty while any version constant references it"
    for version, text in NOTICE_VERSIONS.items():
        assert version.strip(), "a version key must not be blank"
        assert text.strip(), f"version {version!r} must have real text, not a placeholder"


def test_the_registry_is_structurally_immutable() -> None:
    # MappingProxyType itself prevents item assignment — confirmed directly, not just by the type's name.
    import pytest

    with pytest.raises(TypeError):
        NOTICE_VERSIONS["save-check-notice-v1-2026-10-15"] = "a rewritten version of history"  # type: ignore[index]


def test_the_registered_text_matches_what_save_check_form_actually_renders() -> None:
    # The mechanical check this registry exists for: read the real frontend source file (not a copy, not
    # a paraphrase) and confirm the current version's registered text is exactly what it renders, after
    # normalizing JSX's `&apos;` HTML entity back to a literal apostrophe. If this notice copy is ever
    # edited without adding a new registry entry (and bumping SAVE_CHECK_NOTICE_VERSION), this test is the
    # one thing that actually catches it, rather than relying on a comment being honored by habit.
    assert _FRONTEND_SOURCE.is_file(), f"expected to find the frontend source at {_FRONTEND_SOURCE}"
    source = _FRONTEND_SOURCE.read_text(encoding="utf-8").replace("&apos;", "'")

    current_text = NOTICE_VERSIONS[SAVE_CHECK_NOTICE_VERSION]
    # The source wraps this sentence across multiple JSX lines with leading whitespace; compare on
    # normalized whitespace rather than requiring an exact multi-line layout match.
    normalized_source = " ".join(source.split())
    normalized_text = " ".join(current_text.split())
    assert normalized_text in normalized_source, (
        "the registered notice text no longer matches SaveCheckForm.tsx's actual rendered copy — "
        "either the registry is stale, or the frontend copy changed without a new version being added"
    )
