# Deploy the sap-system MCP server in HTTPS mode

Microsoft 365 Copilot Cowork and other remote agents cannot start a local MCP server. This
folder runs the same `sap-system` server that the `sap-abap` plugin bundles as an HTTPS service
on a host of your own, next to the SAP system. The server stays read-only; Cowork users sign in
with Microsoft Entra ID, and the SAP credentials never leave the host.

```text
Copilot Cowork --HTTPS, Entra ID token--> Caddy (443) --> sap-system MCP (127.0.0.1:8000) --> SAP ICM (ADT, OData)
```

## What you need

- A Linux host that can reach the SAP system, with Docker Engine and Docker Compose v2. The
  A4H trial in Docker on the same host works well: the server reaches it at
  `http://127.0.0.1:50000`.
- A DNS name that points at the host, for example the DNS label of an Azure public IP
  (`<label>.<region>.cloudapp.azure.com`). Let's Encrypt issues the certificate for it.
- Inbound TCP 443 open to the internet (Cowork connects from Microsoft's cloud). Port 80 can
  stay closed: Caddy uses the TLS-ALPN-01 challenge.
- For sign-in: a Microsoft Entra ID app registration and the Teams developer portal
  registration described in [docs/copilot-cowork.md](../../docs/copilot-cowork.md).

## Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Python 3.13 image with the server and its pinned dependencies |
| `compose.yaml` | The server on 127.0.0.1:8000 and Caddy on 443, both on the host network |
| `Caddyfile` | TLS with automatic certificates, reverse proxy for `/mcp`, `/.well-known/*`, and `/healthz` |
| `.env.example` | Every setting with an explanation; copy it to `.env` |
| `deploy.sh` | Clone or update the repository on the host, write `.env`, start or restart the containers |

## Install or update

On the host, as root:

```bash
curl -fsSLo /tmp/deploy.sh https://raw.githubusercontent.com/enterprise-agent-skills/enterprise-agent-skills/main/deploy/sap-system-mcp/deploy.sh
PUBLIC_HOST=<dns-name> ACME_EMAIL=<email> MCP_PUBLIC_URL=https://<dns-name>/mcp \
SAP_URL=http://127.0.0.1:50000 SAP_USER=<user> SAP_PASSWORD='<password>' SAP_CLIENT=001 \
ENTRA_TENANT_ID=<tenant id> ENTRA_CLIENT_ID=<client id> ENTRA_AUDIENCES=https://<dns-name> \
bash /tmp/deploy.sh
```

Read the script before you run it; it is short. It clones the repository into
`/opt/enterprise-agent-skills`, writes `deploy/sap-system-mcp/.env` with mode 600, runs
`docker compose up -d --build`, and checks `http://127.0.0.1:8000/healthz`. Run it again
without `SAP_PASSWORD` to update the code and keep the settings.

On an Azure VM you can run the same script without SSH through a managed run command. The
header of `deploy.sh` shows the `az vm run-command create` call; protected parameters are
encrypted and never shown in the portal or the activity log.

To open port 443 on an Azure VM whose network security group has no rule for it:

```bash
az network nsg rule create -g <resource-group> --nsg-name <nsg> -n AllowHttpsInbound \
  --priority 1010 --direction Inbound --access Allow --protocol Tcp \
  --destination-port-ranges 443 --source-address-prefixes Internet
```

## Check it

```bash
curl -s https://<dns-name>/healthz
curl -s https://<dns-name>/.well-known/oauth-protected-resource
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<dns-name>/mcp
```

The first call returns `{"ok": true, ...}`, the second the protected resource metadata that
names your Entra tenant as the authorization server, and the third `401`, because an MCP call
without a token is refused. Logs: `docker compose logs -f mcp` and `docker compose logs -f caddy`
in `/opt/enterprise-agent-skills/deploy/sap-system-mcp`.

## Demo mode

For a trial system with demo data only, the server can run without sign-in: set
`MCP_DEMO_PATH_SECRET` to a random string of at least 32 characters
(`python sap_system_mcp.py new-secret`) and leave the `ENTRA_*` values empty. The MCP endpoint
is then `https://<dns-name>/mcp/<secret>`. Anyone who knows that URL can read the system, so
treat it like a password, and switch to sign-in before you connect a system with real data.
To rotate the secret, change the value and run `docker compose up -d`.

## Remove

```bash
cd /opt/enterprise-agent-skills/deploy/sap-system-mcp && docker compose down -v
rm -rf /opt/enterprise-agent-skills
```

Delete the network security group rule and the Entra registrations when you no longer need them.
