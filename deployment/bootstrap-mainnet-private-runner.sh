#!/bin/bash
set -euo pipefail

info() {
	echo "[runner-bootstrap] $1"
}

error() {
	echo "[runner-bootstrap] ERROR: $1" >&2
	exit 1
}

usage() {
	cat <<'EOF'
Bootstrap a dedicated GitHub Actions runner for private mainnet relayer deploys.

Required environment:
	GITHUB_RUNNER_URL      GitHub repo or org URL, for example:
												 https://github.com/OnSocial-Labs/onsocial-protocol
	GITHUB_RUNNER_TOKEN    Fresh registration token from GitHub Actions

Optional environment:
	RUNNER_NAME            Default: hostname
	RUNNER_LABELS          Default: onsocial-mainnet-private
	RUNNER_USER            Default: actions
	RUNNER_HOME            Default: /opt/actions-runner
	RUNNER_VERSION         Default: 2.333.0
	RUNNER_GROUP           Optional runner group for org-scoped runners
	RUNNER_WORKDIR         Default: _work
	INSTALL_PACKAGES       Default: true
	INSTALL_GCLOUD         Default: true

Example:
	export GITHUB_RUNNER_URL="https://github.com/OnSocial-Labs/onsocial-protocol"
	export GITHUB_RUNNER_TOKEN="<registration-token>"
	sudo -E bash deployment/bootstrap-mainnet-private-runner.sh
EOF
}

if [[ "${1:-}" = "-h" || "${1:-}" = "--help" ]]; then
	usage
	exit 0
fi

[[ "$(id -u)" -eq 0 ]] || error "Run this script as root with sudo -E"

: "${GITHUB_RUNNER_URL:?Set GITHUB_RUNNER_URL}"
: "${GITHUB_RUNNER_TOKEN:?Set GITHUB_RUNNER_TOKEN}"

RUNNER_NAME="${RUNNER_NAME:-$(hostname)}"
RUNNER_LABELS="${RUNNER_LABELS:-onsocial-mainnet-private}"
RUNNER_USER="${RUNNER_USER:-actions}"
RUNNER_HOME="${RUNNER_HOME:-/opt/actions-runner}"
RUNNER_VERSION="${RUNNER_VERSION:-2.333.0}"
RUNNER_GROUP="${RUNNER_GROUP:-}"
RUNNER_WORKDIR="${RUNNER_WORKDIR:-_work}"
INSTALL_PACKAGES="${INSTALL_PACKAGES:-true}"
INSTALL_GCLOUD="${INSTALL_GCLOUD:-true}"
RUNNER_ARCHIVE="actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
RUNNER_DOWNLOAD_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_ARCHIVE}"

command -v systemctl >/dev/null 2>&1 || error "systemd is required"
command -v curl >/dev/null 2>&1 || error "curl is required"
command -v tar >/dev/null 2>&1 || error "tar is required"

install_base_packages() {
	if [[ "$INSTALL_PACKAGES" != "true" ]]; then
		info "Skipping package installation because INSTALL_PACKAGES=$INSTALL_PACKAGES"
		return
	fi

	if command -v apt-get >/dev/null 2>&1; then
		info "Installing base packages with apt"
		apt-get update
		apt-get install -y ca-certificates curl git jq openssh-client tar unzip
		return
	fi

	info "Skipping package installation because no supported package manager was found"
}

install_gcloud() {
	if [[ "$INSTALL_GCLOUD" != "true" ]]; then
		info "Skipping gcloud installation because INSTALL_GCLOUD=$INSTALL_GCLOUD"
		return
	fi

	if command -v gcloud >/dev/null 2>&1; then
		info "gcloud already installed"
		return
	fi

	if ! command -v apt-get >/dev/null 2>&1; then
		info "Skipping gcloud installation because apt-get is unavailable"
		return
	fi

	info "Installing Google Cloud CLI"
	install -m 0755 -d /etc/apt/keyrings
	curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /etc/apt/keyrings/google-cloud.gpg
	chmod a+r /etc/apt/keyrings/google-cloud.gpg
	cat >/etc/apt/sources.list.d/google-cloud-sdk.list <<'EOF'
deb [signed-by=/etc/apt/keyrings/google-cloud.gpg] https://packages.cloud.google.com/apt cloud-sdk main
EOF
	apt-get update
	apt-get install -y google-cloud-cli
}

create_runner_user() {
	if id "$RUNNER_USER" >/dev/null 2>&1; then
		info "Runner user already exists: $RUNNER_USER"
	else
		info "Creating runner user: $RUNNER_USER"
		useradd --create-home --shell /bin/bash "$RUNNER_USER"
	fi
}

prepare_runner_home() {
	mkdir -p "$RUNNER_HOME"
	chown -R "$RUNNER_USER:$RUNNER_USER" "$RUNNER_HOME"
}

download_runner() {
	local archive_path
	archive_path="/tmp/${RUNNER_ARCHIVE}"

	info "Downloading actions runner ${RUNNER_VERSION}"
	curl -fsSL "$RUNNER_DOWNLOAD_URL" -o "$archive_path"

	info "Extracting actions runner to $RUNNER_HOME"
	sudo -u "$RUNNER_USER" tar -xzf "$archive_path" -C "$RUNNER_HOME"
	rm -f "$archive_path"
}

stop_existing_service() {
	if [[ -x "$RUNNER_HOME/svc.sh" ]]; then
		info "Stopping any existing runner service"
		"$RUNNER_HOME/svc.sh" stop || true
		"$RUNNER_HOME/svc.sh" uninstall || true
	fi
}

remove_existing_registration() {
	if [[ -f "$RUNNER_HOME/.runner" ]]; then
		info "Removing existing runner registration"
		sudo -u "$RUNNER_USER" "$RUNNER_HOME/config.sh" remove --token "$GITHUB_RUNNER_TOKEN" || true
	fi
}

configure_runner() {
	local config_args
	config_args=(
		--url "$GITHUB_RUNNER_URL"
		--token "$GITHUB_RUNNER_TOKEN"
		--name "$RUNNER_NAME"
		--labels "$RUNNER_LABELS"
		--work "$RUNNER_WORKDIR"
		--unattended
		--replace
	)

	if [[ -n "$RUNNER_GROUP" ]]; then
		config_args+=(--runnergroup "$RUNNER_GROUP")
	fi

	info "Configuring runner $RUNNER_NAME"
	sudo -u "$RUNNER_USER" bash -lc "cd '$RUNNER_HOME' && ./config.sh ${config_args[*]@Q}"
}

install_service() {
	info "Installing and starting runner service"
	(
		cd "$RUNNER_HOME"
		./svc.sh install "$RUNNER_USER"
		./svc.sh start
		./svc.sh status || true
	)
}

print_post_install_notes() {
	cat <<EOF

Runner bootstrap complete.

Runner details:
	name:    $RUNNER_NAME
	labels:  self-hosted, linux, x64, $RUNNER_LABELS
	url:     $GITHUB_RUNNER_URL
	home:    $RUNNER_HOME

Recommended next checks:
	systemctl status 'actions.runner.*' --no-pager
	journalctl -u 'actions.runner.*' -n 100 --no-pager
	command -v gcloud
	ssh root@10.1.0.2 'hostname'
	ssh root@10.1.0.3 'hostname'

This runner should be dedicated to private mainnet relayer deployment only.
EOF
}

install_base_packages
install_gcloud
create_runner_user
prepare_runner_home
stop_existing_service
remove_existing_registration
download_runner
configure_runner
install_service
print_post_install_notes
