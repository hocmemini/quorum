#!/usr/bin/env bash
# Locally blackhole a DSQL endpoint in WSL2 to test failover under a REAL hanging connection:
# egress SYNs are dropped, so connect() hangs until the client's connectionTimeoutMillis trips
# and the FailoverClient moves to the next endpoint. This exercises the timeout/hang code path
# (different from a cleanly-removed endpoint) for pennies, without touching AWS networking.
# The Phase 3 demo upgrades this to a real partition via a deny-all NACL or AWS FIS.
#
#   sudo scripts/blackhole.sh <hostname>     # drop egress to the host's resolved IPv4 addresses
#   sudo scripts/blackhole.sh --undo         # remove every rule this script added
#
# Requires sudo (iptables). Uses a dedicated chain so --undo is exact and self-contained.
set -euo pipefail
CHAIN="H0_BLACKHOLE"

if [ "${1:-}" = "--undo" ]; then
  iptables -D OUTPUT -j "$CHAIN" 2>/dev/null || true
  iptables -F "$CHAIN" 2>/dev/null || true
  iptables -X "$CHAIN" 2>/dev/null || true
  echo "blackhole removed."
  exit 0
fi

HOST="${1:?usage: sudo scripts/blackhole.sh <hostname> | --undo}"
mapfile -t IPS < <(getent ahostsv4 "$HOST" | awk '{print $1}' | sort -u)
[ "${#IPS[@]}" -eq 0 ] && {
  echo "could not resolve $HOST" >&2
  exit 1
}

iptables -nL "$CHAIN" >/dev/null 2>&1 || iptables -N "$CHAIN"
iptables -C OUTPUT -j "$CHAIN" >/dev/null 2>&1 || iptables -A OUTPUT -j "$CHAIN"
for ip in "${IPS[@]}"; do
  iptables -C "$CHAIN" -d "$ip" -j DROP >/dev/null 2>&1 || iptables -A "$CHAIN" -d "$ip" -j DROP
  echo "DROP egress -> ${ip} (${HOST})"
done
echo "blackhole active. Validate failover:  pnpm --filter @quorum/spike-failover smoke"
echo "remove when done:                     sudo $0 --undo"
