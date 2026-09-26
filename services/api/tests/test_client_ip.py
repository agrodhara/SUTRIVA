from __future__ import annotations

import ipaddress

import pytest
from starlette.requests import Request

from app.services.client_ip import TrustedProxyConfigError, get_trusted_proxy_networks, resolve_client_ip


def _request(*, peer: str | None, headers: dict[str, str] | None = None) -> Request:
    raw_headers = [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in (headers or {}).items()]
    scope = {
        "type": "http",
        "client": (peer, 12345) if peer is not None else None,
        "headers": raw_headers,
        "method": "GET",
        "path": "/",
        "query_string": b"",
        "server": ("testserver", 80),
        "scheme": "http",
    }
    return Request(scope)


def _networks(*cidrs: str) -> tuple:
    return tuple(ipaddress.ip_network(c, strict=False) for c in cidrs)


# --- No trusted proxies configured: today's exact behaviour, unchanged ---------------------------


def test_no_trusted_proxies_configured_always_uses_the_direct_peer():
    request = _request(peer="203.0.113.7", headers={"X-Forwarded-For": "198.51.100.9"})
    assert resolve_client_ip(request, trusted_proxies=()) == "203.0.113.7"


def test_no_client_at_all_returns_unknown():
    request = _request(peer=None)
    assert resolve_client_ip(request, trusted_proxies=_networks("10.0.0.5")) == "unknown"


# --- The actual vulnerability: an untrusted peer must never have its X-Forwarded-For honored ------


def test_an_untrusted_peer_forwarding_header_is_ignored_even_if_present():
    # A visitor connecting directly (not through the trusted proxy) cannot fake a different address just
    # by setting the header themselves.
    request = _request(peer="198.51.100.50", headers={"X-Forwarded-For": "1.2.3.4"})
    assert resolve_client_ip(request, trusted_proxies=_networks("10.0.0.5")) == "198.51.100.50"


# --- The fix: a trusted proxy's own forwarded header IS honored, correctly attributing each visitor -----


def test_a_trusted_proxy_peer_with_a_forwarded_header_returns_the_real_client():
    request = _request(peer="10.0.0.5", headers={"X-Forwarded-For": "203.0.113.7"})
    assert resolve_client_ip(request, trusted_proxies=_networks("10.0.0.5")) == "203.0.113.7"


def test_two_different_real_visitors_behind_the_same_trusted_proxy_resolve_to_different_keys():
    # This is the exact bug: without the fix, both of these would resolve to the same "10.0.0.5" (the
    # proxy's own address) and share one rate-limit bucket. With it, each gets its own.
    a = _request(peer="10.0.0.5", headers={"X-Forwarded-For": "203.0.113.7"})
    b = _request(peer="10.0.0.5", headers={"X-Forwarded-For": "203.0.113.99"})
    trusted = _networks("10.0.0.5")
    assert resolve_client_ip(a, trusted_proxies=trusted) != resolve_client_ip(b, trusted_proxies=trusted)
    assert resolve_client_ip(a, trusted_proxies=trusted) == "203.0.113.7"
    assert resolve_client_ip(b, trusted_proxies=trusted) == "203.0.113.99"


def test_a_trusted_peer_with_no_forwarded_header_falls_back_to_the_peer():
    request = _request(peer="10.0.0.5", headers={})
    assert resolve_client_ip(request, trusted_proxies=_networks("10.0.0.5")) == "10.0.0.5"


def test_a_cidr_range_trusts_any_proxy_address_inside_it():
    request = _request(peer="10.0.0.42", headers={"X-Forwarded-For": "203.0.113.7"})
    assert resolve_client_ip(request, trusted_proxies=_networks("10.0.0.0/24")) == "203.0.113.7"

    # An address outside the range is not trusted.
    outside = _request(peer="10.0.1.42", headers={"X-Forwarded-For": "203.0.113.7"})
    assert resolve_client_ip(outside, trusted_proxies=_networks("10.0.0.0/24")) == "10.0.1.42"


# --- Multi-hop chains: walk past every trusted hop, stop at the first untrusted one ----------------


def test_multiple_chained_trusted_proxies_resolve_to_the_real_client_at_the_left():
    # client(203.0.113.7) -> proxyA(10.0.0.6) -> proxyB(10.0.0.5) -> us. Both proxies are trusted.
    request = _request(peer="10.0.0.5", headers={"X-Forwarded-For": "203.0.113.7, 10.0.0.6"})
    assert resolve_client_ip(request, trusted_proxies=_networks("10.0.0.5", "10.0.0.6")) == "203.0.113.7"


def test_a_client_injected_hop_before_the_real_trusted_chain_is_not_returned():
    # An attacker connecting through the real trusted proxy chain cannot plant a fake address ahead of it:
    # walking from the right (nearest to us) past the trusted hops still lands on the real client, because
    # every hop the attacker could have injected is to the left of the proxy's own honestly-appended hop.
    # Here "9.9.9.9" is a value the origin client supplied and the proxy dutifully appended after it.
    request = _request(peer="10.0.0.5", headers={"X-Forwarded-For": "9.9.9.9, 203.0.113.7"})
    assert resolve_client_ip(request, trusted_proxies=_networks("10.0.0.5")) == "203.0.113.7"


def test_every_hop_being_a_trusted_proxy_falls_back_to_the_nearest_one():
    request = _request(peer="10.0.0.5", headers={"X-Forwarded-For": "10.0.0.6"})
    assert resolve_client_ip(request, trusted_proxies=_networks("10.0.0.5", "10.0.0.6")) == "10.0.0.6"


def test_malformed_or_empty_forwarded_for_is_handled_gracefully():
    request = _request(peer="10.0.0.5", headers={"X-Forwarded-For": " , , "})
    assert resolve_client_ip(request, trusted_proxies=_networks("10.0.0.5")) == "10.0.0.5"


# --- Configuration ---------------------------------------------------------------------------------


def test_get_trusted_proxy_networks_defaults_to_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TRUSTED_PROXY_IPS", raising=False)
    assert get_trusted_proxy_networks() == ()


def test_get_trusted_proxy_networks_parses_a_comma_separated_list(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRUSTED_PROXY_IPS", " 10.0.0.5 , 10.0.1.0/24 ")
    networks = get_trusted_proxy_networks()
    assert ipaddress.ip_address("10.0.0.5") in networks[0]
    assert ipaddress.ip_address("10.0.1.200") in networks[1]


def test_an_invalid_trusted_proxy_entry_raises_a_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "not-an-ip")
    with pytest.raises(TrustedProxyConfigError):
        get_trusted_proxy_networks()
