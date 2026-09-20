from __future__ import annotations

from conftest import phaseb_origin


def test_options_preflight_is_credentialed_and_exact_origin(phaseb_client) -> None:
    response = phaseb_client.options(
        "/v1/anonymous-sessions/bootstrap",
        headers={
            "Origin": phaseb_origin(),
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == phaseb_origin()
    assert response.headers["access-control-allow-credentials"] == "true"


def test_state_changing_cookie_endpoint_rejects_missing_origin(phaseb_client) -> None:
    response = phaseb_client.post("/v1/anonymous-sessions/bootstrap")
    assert response.status_code == 403
    assert response.json() == {"detail": "invalid_origin"}
