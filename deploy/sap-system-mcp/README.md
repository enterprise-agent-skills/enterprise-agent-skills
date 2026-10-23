# Deploy the sap-system MCP server in HTTPS mode

Microsoft 365 Copilot Cowork and other remote agents cannot start a local MCP server. This
folder runs the same `sap-system` server that the `sap-abap` plugin bundles as an HTTPS service
on a host of your own, next to the SAP system. The server stays read-only; Cowork users sign in
with Microsoft Entra ID, and the SAP credentials never leave the host.

```text
Copilot Cowork --HTTPS, Entra ID token--> Caddy (443) --> sap-system MCP (127.0.0.1:8000) --> SAP ICM (ADT, OData)
```

## What you need

- A Linux host that can reach the SAP system's ICM port, with Docker Engine and Docker
  Compose v2 (Docker runs only the connector; SAP itself can run anywhere, see the next
  section). The A4H trial in Docker on the same host works well: the server reaches it at
  `http://127.0.0.1:50000`.
- A DNS name that points at the host, for example the DNS label of an Azure public IP
  (`<label>.<region>.cloudapp.azure.com`). Let's Encrypt issues the certificate for it.
- Inbound TCP 443 open to the internet (Cowork connects from Microsoft's cloud). Port 80 can
  stay closed: Caddy uses the TLS-ALPN-01 challenge.
- For sign-in: a Microsoft Entra ID app registration and the Teams developer portal
  registration described in [docs/copilot-cowork.md](../../docs/copilot-cowork.md).

## Where the SAP system runs does not matter

Docker here runs only the connector (the Python server and Caddy), never SAP. The server
needs one thing from the SAP system: its ICM HTTP or HTTPS port, the same port ABAP
Development Tools uses, with the ADT services active in SICF (`/sap/bc/adt`). So the SAP
system can be:

| SAP runs | Set `SAP_URL` to | Notes |
|----------|------------------|-------|
| On its own VM or physical server (the usual case: SAP ECC, S/4HANA on premises or on Azure, AWS, or Google Cloud VMs) | `https://<sap-host>:44300` (HTTPS port of the ICM; the number is the system's, 44300 is the convention for instance 00) | Run the connector on a separate small host in the same network, not on the SAP host. Only this host needs a public DNS name and port 443; the SAP system stays private. If the ICM uses a company certificate, the connector trusts it like any browser; set `SAP_INSECURE=true` only for a self-signed trial certificate |
| In Docker on the same host as the connector (the A4H trial) | `http://127.0.0.1:50000` | What this folder was tested with |
| In SAP's private cloud or another managed environment | The HTTPS URL of the ICM that the hosting provider gives you | The connector host must be allowed to reach it (allowlist, VPN, or peering) |

Give the connector's SAP user display authorizations only (for example the authorizations of
a read-only developer role plus `S_DEVELOP` with activity 03 for the objects it may read).
The server adds its own guard on top: it refuses every HTTP verb that could change the system.

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
curl -s https://<dns-name>/.well-known/oauth-protected-resource/mcp
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<dns-name>/mcp
```

The first call returns `{"ok": true, ...}`, the second the protected resource metadata that
names your Entra tenant as the authorization server (the document lives under the MCP path,
as RFC 9728 prescribes for a resource with a path), and the third `401`, because an MCP call
without a token is refused. In demo mode the second call returns 404, because there is no
sign-in to describe. Logs: `docker compose logs -f mcp` and `docker compose logs -f caddy`
in `/opt/enterprise-agent-skills/deploy/sap-system-mcp`.

## Without Docker

If the connector host may not run Docker, the server is a single Python file and Caddy is a
single binary, so the same layout works as two system services. Not verified in this
repository; the Docker path above is the tested one.

1. Install Python 3.10 or later and `python3 -m pip install "mcp==2.2.0" "httpx==0.28.1" "PyJWT[crypto]==2.15.1" "uvicorn==0.54.0"`
   in a virtual environment under `/opt/sap-system-mcp`.
2. Copy `plugins/sap-abap/mcp/sap-system/sap_system_mcp.py` next to it and write the same
   `.env` as `.env.example` describes (mode 600, owned by a service user).
3. Run it as a service that loads the env file and starts
   `python sap_system_mcp.py serve --transport http` with `MCP_BIND_HOST=127.0.0.1` and
   `MCP_PORT=8000` (for example a systemd unit with `EnvironmentFile=/opt/sap-system-mcp/.env`).
4. Install Caddy from its package repository, use the `Caddyfile` from this folder with the
   two placeholders replaced by your host name and email, and let it bind port 443.

The checks under [Check it](#check-it) are the same.

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
