#!/usr/bin/env bash
# bringup.sh — OnSocial node box, phase 2: hardening + base packages.
# Run on the FRESH Debian 12 install (after installimage + first boot), as root:
#   scp deployment/node-bringup/* root@<IP>:/root/bringup/
#   ssh root@<IP> 'bash /root/bringup/bringup.sh'
# Idempotent; safe to re-run.
set -euo pipefail

echo '=== [1/6] base packages ==='
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl wget jq unzip htop iotop ca-certificates gnupg chrony \
  ufw fail2ban unattended-upgrades apt-listchanges restic

echo '=== [2/6] ssh hardening (key-only) ==='
# Our pubkey is already in /root/.ssh/authorized_keys (installimage copied it).
# Lock password auth; keep root login key-only (deploy user comes later with
# the app migration — node work runs as the dedicated `near` user).
printf '%s\n' \
  'PasswordAuthentication no' \
  'KbdInteractiveAuthentication no' \
  'PermitRootLogin prohibit-password' \
  > /etc/ssh/sshd_config.d/90-onsocial.conf
systemctl reload ssh

echo '=== [3/6] firewall ==='
ufw default deny incoming
ufw default allow outgoing
ufw limit ssh comment 'ssh, rate-limited'
ufw allow 24567/tcp comment 'NEAR p2p'
ufw allow 80/tcp comment 'caddy (app migration phase)'
ufw allow 443/tcp comment 'caddy (app migration phase)'
# RPC stays loopback-only (127.0.0.1:3030) — intentionally NOT opened here.
ufw --force enable
ufw status verbose

echo '=== [4/6] fail2ban (sshd) ==='
cat > /etc/fail2ban/jail.d/sshd-onsocial.conf <<'EOF'
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban

echo '=== [5/6] unattended security upgrades ==='
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now unattended-upgrades

echo '=== [6/6] node service account ==='
id -u near >/dev/null 2>&1 || useradd --system --home /var/lib/near --shell /usr/sbin/nologin near
mkdir -p /var/lib/near
chown near:near /var/lib/near

echo
echo 'bringup.sh done. Next: neard install (neard-install.sh), then state sync.'
