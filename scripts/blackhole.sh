#!/bin/sh
# Locally blackhole a DSQL endpoint to validate failover under a REAL hanging connection.
# DSQL regional endpoints resolve to MULTIPLE / rotating IPs, so dropping one resolved IP with
# iptables is unreliable — the client just reconnects on another IP (observed 2026-06-07: smoke
# was still served by the "blackholed" region). Instead we pin the hostname to a non-routable
# blackhole IP via /etc/hosts, so EVERY connection to it hangs until the client connect-timeout
# trips and the FailoverClient moves to the next region. The Phase-3 demo upgrades this to a real
# partition (deny-all NACL / AWS FIS), which is server-side and not subject to client DNS.
#
#   sudo scripts/blackhole.sh <hostname>     # pin hostname -> blackhole IP
#   sudo scripts/blackhole.sh --undo         # remove the pin
#
# Requires sudo (edits /etc/hosts). POSIX sh, no deps. Marker-tagged for an exact undo.
# (Test the text logic without sudo: BLACKHOLE_HOSTS=/tmp/h sh scripts/blackhole.sh <host>)
set -u
HOSTS="${BLACKHOLE_HOSTS:-/etc/hosts}"
MARK="# h0-spike-blackhole"
BLACKHOLE_IP="198.51.100.1"   # RFC 5737 TEST-NET-2: unrouted -> SYN gets no reply -> hang

strip() { grep -v "$MARK" "$HOSTS" 2>/dev/null || true; }

if [ "${1:-}" = "--undo" ]; then
  [ -w "$HOSTS" ] || { printf 'blackhole: cannot write %s (use sudo)\n' "$HOSTS" >&2; exit 1; }
  tmp=$(mktemp); strip > "$tmp"; cat "$tmp" > "$HOSTS"; rm -f "$tmp"
  echo "blackhole pins removed from $HOSTS"
  exit 0
fi

HOST="${1:?usage: sudo scripts/blackhole.sh <hostname> | --undo}"
[ -w "$HOSTS" ] || { printf 'blackhole: cannot write %s (use sudo)\n' "$HOSTS" >&2; exit 1; }
tmp=$(mktemp)
strip > "$tmp"
printf '%s\t%s\t%s\n' "$BLACKHOLE_IP" "$HOST" "$MARK" >> "$tmp"
cat "$tmp" > "$HOSTS"; rm -f "$tmp"
echo "blackhole active: $HOST -> $BLACKHOLE_IP (in $HOSTS)"
echo "validate: (AWS_PROFILE=h0, .env sourced)  pnpm --filter @quorum/spike-failover smoke   # expect us-east-2"
echo "remove:   sudo $0 --undo"
