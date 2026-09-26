from __future__ import annotations

import ipaddress
import os
from typing import Union

from fastapi import Request

IpNetwork = Union[ipaddress.IPv4Network, ipaddress.IPv6Network]


class TrustedProxyConfigError(ValueError):
    """Raised when TRUSTED_PROXY_IPS holds a value that isn't a valid IP address or CIDR network."""


def _parse_trusted_proxies(value: str | None) -> tuple[IpNetwork, ...]:
    if not value:
        return ()
    networks: list[IpNetwork] = []
    for raw in value.split(","):
        raw = raw.strip()
        if not raw:
            continue
        try:
            # strict=False: a bare host IP (no prefix, e.g. "10.0.0.5") is accepted as its own /32 or /128,
            # not just a network address — this is the common case (one reverse proxy's address), not a
            # subnet, so requiring callers to spell "/32" themselves would be needless friction.
            networks.append(ipaddress.ip_network(raw, strict=False))
        except ValueError as exc:
            raise TrustedProxyConfigError(f"TRUSTED_PROXY_IPS entry {raw!r} is not a valid IP address or CIDR network") from exc
    return tuple(networks)


def get_trusted_proxy_networks() -> tuple[IpNetwork, ...]:
    """The reverse proxies (e.g. the documented nginx in front of this API) this process is allowed to
    trust `X-Forwarded-For` from. Empty by default — meaning `resolve_client_ip` always falls back to the
    raw TCP peer and never reads the header at all, exactly today's behaviour, until an operator
    explicitly configures this. Read fresh on every call (like get_pilot_rate_limit_settings and friends)
    so tests can monkeypatch os.environ without needing a process restart."""
    return _parse_trusted_proxies(os.getenv("TRUSTED_PROXY_IPS"))


def _is_trusted(ip_str: str, trusted: tuple[IpNetwork, ...]) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    return any(ip in network for network in trusted)


def resolve_client_ip(request: Request, *, trusted_proxies: tuple[IpNetwork, ...] | None = None) -> str:
    """The real visitor address to key per-source abuse controls (rate limiting, etc.) on.

    `request.client.host` is the direct TCP peer — it can never be spoofed by the far end of that
    connection, but behind a reverse proxy (the documented nginx in front of this API; see
    docs/execution/UAT_DEPLOYMENT.md) it is always the proxy's own address, not the visitor's, unless the
    proxy is itself the one forwarding a header. Blindly trusting `X-Forwarded-For` from *any* peer would
    let a visitor simply set that header to whatever they like and evade or frame another visitor's rate
    limit — so it is only ever consulted when the direct peer is a proxy this deployment has explicitly
    named in `TRUSTED_PROXY_IPS`.

    When the peer is trusted and a forwarded-for chain is present, this walks the chain from the right
    (nearest to us) and returns the first hop that is *not* itself a trusted proxy.

    IMPORTANT — this alone does not stop a visitor from choosing their own identity; it depends on the
    trusted edge proxy itself never forwarding a value the visitor supplied. This function has no way to
    tell "a value our own trusted proxy appended, describing another proxy further out" apart from "a value
    the original visitor typed into their own outbound header and the edge proxy left untouched" — both
    just look like an extra hop to walk past. That distinction rests entirely on the assumption that a real
    remote visitor can never themselves connect from an address this deployment lists in `TRUSTED_PROXY_IPS`
    — normally true (a public listener's network stack rejects a remote packet claiming a loopback or
    private source address; a real attacker cannot make their own connection appear to originate from
    `127.0.0.1`), but an assumption this function cannot verify or enforce itself, and one that a same-host
    testing setup cannot avoid relying on (the test client's own connection to a local proxy IS from
    `127.0.0.1`, coinciding with the proxy's own trusted identity — see
    test_client_ip.py's test_an_appending_edge_proxy_can_be_misled_when_the_caller_shares_its_trusted_address
    for exactly this).

    The nginx directive this deployment uses (`X-Forwarded-For $remote_addr`, in
    docs/execution/UAT_DEPLOYMENT.md) OVERWRITES anything the visitor sent with nginx's own observed peer
    instead of appending to it, removing this assumption entirely: there is nothing of the visitor's own
    claimed value left in the header by the time it reaches Uvicorn or this function, regardless of what
    address the visitor connects from. nginx is the one hop directly facing the internet, with no other
    proxy in front of it, so it is the one that must discard rather than preserve. If a future topology adds
    a genuine second proxy hop in front of nginx (e.g. a CDN), that outer-most hop is the one that must
    overwrite; every hop after it may then safely append, since nothing between it and here can any longer
    contain an unverified value.
    """
    trusted = trusted_proxies if trusted_proxies is not None else get_trusted_proxy_networks()
    peer = request.client.host if request.client is not None else None
    if peer is None:
        return "unknown"

    if not trusted or not _is_trusted(peer, trusted):
        return peer

    forwarded_for = request.headers.get("x-forwarded-for")
    if not forwarded_for:
        return peer

    hops = [hop.strip() for hop in forwarded_for.split(",") if hop.strip()]
    for hop in reversed(hops):
        if not _is_trusted(hop, trusted):
            return hop
    # Every hop named in the header is itself a trusted proxy (unusual, e.g. a health check from the proxy
    # tier itself) — fall back to the nearest one rather than inventing a client address.
    return hops[0] if hops else peer
