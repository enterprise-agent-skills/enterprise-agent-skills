# HTTPS mode of the sap-system MCP server. Build context is the repository root:
#   docker compose -f deploy/sap-system-mcp/compose.yaml up -d --build
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN pip install "mcp==2.2.0" "httpx==0.28.1" "PyJWT[crypto]==2.15.1" "uvicorn==0.54.0"

RUN useradd --create-home --uid 10001 app
WORKDIR /app
COPY plugins/sap-abap/mcp/sap-system/sap_system_mcp.py /app/sap_system_mcp.py
USER app

# Bound to 127.0.0.1 in compose.yaml; Caddy terminates TLS in front of it.
CMD ["python", "/app/sap_system_mcp.py", "serve", "--transport", "http"]
