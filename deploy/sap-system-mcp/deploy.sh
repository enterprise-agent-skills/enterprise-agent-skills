#!/usr/bin/env bash
# Install or update the sap-system MCP server (HTTPS mode) on this host. Run as root on a
# Linux host with Docker and Docker Compose, for example through an Azure managed run command:
#
#   az vm run-command create -g <resource-group> --vm-name <vm> --name sap-system-mcp \
#     --script "$(curl -fsSL https://raw.githubusercontent.com/enterprise-agent-skills/enterprise-agent-skills/main/deploy/sap-system-mcp/deploy.sh)" \
#     --parameters PUBLIC_HOST=<dns-name> ACME_EMAIL=<email> MCP_PUBLIC_URL=https://<dns-name>/mcp \
#                  SAP_URL=http://127.0.0.1:50000 SAP_USER=<user> SAP_CLIENT=001 \
#                  ENTRA_TENANT_ID=<tenant> ENTRA_CLIENT_ID=<client id> ENTRA_AUDIENCES=<uris> \
#     --protected-parameters SAP_PASSWORD=<password>
#
# Azure passes the parameters to the script as environment variables; protected parameters are
# encrypted and not shown in the portal or the activity log. The settings are written to
# deploy/sap-system-mcp/.env (mode 600). Without SAP_PASSWORD the script keeps the existing .env
# and only updates the code.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/enterprise-agent-skills}"
REPO_URL="${REPO_URL:-https://github.com/enterprise-agent-skills/enterprise-agent-skills.git}"
REF="${REPO_REF:-main}"

if ! command -v docker >/dev/null; then
  echo "deploy: docker is not installed" >&2
  exit 2
fi
if ! command -v git >/dev/null; then
  apt-get update -q && apt-get install -y -q git
fi

if [ ! -d "$APP_DIR/.git" ]; then
  git clone --quiet --depth 1 --branch "$REF" "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" fetch --quiet --depth 1 origin "$REF"
  git -C "$APP_DIR" checkout --quiet FETCH_HEAD
fi
cd "$APP_DIR/deploy/sap-system-mcp"
echo "deploy: code at $(git -C "$APP_DIR" rev-parse --short HEAD) ($REF)"

if [ -n "${SAP_PASSWORD:-}" ]; then
  umask 077
  {
    echo "PUBLIC_HOST=${PUBLIC_HOST:?PUBLIC_HOST is required}"
    echo "ACME_EMAIL=${ACME_EMAIL:?ACME_EMAIL is required}"
    echo "MCP_PUBLIC_URL=${MCP_PUBLIC_URL:?MCP_PUBLIC_URL is required}"
    echo "SAP_URL=${SAP_URL:?SAP_URL is required}"
    echo "SAP_USER=${SAP_USER:?SAP_USER is required}"
    echo "SAP_PASSWORD=${SAP_PASSWORD}"
    echo "SAP_CLIENT=${SAP_CLIENT:-001}"
    echo "SAP_LANGUAGE=${SAP_LANGUAGE:-EN}"
    for name in SAP_INSECURE ENTRA_TENANT_ID ENTRA_CLIENT_ID ENTRA_AUDIENCES ENTRA_SCOPE ENTRA_ALLOWED_CLIENT_IDS MCP_DEMO_PATH_SECRET; do
      if [ -n "${!name:-}" ]; then echo "$name=${!name}"; fi
    done
  } > .env
  echo "deploy: wrote .env"
elif [ ! -f .env ]; then
  echo "deploy: no .env exists and no SAP_PASSWORD was given" >&2
  exit 2
fi

docker compose up -d --build --remove-orphans
sleep 5
if curl -fsS http://127.0.0.1:8000/healthz; then
  echo
  echo "deploy: the server answers on 127.0.0.1:8000; Caddy serves it on port 443"
else
  echo "deploy: the server did not answer; last log lines:" >&2
  docker compose logs --tail 40 mcp >&2
  exit 1
fi
docker compose ps
