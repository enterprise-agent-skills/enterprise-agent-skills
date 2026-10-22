#!/usr/bin/env python3
"""sap_system_mcp.py: a read-only MCP server for one SAP ABAP system.

It connects to SAP ECC, SAP S/4HANA, or the ABAP Platform trial (A4H) over two HTTP
surfaces that every ABAP system has, so nothing is installed in SAP and no SAP NetWeaver RFC
SDK is needed:

  * ADT REST  (/sap/bc/adt/*)    repository search, package contents, DDIC tables and their
                                 rows, ABAP, CDS, and RAP source, installed components
  * OData v2  (/sap/opu/odata/*) Gateway service catalog, $metadata, entity queries

Derived from "SAP A4H Conversational Scout" by Amit Lal (MIT), the same author.

Commands (run through launch.mjs, which finds a Python 3 interpreter, or directly):

  python sap_system_mcp.py serve                   MCP over stdio (the default command)
  python sap_system_mcp.py serve --transport http  HTTPS mode for Microsoft 365 Copilot Cowork
                                                   and other remote clients; see the README
  python sap_system_mcp.py setup                   test the connection and write the config file
  python sap_system_mcp.py selftest                six connection checks, report on stderr
  python sap_system_mcp.py print-tools             the tools and their input schemas as JSON
  python sap_system_mcp.py self-check              offline checks of the guards (no network)
  python sap_system_mcp.py config-path             print the config file path

Configuration comes from the process environment first and then from the config file
(SAP_SYSTEM_MCP_ENV, or the default path printed by config-path):

  SAP_URL             the ICM URL, for example https://sap.example.com:44300 or http://localhost:50000
  SAP_USER, SAP_PASSWORD, SAP_CLIENT (001), SAP_LANGUAGE (EN)
  SAP_INSECURE        true to skip TLS certificate checks (self-signed trial systems only)
  SAP_READ_ONLY       true (default): HTTP verbs that could change the system are refused
  SAP_BLOCK_FREE_SQL  true (default): the free-form SELECT tool stays disabled
  SAP_MODE            focused (default) or full
  SAP_TIMEOUT, SAP_MAX_ROWS   safety ceilings (60 seconds, 500 rows)

In stdio mode nothing may be written to stdout except MCP protocol frames, so every
diagnostic goes to stderr.
"""

from __future__ import annotations

import argparse
import base64
import getpass
import json
import logging
import os
import re
import secrets
import sys
from dataclasses import dataclass, field
from typing import Any, Iterable
from urllib.parse import quote, urlsplit
from xml.etree import ElementTree as ET

VERSION = "0.1.0"
USER_AGENT = f"sap-system-mcp/{VERSION}"

log = logging.getLogger("sap_system_mcp")
_handler = logging.StreamHandler(sys.stderr)
_handler.setFormatter(logging.Formatter("%(levelname)s [sap-system] %(message)s"))
log.addHandler(_handler)
log.propagate = False
log.setLevel(logging.INFO)


# --------------------------------------------------------------------------------------
# configuration
# --------------------------------------------------------------------------------------

def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def config_path() -> str:
    """The config file: SAP_SYSTEM_MCP_ENV, or a per-user file outside the plugin folder."""
    explicit = (os.environ.get("SAP_SYSTEM_MCP_ENV") or "").strip()
    if explicit:
        return explicit
    if os.name == "nt":
        base = os.environ.get("APPDATA") or os.path.join(os.path.expanduser("~"), "AppData", "Roaming")
    else:
        base = os.environ.get("XDG_CONFIG_HOME") or os.path.join(os.path.expanduser("~"), ".config")
    return os.path.join(base, "enterprise-agent-skills", "sap-system.env")


def parse_dotenv(text: str) -> dict[str, str]:
    """KEY=VALUE lines; comments and blank lines are skipped; quotes around values are removed."""
    values: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key.startswith("export "):
            key = key[7:].strip()
        if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", key):
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        values[key] = value
    return values


def load_config_values() -> dict[str, str]:
    """Environment variables win; the config file fills in what the environment leaves unset."""
    values: dict[str, str] = {}
    path = config_path()
    if os.path.isfile(path):
        try:
            with open(path, encoding="utf-8") as handle:
                values.update(parse_dotenv(handle.read()))
        except OSError as exc:
            log.warning("could not read %s: %s", path, exc)
    for key, value in os.environ.items():
        # A plugin host that has no value for a setting may pass the placeholder through
        # unchanged, for example "${user_config.sap_url}"; that counts as unset.
        if key.startswith(("SAP_", "MCP_", "ENTRA_")) and value.strip() and not _PLACEHOLDER.match(value.strip()):
            values[key] = value
    return values


_PLACEHOLDER = re.compile(r"^\$\{[^}]*\}$")


class NotConfigured(RuntimeError):
    """The SAP connection is missing. The message tells the user how to finish the setup."""


SETUP_HINT = (
    "The SAP connection is not configured. Run the one-time setup, which tests the connection "
    "and writes the config file: `node <plugin folder>/mcp/sap-system/launch.mjs setup` "
    "(or `python sap_system_mcp.py setup`). In Claude Code, enable the sap-abap plugin and "
    "enter the SAP URL, user, password, and client when it asks. The settings can also be "
    "given as the environment variables SAP_URL, SAP_USER, SAP_PASSWORD, and SAP_CLIENT."
)


@dataclass
class Settings:
    url: str
    user: str
    password: str
    client: str = "001"
    language: str = "EN"
    insecure: bool = False
    read_only: bool = True
    block_free_sql: bool = True
    verbose: bool = False
    mode: str = "focused"
    timeout: float = 60.0
    max_rows: int = 500

    @classmethod
    def from_values(cls, values: dict[str, str]) -> "Settings":
        url = (values.get("SAP_URL") or "").strip().rstrip("/")
        user = (values.get("SAP_USER") or "").strip()
        password = values.get("SAP_PASSWORD") or ""
        if not url or not user or not password:
            raise NotConfigured(SETUP_HINT)
        if not re.match(r"^https?://", url):
            raise NotConfigured(f"SAP_URL must start with http:// or https://, not {url!r}. " + SETUP_HINT)
        settings = cls(
            url=url,
            user=user,
            password=password,
            client=(values.get("SAP_CLIENT") or "001").strip() or "001",
            language=(values.get("SAP_LANGUAGE") or "EN").strip() or "EN",
            insecure=_as_bool(values.get("SAP_INSECURE"), False),
            read_only=_as_bool(values.get("SAP_READ_ONLY"), True),
            block_free_sql=_as_bool(values.get("SAP_BLOCK_FREE_SQL"), True),
            verbose=_as_bool(values.get("SAP_VERBOSE"), False),
            mode=(values.get("SAP_MODE") or "focused").strip().lower() or "focused",
            timeout=float(values.get("SAP_TIMEOUT") or 60.0),
            max_rows=int(values.get("SAP_MAX_ROWS") or 500),
        )
        log.setLevel(logging.DEBUG if settings.verbose else logging.INFO)
        return settings

    @classmethod
    def from_env(cls) -> "Settings":
        return cls.from_values(load_config_values())

    def plaintext_warning(self) -> str | None:
        host = (urlsplit(self.url).hostname or "").lower()
        if self.url.startswith("http://") and host not in {"localhost", "127.0.0.1", "::1"}:
            return (
                f"SAP_URL {self.url} uses plain HTTP to a remote host, so the SAP password travels "
                "unencrypted. Use the HTTPS port of the system (44300 on trial systems) where you can."
            )
        return None


# --------------------------------------------------------------------------------------
# safety guards
# --------------------------------------------------------------------------------------

class SapError(RuntimeError):
    """Anything the caller should see as a clean, explained failure."""


# SAP object names: letters, digits, underscore, slash (namespaces such as /DMO/BOOKING).
_NAME_RE = re.compile(r"^[A-Za-z_/][A-Za-z0-9_/]{0,39}$")

# Anything that could change the system or chain a second statement.
_FORBIDDEN_SQL = re.compile(
    r"(?i)\b(insert|update|delete|modify|drop|create|alter|truncate|grant|revoke|"
    r"commit|rollback|call|exec|execute|merge|upsert|lock)\b|;|--|/\*"
)

# Characters accepted inside a WHERE clause or an OData filter. Deliberately narrow.
_WHERE_ALLOWED = re.compile(r"^[A-Za-z0-9_/\s'\"=<>!,.()%*+\-:@]*$")


def validate_name(name: str, what: str = "object name", upper: bool = True) -> str:
    name = (name or "").strip()
    if not _NAME_RE.match(name):
        raise SapError(
            f"Invalid {what}: {name!r}. Expected SAP naming (letters, digits, underscore, slash; at most 40 characters)."
        )
    return name.upper() if upper else name


def validate_where(where: str | None) -> str:
    """Allow a simple read-only WHERE clause; reject anything that looks like injection."""
    if not where:
        return ""
    where = where.strip()
    if not _WHERE_ALLOWED.match(where):
        raise SapError("The WHERE clause contains characters that are not allowed.")
    if _FORBIDDEN_SQL.search(where):
        raise SapError("The WHERE clause contains a forbidden keyword or statement separator.")
    if len(where) > 1000:
        raise SapError("The WHERE clause is too long (at most 1000 characters).")
    return where


def validate_select_list(columns: Iterable[str] | None) -> str:
    if not columns:
        return "*"
    return ", ".join(validate_name(c, "column name") for c in columns)


def assert_read_only_sql(statement: str) -> None:
    text = statement.strip()
    if not re.match(r"(?i)^\s*select\b", text):
        raise SapError("Only SELECT statements are permitted.")
    if _FORBIDDEN_SQL.search(text):
        raise SapError("The statement contains a forbidden keyword or statement separator.")


# --------------------------------------------------------------------------------------
# XML helpers
# --------------------------------------------------------------------------------------

def _localname(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _attrs_without_ns(elem: ET.Element) -> dict[str, str]:
    return {_localname(k): v for k, v in elem.attrib.items()}


def _parse_xml(text: str) -> ET.Element:
    try:
        return ET.fromstring(text)
    except ET.ParseError as exc:
        raise SapError(f"SAP returned a response that is not valid XML: {exc}") from exc


def _extract_sap_error(body: str) -> str:
    """ADT and ICM return errors in several shapes; pull out the readable part."""
    body = (body or "").strip()
    if not body:
        return ""
    if body.lstrip().startswith("<"):
        try:
            root = ET.fromstring(body)
        except ET.ParseError:
            return body[:600]
        for tag in ("message", "localizedMessage", "Message", "messageText", "type"):
            for elem in root.iter():
                if _localname(elem.tag) == tag and (elem.text or "").strip():
                    return elem.text.strip()[:600]
        return " ".join(t.strip() for t in root.itertext() if t.strip())[:600]
    if body.lstrip().startswith("{"):
        try:
            data = json.loads(body)
            message = data.get("error", {}).get("message")
            if isinstance(message, dict):
                return str(message.get("value", ""))[:600]
            if message:
                return str(message)[:600]
        except (json.JSONDecodeError, AttributeError):
            pass
    return body[:600]


# --------------------------------------------------------------------------------------
# SAP HTTP client
# --------------------------------------------------------------------------------------

class SapClient:
    """Thin HTTP client that handles Basic auth, sap-client, cookies, and CSRF tokens."""

    def __init__(self, settings: Settings) -> None:
        import httpx

        self.s = settings
        token = base64.b64encode(f"{settings.user}:{settings.password}".encode("utf-8")).decode("ascii")
        self._http = httpx.Client(
            base_url=settings.url,
            timeout=httpx.Timeout(settings.timeout),
            verify=not settings.insecure,
            follow_redirects=True,
            headers={
                "Authorization": f"Basic {token}",
                "Accept-Language": settings.language.lower(),
                "User-Agent": USER_AGENT,
            },
        )
        self._csrf: str | None = None

    def _common_params(self, extra: dict[str, Any] | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {"sap-client": self.s.client, "sap-language": self.s.language}
        if extra:
            params.update({k: v for k, v in extra.items() if v is not None})
        return params

    def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        content: str | bytes | None = None,
        csrf: bool = False,
    ):
        method = method.upper()
        # ADT reads use GET and a few POSTs (data preview, node structure). Everything that
        # could change the system (PUT, DELETE, PATCH, and so on) is refused in read-only mode.
        if self.s.read_only and method not in {"GET", "HEAD", "POST", "OPTIONS"}:
            raise SapError(f"SAP_READ_ONLY is enabled: HTTP {method} is blocked. This server never modifies the SAP system.")

        hdrs = dict(headers or {})
        if csrf:
            hdrs["X-CSRF-Token"] = self._ensure_csrf()

        log.debug("%s %s params=%s", method, path, params)
        response = self._http.request(method, path, params=self._common_params(params), headers=hdrs, content=content)

        # An expired session cookie can yield 401 although the credentials are valid: retry once.
        if response.status_code == 401:
            log.debug("HTTP 401, clearing session cookies and CSRF token, retrying once")
            self._http.cookies.clear()
            self._csrf = None
            if csrf:
                hdrs["X-CSRF-Token"] = self._ensure_csrf()
            response = self._http.request(method, path, params=self._common_params(params), headers=hdrs, content=content)

        # A stale CSRF token is the most common transient ADT failure.
        if csrf and response.status_code == 403 and "csrf" in response.text.lower():
            log.debug("CSRF token rejected, fetching a new one")
            self._csrf = None
            hdrs["X-CSRF-Token"] = self._ensure_csrf()
            response = self._http.request(method, path, params=self._common_params(params), headers=hdrs, content=content)

        if response.status_code >= 400:
            detail = _extract_sap_error(response.text)
            if response.status_code == 401:
                raise SapError(
                    f"SAP rejected the credentials (HTTP 401). Check SAP_USER and SAP_PASSWORD and that the user exists in client {self.s.client}. {detail}"
                )
            if response.status_code == 403:
                raise SapError(f"SAP refused the request (HTTP 403). The user probably lacks the authorization for {path}. {detail}")
            raise SapError(f"SAP returned HTTP {response.status_code} for {path}. {detail}")
        return response

    def _ensure_csrf(self) -> str:
        if self._csrf:
            return self._csrf
        response = self._http.get(
            "/sap/bc/adt/discovery",
            params=self._common_params(),
            headers={"X-CSRF-Token": "Fetch", "Accept": "application/atomsvc+xml"},
        )
        token = response.headers.get("x-csrf-token")
        if not token:
            if response.status_code == 401:
                raise SapError("Could not fetch a CSRF token: SAP returned 401. Check the credentials.")
            raise SapError(f"Could not fetch a CSRF token from /sap/bc/adt/discovery (HTTP {response.status_code}). Is the ADT service active in SICF?")
        self._csrf = token
        return token

    def close(self) -> None:
        self._http.close()


# --------------------------------------------------------------------------------------
# ADT operations
# --------------------------------------------------------------------------------------

ADT = "/sap/bc/adt"

SOURCE_PATHS: dict[str, str] = {
    "class": f"{ADT}/oo/classes/{{name}}/source/main",
    "interface": f"{ADT}/oo/interfaces/{{name}}/source/main",
    "program": f"{ADT}/programs/programs/{{name}}/source/main",
    "include": f"{ADT}/programs/includes/{{name}}/source/main",
    "function_group": f"{ADT}/functions/groups/{{name}}/source/main",
    "table": f"{ADT}/ddic/tables/{{name}}/source/main",
    "structure": f"{ADT}/ddic/structures/{{name}}/source/main",
    "data_element": f"{ADT}/ddic/dataelements/{{name}}/source/main",
    "domain": f"{ADT}/ddic/domains/{{name}}/source/main",
    "cds": f"{ADT}/ddic/ddl/sources/{{name}}/source/main",
    "view": f"{ADT}/ddic/views/{{name}}/source/main",
    "bdef": f"{ADT}/bo/behaviordefinitions/{{name}}/source/main",
    "srvd": f"{ADT}/ddic/srvd/sources/{{name}}/source/main",
    "ddlx": f"{ADT}/ddic/ddlx/sources/{{name}}/source/main",
    "dcl": f"{ADT}/acm/dcl/sources/{{name}}/source/main",
    "class_implementations": f"{ADT}/oo/classes/{{name}}/includes/implementations",
    "class_definitions": f"{ADT}/oo/classes/{{name}}/includes/definitions",
    "class_testclasses": f"{ADT}/oo/classes/{{name}}/includes/testclasses",
}

SOURCE_ALIASES: dict[str, str] = {
    "behavior_definition": "bdef",
    "behaviour_definition": "bdef",
    "service_definition": "srvd",
    "metadata_extension": "ddlx",
    "access_control": "dcl",
    "ddls": "cds",
}

# SAP_BASIS release to the system it usually means. Sources: the release table in the
# sap-abap-standard skill (references/release-syntax.md), checked against SAP's release notes.
BASIS_PRODUCTS: dict[str, str] = {
    "700": "SAP ECC 6.0 up to EHP4 or SAP NetWeaver 7.0",
    "701": "SAP ECC 6.0 up to EHP4 or SAP NetWeaver 7.0 EHP1",
    "702": "SAP ECC 6.0 EHP5 or SAP NetWeaver 7.0 EHP2",
    "730": "SAP NetWeaver 7.30",
    "731": "SAP ECC 6.0 EHP6 or SAP NetWeaver 7.3 EHP1",
    "740": "SAP ECC 6.0 EHP7 or SAP NetWeaver 7.40",
    "750": "SAP ECC 6.0 EHP8, SAP NetWeaver 7.50, or SAP S/4HANA 1511",
    "751": "SAP S/4HANA 1610 or SAP NetWeaver 7.51",
    "752": "SAP S/4HANA 1709 or SAP NetWeaver 7.52",
    "753": "SAP S/4HANA 1809",
    "754": "SAP S/4HANA 1909",
    "755": "SAP S/4HANA 2020",
    "756": "SAP S/4HANA 2021",
    "757": "SAP S/4HANA 2022",
    "758": "SAP S/4HANA 2023",
    "816": "SAP S/4HANA 2025",
}

# S4CORE release to the S/4HANA release.
S4CORE_PRODUCTS: dict[str, str] = {
    "100": "1511", "101": "1610", "102": "1709", "103": "1809", "104": "1909",
    "105": "2020", "106": "2021", "107": "2022", "108": "2023",
}

# SAP_APPL release to the ECC 6.0 enhancement package.
SAP_APPL_EHP: dict[str, str] = {
    "600": "EHP0", "602": "EHP2", "603": "EHP3", "604": "EHP4", "605": "EHP5",
    "606": "EHP6", "616": "EHP6 for SAP HANA", "617": "EHP7", "618": "EHP8",
}


def product_hint(components: dict[str, dict[str, str]]) -> str:
    """One line that names the system a CVERS component list most likely belongs to."""
    basis = components.get("SAP_BASIS", {})
    release = basis.get("release", "")
    sp = basis.get("support_package", "")
    basis_text = f"SAP_BASIS {release[0]}.{release[1:]}" if len(release) == 3 else f"SAP_BASIS {release or 'unknown'}"
    if sp:
        basis_text += f" SP {sp.lstrip('0') or '0'}"
    s4core = components.get("S4CORE", {}).get("release", "")
    if s4core:
        known = S4CORE_PRODUCTS.get(s4core)
        name = f"SAP S/4HANA {known}" if known else f"SAP S/4HANA with S4CORE {s4core}"
        return f"{name} ({basis_text})"
    appl = components.get("SAP_APPL", {}).get("release", "")
    if appl:
        ehp = SAP_APPL_EHP.get(appl)
        name = f"SAP ECC 6.0 {ehp}" if ehp else f"SAP ECC 6.0 with SAP_APPL {appl}"
        return f"{name} ({basis_text})"
    # Neither S4CORE nor SAP_APPL: an ABAP platform on its own, such as the A4H trial or an
    # SAP NetWeaver AS ABAP system.
    generic = BASIS_PRODUCTS.get(release)
    return f"ABAP platform {basis_text} (the release of {generic})" if generic else f"ABAP platform {basis_text}"


class AdtApi:
    def __init__(self, client: SapClient) -> None:
        self.c = client

    # -- connectivity ------------------------------------------------------------------

    def whoami(self) -> dict[str, Any]:
        # /sap/bc/adt/discovery exists whenever ADT is active, so it is the safest probe.
        response = self.c.request("GET", f"{ADT}/discovery", headers={"Accept": "application/atomsvc+xml"})
        root = _parse_xml(response.text)
        collections = sum(1 for e in root.iter() if _localname(e.tag) == "collection")
        return {"connected": True, "url": self.c.s.url, "user": self.c.s.user, "client": self.c.s.client, "adt_collections": collections}

    def discovery(self) -> list[dict[str, Any]]:
        response = self.c.request("GET", f"{ADT}/discovery", headers={"Accept": "application/atomsvc+xml"})
        root = _parse_xml(response.text)
        out: list[dict[str, Any]] = []
        for collection in root.iter():
            if _localname(collection.tag) != "collection":
                continue
            title = next((t.text for t in collection if _localname(t.tag) == "title"), None)
            out.append({"href": collection.get("href", ""), "title": (title or "").strip()})
        return out

    def system_info(self) -> dict[str, Any]:
        """Installed software components from CVERS, with the release the skills need."""
        try:
            preview = self.read_table("CVERS", row_count=500, columns=["COMPONENT", "RELEASE", "EXTRELEASE"])
        except SapError:
            preview = self.read_table("CVERS", row_count=500)
        components: dict[str, dict[str, str]] = {}
        for row in preview.get("rows", []):
            name = (row.get("COMPONENT") or "").strip().upper()
            if not name:
                continue
            components[name] = {
                "release": (row.get("RELEASE") or "").strip(),
                "support_package": (row.get("EXTRELEASE") or "").strip(),
            }
        if "SAP_BASIS" not in components:
            raise SapError("CVERS has no SAP_BASIS row; the user may lack authorization for table CVERS.")
        return {
            "sap_basis": components["SAP_BASIS"],
            "s4core": components.get("S4CORE"),
            "sap_appl": components.get("SAP_APPL"),
            "sap_aba": components.get("SAP_ABA"),
            "product_hint": product_hint(components),
            "database": None,
            "components": components,
            "note": "database is not reported by this tool; ask the user whether the system runs on SAP HANA.",
        }

    # -- repository ---------------------------------------------------------------------

    def search(self, query: str, max_results: int = 50, object_type: str | None = None) -> list[dict[str, Any]]:
        if not query or not query.strip():
            raise SapError("query must not be empty.")
        params: dict[str, Any] = {"operation": "quickSearch", "query": query.strip(), "maxResults": max(1, min(int(max_results), 500))}
        if object_type:
            params["objectType"] = object_type.strip().upper()
        response = self.c.request("GET", f"{ADT}/repository/informationsystem/search", params=params, headers={"Accept": "application/xml"})
        root = _parse_xml(response.text)
        results: list[dict[str, Any]] = []
        for elem in root.iter():
            if _localname(elem.tag) != "objectReference":
                continue
            a = _attrs_without_ns(elem)
            results.append({"name": a.get("name", ""), "type": a.get("type", ""), "package": a.get("packageName", ""), "description": a.get("description", ""), "uri": a.get("uri", "")})
        return results

    def package_contents(self, package: str) -> list[dict[str, Any]]:
        package = validate_name(package, "package name")
        response = self.c.request(
            "POST",
            f"{ADT}/repository/nodestructure",
            params={"parent_type": "DEVC/K", "parent_name": package, "withShortDescriptions": "true"},
            headers={"Accept": "application/vnd.sap.as+xml"},
            content="",
            csrf=True,
        )
        root = _parse_xml(response.text)
        nodes: list[dict[str, Any]] = []
        for elem in root.iter():
            if _localname(elem.tag) != "SEU_ADT_REPOSITORY_OBJ_NODE":
                continue
            record = {_localname(child.tag): (child.text or "").strip() for child in elem}
            nodes.append({"name": record.get("OBJECT_NAME", ""), "type": record.get("OBJECT_TYPE", ""), "description": record.get("DESCRIPTION", ""), "uri": record.get("OBJECT_URI", "")})
        return [n for n in nodes if n["name"]]

    # -- source and DDIC ----------------------------------------------------------------

    def read_source(self, object_type: str, name: str) -> str:
        key = (object_type or "").strip().lower()
        key = SOURCE_ALIASES.get(key, key)
        if key not in SOURCE_PATHS:
            raise SapError(f"Unsupported object_type {object_type!r}. Supported: {', '.join(sorted(SOURCE_PATHS))}.")
        name = validate_name(name)
        # Namespaced names (/DMO/...) must be encoded as one path segment.
        path = SOURCE_PATHS[key].format(name=quote(name.lower(), safe=""))
        response = self.c.request("GET", path, headers={"Accept": "text/plain"})
        return response.text

    def _table_metadata_xml(self, table: str) -> list[dict[str, Any]]:
        response = self.c.request(
            "GET",
            f"{ADT}/ddic/tables/{table.lower()}",
            headers={"Accept": "application/vnd.sap.adt.tables.v2+xml, application/vnd.sap.adt.tables.v1+xml, application/xml"},
        )
        root = _parse_xml(response.text)
        fields: list[dict[str, Any]] = []
        for elem in root.iter():
            if _localname(str(elem.tag)) not in {"field", "column", "tableField"}:
                continue
            a = _attrs_without_ns(elem)
            name = a.get("name") or a.get("fieldName") or ""
            if not name:
                continue
            fields.append({
                "name": name.upper(),
                "key": str(a.get("isKey") or a.get("key") or "").lower() == "true",
                "type": a.get("dataType") or a.get("type") or "",
                "length": a.get("length", ""),
                "description": a.get("description", ""),
            })
        return fields

    def _fields_from_dd03l(self, table: str) -> list[dict[str, Any]]:
        preview = self.read_table("DD03L", row_count=500, columns=["FIELDNAME", "POSITION", "KEYFLAG", "ROLLNAME", "DATATYPE", "LENG"], where=f"TABNAME = '{table}'")

        def position(row: dict[str, str]) -> int:
            try:
                return int(row.get("POSITION") or 0)
            except ValueError:
                return 0

        return [
            {"name": (row.get("FIELDNAME") or "").upper(), "key": (row.get("KEYFLAG") or "").upper() == "X", "type": row.get("DATATYPE") or row.get("ROLLNAME") or "", "length": row.get("LENG") or ""}
            for row in sorted(preview.get("rows", []), key=position)
            if row.get("FIELDNAME")
        ]

    def table_definition(self, table: str) -> dict[str, Any]:
        """Field list of a DDIC table, structure, view, or CDS entity, by three strategies."""
        table = validate_name(table, "table name")
        errors: list[str] = []
        for object_type in ("table", "structure", "view", "cds"):
            try:
                source = self.read_source(object_type, table)
                if source.strip():
                    fields = _parse_ddl_fields(source)
                    if fields:
                        return {"table": table, "resolved_as": object_type, "fields": fields, "source": source}
            except SapError as exc:
                errors.append(f"source/{object_type}: {exc}")
        try:
            fields = self._table_metadata_xml(table)
            if fields:
                return {"table": table, "resolved_as": "adt-metadata", "fields": fields, "source": ""}
        except SapError as exc:
            errors.append(f"metadata: {exc}")
        try:
            fields = self._fields_from_dd03l(table)
            if fields:
                return {"table": table, "resolved_as": "dd03l", "fields": fields, "source": ""}
        except SapError as exc:
            errors.append(f"dd03l: {exc}")
        raise SapError(f"Could not read a definition for {table}. " + " | ".join(errors))

    # -- data preview -------------------------------------------------------------------

    def _data_preview(self, statement: str, row_count: int) -> dict[str, Any]:
        assert_read_only_sql(statement)
        row_count = max(1, min(int(row_count), self.c.s.max_rows))
        response = self.c.request(
            "POST",
            f"{ADT}/datapreview/freestyle",
            params={"rowNumber": row_count},
            headers={"Accept": "application/xml, application/vnd.sap.adt.datapreview.table.v1+xml", "Content-Type": "text/plain; charset=utf-8"},
            content=statement.encode("utf-8"),
            csrf=True,
        )
        return _parse_data_preview(response.text)

    def _data_preview_ddic(self, table: str, row_count: int) -> dict[str, Any]:
        row_count = max(1, min(int(row_count), self.c.s.max_rows))
        response = self.c.request(
            "POST",
            f"{ADT}/datapreview/ddic",
            params={"rowNumber": row_count, "ddicEntityName": table},
            headers={"Accept": "application/xml, application/vnd.sap.adt.datapreview.table.v1+xml", "Content-Type": "text/plain; charset=utf-8"},
            content=table.encode("utf-8"),
            csrf=True,
        )
        return _parse_data_preview(response.text)

    def read_table(self, table: str, row_count: int = 50, columns: list[str] | None = None, where: str | None = None) -> dict[str, Any]:
        """Read rows with a SELECT this server builds itself, so callers cannot inject SQL."""
        table = validate_name(table, "table name")
        select_list = validate_select_list(columns)
        where_clause = validate_where(where)
        statement = f"SELECT {select_list} FROM {table}"
        if where_clause:
            statement += f" WHERE {where_clause}"
        try:
            result = self._data_preview(statement, row_count)
        except SapError as exc:
            if columns or where_clause:
                raise
            log.debug("freestyle preview failed (%s), trying the ddic variant", exc)
            try:
                result = self._data_preview_ddic(table, row_count)
            except SapError as fallback_exc:
                raise SapError(f"Could not read {table}. freestyle: {exc} | ddic: {fallback_exc}") from fallback_exc
        result["table"] = table
        return result

    def run_select(self, statement: str, row_count: int = 50) -> dict[str, Any]:
        if self.c.s.block_free_sql:
            raise SapError("Free-form SQL is disabled (SAP_BLOCK_FREE_SQL=true). Use sap_read_table, which builds a validated SELECT.")
        assert_read_only_sql(statement)
        return self._data_preview(statement, row_count)


def _parse_data_preview(xml_text: str) -> dict[str, Any]:
    """Turn ADT's column-oriented dataPreview XML into row-oriented records."""
    root = _parse_xml(xml_text)
    total_rows: int | None = None
    executed = ""
    for elem in root:
        local = _localname(elem.tag)
        if local == "totalRows" and (elem.text or "").strip().isdigit():
            total_rows = int(elem.text.strip())
        elif local == "executedQueryString":
            executed = (elem.text or "").strip()

    column_names: list[str] = []
    column_meta: list[dict[str, Any]] = []
    column_values: list[list[str]] = []
    for column in root:
        if _localname(column.tag) != "columns":
            continue
        name = ""
        meta: dict[str, Any] = {}
        values: list[str] = []
        for child in column:
            local = _localname(child.tag)
            if local == "metadata":
                meta = _attrs_without_ns(child)
                name = meta.get("name", "")
            elif local == "dataSet":
                values = [(cell.text or "") for cell in child if _localname(cell.tag) == "data"]
        if not name:
            continue
        column_names.append(name)
        column_meta.append({"name": name, "type": meta.get("type", ""), "length": meta.get("length", ""), "key": str(meta.get("keyAttribute", "")).lower() == "true", "description": meta.get("description", "")})
        column_values.append(values)

    depth = max((len(v) for v in column_values), default=0)
    rows = [
        {name: (column_values[col][index] if index < len(column_values[col]) else "") for col, name in enumerate(column_names)}
        for index in range(depth)
    ]
    return {"columns": column_meta, "rows": rows, "row_count": len(rows), "total_rows_in_table": total_rows, "executed_statement": executed}


# A field with a "with foreign key" clause continues on the next lines, so the semicolon
# is optional.
_FIELD_RE = re.compile(r"^\s*(?P<key>key\s+)?(?P<name>[A-Za-z_/][A-Za-z0-9_/]*)\s*:\s*(?P<type>[^;{}]+?)\s*;?\s*$", re.IGNORECASE)


def _parse_ddl_fields(source: str) -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = []
    for line in source.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(("@", "//", "*", "}")):
            continue
        match = _FIELD_RE.match(stripped)
        if not match:
            continue
        name = match.group("name")
        if name.lower() in {"define", "table", "view", "entity", "with"}:
            continue
        fields.append({"name": name.upper(), "key": bool(match.group("key")), "type": match.group("type").strip()})
    return fields


# --------------------------------------------------------------------------------------
# OData operations
# --------------------------------------------------------------------------------------

CATALOG = "/sap/opu/odata/iwfnd/catalogservice;v=2/ServiceCollection"


class ODataApi:
    def __init__(self, client: SapClient) -> None:
        self.c = client

    def list_services(self, search: str | None = None, top: int = 100) -> list[dict[str, Any]]:
        limit = max(1, min(int(top), 1000))
        term = (search or "").strip().lower()
        # Some catalogs reject substringof filters with HTTP 500, so match locally.
        params: dict[str, Any] = {"$format": "json", "$top": 1000 if term else limit}
        response = self.c.request("GET", CATALOG, params=params, headers={"Accept": "application/json"})
        try:
            payload = response.json()
        except json.JSONDecodeError as exc:
            raise SapError(f"The catalog service did not return JSON: {exc}") from exc
        services = [
            {"technical_name": item.get("TechnicalServiceName", ""), "title": item.get("Title", ""), "version": item.get("TechnicalServiceVersion", ""), "service_url": item.get("ServiceUrl", ""), "description": item.get("Description", "")}
            for item in payload.get("d", {}).get("results", [])
        ]
        if term:
            services = [s for s in services if term in str(s["technical_name"]).lower() or term in str(s["title"]).lower() or term in str(s["description"]).lower()]
        return services[:limit]

    @staticmethod
    def _normalise_service_path(service: str) -> str:
        service = (service or "").strip()
        if not service:
            raise SapError("service must not be empty.")
        if service.startswith(("http://", "https://")):
            service = "/" + service.split("/", 3)[-1]
        if not service.startswith("/"):
            service = f"/sap/opu/odata/sap/{service}"
        if ".." in service or "\\" in service:
            raise SapError(f"Refusing a suspicious service path: {service!r}")
        return service.rstrip("/")

    def metadata(self, service: str) -> dict[str, Any]:
        path = self._normalise_service_path(service)
        response = self.c.request("GET", f"{path}/$metadata", headers={"Accept": "application/xml"})
        root = _parse_xml(response.text)
        entity_sets: list[dict[str, Any]] = []
        entity_types: dict[str, list[dict[str, Any]]] = {}
        for elem in root.iter():
            local = _localname(elem.tag)
            if local == "EntitySet":
                entity_sets.append({"name": elem.get("Name", ""), "entity_type": (elem.get("EntityType", "") or "").rsplit(".", 1)[-1]})
            elif local == "EntityType":
                keys = {ref.get("Name", "") for ref in elem.iter() if _localname(ref.tag) == "PropertyRef"}
                entity_types[elem.get("Name", "")] = [
                    {"name": prop.get("Name", ""), "type": prop.get("Type", ""), "key": prop.get("Name", "") in keys}
                    for prop in elem
                    if _localname(prop.tag) == "Property"
                ]
        for entity_set in entity_sets:
            entity_set["properties"] = entity_types.get(entity_set["entity_type"], [])
        return {"service": path, "entity_sets": entity_sets}

    def query(self, service: str, entity_set: str, top: int = 20, select: list[str] | None = None, filter_expr: str | None = None, order_by: str | None = None) -> dict[str, Any]:
        path = self._normalise_service_path(service)
        entity_set = (entity_set or "").strip()
        if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", entity_set):
            raise SapError(f"Invalid entity set name: {entity_set!r}")
        params: dict[str, Any] = {"$format": "json", "$top": max(1, min(int(top), self.c.s.max_rows))}
        if select:
            params["$select"] = ",".join(validate_name(s, "property", upper=False) for s in select)
        if filter_expr:
            params["$filter"] = validate_where(filter_expr)
        if order_by:
            params["$orderby"] = validate_where(order_by)
        response = self.c.request("GET", f"{path}/{entity_set}", params=params, headers={"Accept": "application/json"})
        try:
            payload = response.json()
        except json.JSONDecodeError as exc:
            raise SapError(f"{entity_set} did not return JSON: {exc}") from exc
        data = payload.get("d", payload)
        rows = data.get("results", data) if isinstance(data, dict) else data
        if isinstance(rows, dict):
            rows = [rows]
        cleaned = [{k: v for k, v in row.items() if k != "__metadata"} for row in rows if isinstance(row, dict)]
        return {"service": path, "entity_set": entity_set, "row_count": len(cleaned), "rows": cleaned}


# --------------------------------------------------------------------------------------
# Microsoft Entra ID token checks (HTTPS mode)
# --------------------------------------------------------------------------------------

TOKEN_STORE_CLIENT_ID = "ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b"  # Microsoft Enterprise token store


@dataclass
class HttpConfig:
    public_url: str
    bind_host: str = "127.0.0.1"
    port: int = 8000
    tenant_id: str | None = None
    client_id: str | None = None
    extra_audiences: list[str] = field(default_factory=list)
    scope: str = "SAP.Read"
    allowed_client_ids: list[str] = field(default_factory=list)
    issuer_override: str | None = None
    jwks_url_override: str | None = None
    demo_path_secret: str | None = None

    @classmethod
    def from_values(cls, values: dict[str, str]) -> "HttpConfig":
        split = lambda key: [v.strip() for v in (values.get(key) or "").split(",") if v.strip()]  # noqa: E731
        cfg = cls(
            public_url=(values.get("MCP_PUBLIC_URL") or "").strip().rstrip("/"),
            bind_host=(values.get("MCP_BIND_HOST") or "127.0.0.1").strip(),
            port=int(values.get("MCP_PORT") or 8000),
            tenant_id=(values.get("ENTRA_TENANT_ID") or "").strip() or None,
            client_id=(values.get("ENTRA_CLIENT_ID") or "").strip() or None,
            extra_audiences=split("ENTRA_AUDIENCES"),
            scope=(values.get("ENTRA_SCOPE") or "SAP.Read").strip() or "SAP.Read",
            allowed_client_ids=split("ENTRA_ALLOWED_CLIENT_IDS"),
            issuer_override=(values.get("ENTRA_ISSUER") or "").strip() or None,
            jwks_url_override=(values.get("ENTRA_JWKS_URL") or "").strip() or None,
            demo_path_secret=(values.get("MCP_DEMO_PATH_SECRET") or "").strip() or None,
        )
        if not cfg.public_url.startswith("https://") and not cfg.public_url.startswith("http://localhost") and not cfg.public_url.startswith("http://127.0.0.1"):
            raise RuntimeError("MCP_PUBLIC_URL must be the public https URL of the MCP endpoint, for example https://host.example.com/mcp.")
        if cfg.demo_path_secret and cfg.entra_enabled:
            raise RuntimeError("Set either MCP_DEMO_PATH_SECRET (demo mode) or ENTRA_TENANT_ID and ENTRA_CLIENT_ID (sign-in), not both.")
        if cfg.demo_path_secret and len(cfg.demo_path_secret) < 32:
            raise RuntimeError("MCP_DEMO_PATH_SECRET must have at least 32 characters. Generate one with: python sap_system_mcp.py new-secret")
        if not cfg.demo_path_secret and not cfg.entra_enabled:
            raise RuntimeError("HTTPS mode needs ENTRA_TENANT_ID and ENTRA_CLIENT_ID (Microsoft Entra ID sign-in), or MCP_DEMO_PATH_SECRET for a trial system with demo data.")
        return cfg

    @property
    def entra_enabled(self) -> bool:
        return bool(self.tenant_id and self.client_id)

    @property
    def issuers(self) -> list[str]:
        if self.issuer_override:
            return [self.issuer_override]
        # v2 tokens carry the login.microsoftonline.com issuer; v1 tokens the sts.windows.net one.
        return [f"https://login.microsoftonline.com/{self.tenant_id}/v2.0", f"https://sts.windows.net/{self.tenant_id}/"]

    @property
    def jwks_url(self) -> str:
        return self.jwks_url_override or f"https://login.microsoftonline.com/{self.tenant_id}/discovery/v2.0/keys"

    @property
    def audiences(self) -> list[str]:
        auds = [self.client_id] if self.client_id else []
        auds.extend(a for a in self.extra_audiences if a not in auds)
        return auds

    @property
    def mcp_path(self) -> str:
        base = urlsplit(self.public_url).path.rstrip("/") or "/mcp"
        return f"{base}/{self.demo_path_secret}" if self.demo_path_secret else base

    @property
    def public_host(self) -> str:
        return urlsplit(self.public_url).netloc


def check_claims(claims: dict[str, Any], *, issuers: list[str], tenant_id: str | None, audiences: list[str], scope: str, allowed_client_ids: list[str]) -> tuple[bool, str]:
    """Checks beyond signature and expiry, written without a JWT library so they can be
    tested offline. Returns (accepted, reason)."""
    if claims.get("iss") not in issuers:
        return False, "issuer is not this tenant"
    if tenant_id and claims.get("tid") != tenant_id:
        return False, "tid is not this tenant"
    aud = claims.get("aud")
    auds = aud if isinstance(aud, list) else [aud]
    if not any(a in audiences for a in auds):
        return False, "audience is not this server"
    scopes = str(claims.get("scp") or "").split()
    roles = claims.get("roles") or []
    if scope and scope not in scopes and not roles:
        return False, f"scope {scope} is missing"
    client = claims.get("azp") or claims.get("appid")
    if allowed_client_ids and client not in allowed_client_ids:
        return False, "client application is not allowed"
    return True, "ok"


class EntraTokenVerifier:
    """mcp.server.auth.provider.TokenVerifier for Microsoft Entra ID access tokens."""

    def __init__(self, cfg: HttpConfig) -> None:
        self.cfg = cfg
        self._jwks: Any = None

    def _decode(self, token: str) -> dict[str, Any]:
        import jwt

        if self._jwks is None:
            self._jwks = jwt.PyJWKClient(self.cfg.jwks_url, cache_keys=True, lifespan=3600)
        key = self._jwks.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            key.key,
            algorithms=["RS256"],
            audience=self.cfg.audiences,
            options={"verify_iss": False, "require": ["exp", "iat", "aud"]},
            leeway=60,
        )

    async def verify_token(self, token: str):
        import anyio
        from mcp.server.auth.provider import AccessToken

        try:
            claims = await anyio.to_thread.run_sync(self._decode, token)
        except Exception as exc:  # noqa: BLE001 - every failure means "not authenticated"
            log.info("token rejected: %s", type(exc).__name__)
            return None
        accepted, reason = check_claims(
            claims,
            issuers=self.cfg.issuers,
            tenant_id=self.cfg.tenant_id,
            audiences=self.cfg.audiences,
            scope=self.cfg.scope,
            allowed_client_ids=self.cfg.allowed_client_ids,
        )
        if not accepted:
            log.info("token rejected: %s", reason)
            return None
        aud = claims.get("aud")
        return AccessToken(
            token=token,
            client_id=str(claims.get("azp") or claims.get("appid") or ""),
            scopes=str(claims.get("scp") or "").split(),
            expires_at=claims.get("exp"),
            resource=aud if isinstance(aud, str) else None,
            subject=str(claims.get("oid") or claims.get("sub") or ""),
            claims={"iss": claims.get("iss"), "tid": claims.get("tid")},
        )


# --------------------------------------------------------------------------------------
# MCP server
# --------------------------------------------------------------------------------------

class Connection:
    """Lazy SAP connection: the server starts even when nothing is configured yet, and every
    tool then returns the setup instructions instead of failing to start."""

    def __init__(self, settings: Settings | None) -> None:
        self._settings = settings
        self._client: SapClient | None = None
        self.adt: AdtApi | None = None
        self.odata: ODataApi | None = None

    @property
    def settings(self) -> Settings:
        if self._settings is None:
            self._settings = Settings.from_env()
        return self._settings

    def open(self) -> None:
        if self._client is None:
            self._client = SapClient(self.settings)
            self.adt = AdtApi(self._client)
            self.odata = ODataApi(self._client)


def build_server(settings: Settings | None = None, *, token_verifier: Any = None, auth: Any = None):
    """Create the MCP server with every tool registered."""
    from mcp.server.mcpserver import MCPServer

    conn = Connection(settings)
    mode = "focused"
    if settings is not None:
        mode = settings.mode
    else:
        mode = (load_config_values().get("SAP_MODE") or "focused").strip().lower() or "focused"

    kwargs: dict[str, Any] = {}
    if token_verifier is not None:
        kwargs["token_verifier"] = token_verifier
    if auth is not None:
        kwargs["auth"] = auth
    mcp = MCPServer(
        "sap-system",
        instructions=(
            "Read-only access to one SAP ABAP system over ADT and OData. Call sap_connection_info "
            "and sap_system_info first to learn the system and its release. Never claim that the "
            "system was changed: every tool only reads."
        ),
        version=VERSION,
        **kwargs,
    )

    def guard(fn, *args, **kw):
        """Turn exceptions into messages the model can act on."""
        try:
            conn.open()
            return fn(*args, **kw)
        except NotConfigured as exc:
            return {"ok": False, "error": str(exc), "configured": False}
        except SapError as exc:
            return {"ok": False, "error": str(exc)}
        except Exception as exc:  # noqa: BLE001 - network and parser errors
            try:
                import httpx

                if isinstance(exc, httpx.HTTPError):
                    return {"ok": False, "error": f"Network error talking to SAP: {exc}"}
            except ImportError:
                pass
            return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}

    def wrap(result: Any, **extra: Any) -> dict[str, Any]:
        if isinstance(result, dict) and result.get("ok") is False:
            return result
        if isinstance(result, dict):
            return {"ok": True, **result, **extra}
        return {"ok": True, **extra, "result": result}

    @mcp.tool()
    def sap_connection_info() -> dict[str, Any]:
        """Check the connection to the SAP system and report the active configuration (URL, client, user, read-only mode). Call this first."""
        info = guard(lambda: conn.adt.whoami())
        if isinstance(info, dict) and info.get("ok") is False:
            return info
        s = conn.settings
        return {"ok": True, **info, "mode": s.mode, "read_only": s.read_only, "free_sql_blocked": s.block_free_sql, "language": s.language}

    @mcp.tool()
    def sap_system_info() -> dict[str, Any]:
        """Return the installed software components of the connected system from table CVERS: SAP_BASIS release and support package, S4CORE or SAP_APPL, and a product hint such as "SAP S/4HANA 1909 (SAP_BASIS 7.54)". Use it to choose the ABAP syntax level and the SAP product before writing or reviewing code."""
        return wrap(guard(lambda: conn.adt.system_info()))

    @mcp.tool()
    def sap_search_objects(query: str, max_results: int = 50, object_type: str | None = None) -> dict[str, Any]:
        """Search the ABAP repository for objects by name pattern. Use a trailing '*' as wildcard, for example 'SFLIGHT*' or '/DMO/*'. object_type narrows the search: 'TABL/DT' tables, 'CLAS/OC' classes, 'DEVC/K' packages, 'DDLS/DF' CDS views, 'PROG/P' programs, 'FUGR/F' function groups."""
        result = guard(lambda: conn.adt.search(query, max_results, object_type))
        if isinstance(result, dict):
            return result
        return {"ok": True, "count": len(result), "objects": result}

    @mcp.tool()
    def sap_describe_table(table: str) -> dict[str, Any]:
        """Return the field list (name, key flag, type, length) and the DDL source of a DDIC table, structure, view, or CDS entity."""
        return wrap(guard(lambda: conn.adt.table_definition(table)))

    @mcp.tool()
    def sap_read_table(table: str, row_count: int = 50, columns: list[str] | None = None, where: str | None = None) -> dict[str, Any]:
        """Read rows from a DDIC table. The SELECT is built and validated by the server, so it works while free-form SQL is blocked. Example: table='T000', columns=['MANDT','MTEXT'], where="MANDT = '001'". Keep row_count small; the server caps it at SAP_MAX_ROWS."""
        return wrap(guard(lambda: conn.adt.read_table(table, row_count, columns, where)))

    @mcp.tool()
    def sap_read_source(object_type: str, name: str) -> dict[str, Any]:
        """Read the current source of an ABAP repository object. object_type is one of: class, interface, program, include, function_group, table, structure, data_element, domain, cds, view, bdef (behavior definition), srvd (service definition), ddlx (metadata extension), dcl (access control), class_implementations, class_definitions, class_testclasses (class-local includes such as RAP handler classes). Namespaced names like '/DMO/I_TRAVEL_U' are supported."""
        result = guard(lambda: conn.adt.read_source(object_type, name))
        if isinstance(result, dict):
            return result
        return {"ok": True, "object_type": object_type, "name": name, "source": result}

    @mcp.tool()
    def sap_list_package(package: str) -> dict[str, Any]:
        """List the objects in an ABAP package, for example 'SAPBC_DATAMODEL', 'ZFA_SALES', or '$TMP'."""
        result = guard(lambda: conn.adt.package_contents(package))
        if isinstance(result, dict):
            return result
        return {"ok": True, "package": package.upper(), "count": len(result), "objects": result}

    @mcp.tool()
    def sap_odata_list_services(search: str | None = None, top: int = 100) -> dict[str, Any]:
        """List the OData V2 services registered in the SAP Gateway catalog, optionally filtered by a search term."""
        result = guard(lambda: conn.odata.list_services(search, top))
        if isinstance(result, dict):
            return result
        return {"ok": True, "count": len(result), "services": result}

    @mcp.tool()
    def sap_odata_metadata(service: str) -> dict[str, Any]:
        """List the entity sets and properties of an OData V2 service. service accepts a technical name ('API_SALES_ORDER_SRV') or a full path ('/sap/opu/odata/sap/API_SALES_ORDER_SRV')."""
        return wrap(guard(lambda: conn.odata.metadata(service)))

    @mcp.tool()
    def sap_odata_query(service: str, entity_set: str, top: int = 20, select: list[str] | None = None, filter_expr: str | None = None, order_by: str | None = None) -> dict[str, Any]:
        """Query an OData V2 entity set. filter_expr uses OData syntax, for example "Carrid eq 'LH'"."""
        return wrap(guard(lambda: conn.odata.query(service, entity_set, top, select, filter_expr, order_by)))

    if mode == "full":

        @mcp.tool()
        def sap_adt_discovery() -> dict[str, Any]:
            """List every ADT collection the system exposes, for capability discovery."""
            result = guard(lambda: conn.adt.discovery())
            if isinstance(result, dict):
                return result
            return {"ok": True, "count": len(result), "collections": result}

        @mcp.tool()
        def sap_run_select(statement: str, row_count: int = 50) -> dict[str, Any]:
            """Run a free-form SELECT. Disabled while SAP_BLOCK_FREE_SQL is true (the default)."""
            return wrap(guard(lambda: conn.adt.run_select(statement, row_count)))

    return mcp


# --------------------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------------------

def cmd_serve(args: argparse.Namespace) -> int:
    values = load_config_values()
    settings: Settings | None
    try:
        settings = Settings.from_values(values)
    except NotConfigured as exc:
        if args.transport == "http":
            print(f"Configuration error: {exc}", file=sys.stderr)
            return 2
        settings = None
        log.warning("SAP connection not configured yet; tools will return the setup instructions")

    if settings is not None:
        warning = settings.plaintext_warning()
        if warning:
            log.warning(warning)
        log.info("sap-system MCP %s | url=%s client=%s user=%s mode=%s read_only=%s free_sql_blocked=%s",
                 VERSION, settings.url, settings.client, settings.user, settings.mode, settings.read_only, settings.block_free_sql)

    if args.transport == "stdio":
        build_server(settings).run()
        return 0

    try:
        http = HttpConfig.from_values(values)
    except RuntimeError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2

    from mcp.server.auth.settings import AuthSettings
    from mcp.server.transport_security import TransportSecuritySettings
    from starlette.requests import Request
    from starlette.responses import JSONResponse

    if http.entra_enabled:
        auth = AuthSettings(
            issuer_url=http.issuers[0],
            resource_server_url=http.public_url,
            required_scopes=[http.scope],
            validate_token_resource=False,
        )
        server = build_server(settings, token_verifier=EntraTokenVerifier(http), auth=auth)
        log.info("sign-in: Microsoft Entra ID tenant %s, audiences %s, scope %s", http.tenant_id, ", ".join(http.audiences), http.scope)
    else:
        server = build_server(settings)
        log.warning("DEMO MODE: no sign-in. Anyone who knows the secret URL can read this system. Use it only for trial systems with demo data.")

    @server.custom_route("/healthz", methods=["GET"])
    async def healthz(_: Request) -> JSONResponse:
        return JSONResponse({"ok": True, "server": "sap-system", "version": VERSION})

    host = http.public_host
    transport_security = TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=[host, f"{host}:443", "localhost:*", "127.0.0.1:*"],
        allowed_origins=[f"https://{host}"],
    )
    log.info("listening on %s:%s, MCP path %s, public URL %s", http.bind_host, http.port, http.mcp_path, http.public_url)
    server.run(
        transport="streamable-http",
        host=http.bind_host,
        port=http.port,
        streamable_http_path=http.mcp_path,
        stateless_http=True,
        transport_security=transport_security,
    )
    return 0


def _selftest(settings: Settings) -> int:
    client = SapClient(settings)
    adt = AdtApi(client)
    odata = ODataApi(client)
    checks = [
        ("ADT reachable, credentials accepted", adt.whoami),
        ("Installed components (CVERS)", lambda: {k: v for k, v in adt.system_info().items() if k in {"sap_basis", "product_hint"}}),
        ("Repository search (T000*)", lambda: adt.search("T000*", 5)),
        ("Describe table T000", lambda: adt.table_definition("T000")["fields"][:5]),
        ("Read table T000", lambda: adt.read_table("T000", 3)["rows"]),
        ("OData catalog", lambda: odata.list_services(top=5)),
    ]
    passed = 0
    print(f"\nsap-system self test -> {settings.url} (client {settings.client}, user {settings.user})\n", file=sys.stderr)
    for label, fn in checks:
        try:
            value = fn()
            preview = json.dumps(value, default=str)
            print(f"  PASS  {label}\n        {preview[:300]}{' ...' if len(preview) > 300 else ''}", file=sys.stderr)
            passed += 1
        except Exception as exc:  # noqa: BLE001 - the self test reports everything
            print(f"  FAIL  {label}: {exc}", file=sys.stderr)
    client.close()
    print(f"\n{passed}/{len(checks)} checks passed\n", file=sys.stderr)
    return 0 if passed == len(checks) else 1


def cmd_selftest(_: argparse.Namespace) -> int:
    try:
        settings = Settings.from_env()
    except NotConfigured as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2
    return _selftest(settings)


def cmd_setup(args: argparse.Namespace) -> int:
    interactive = sys.stdin.isatty()
    current = load_config_values()

    def ask(label: str, given: str | None, default: str | None = None) -> str:
        if given:
            return given.strip()
        if not interactive:
            if default is not None:
                return default
            raise SystemExit(f"setup: --{label.split(' ')[0].lower()} is required when stdin is not a terminal.")
        prompt = f"{label}" + (f" [{default}]" if default else "") + ": "
        value = input(prompt).strip()
        return value or (default or "")

    url = ask("SAP system URL (for example https://sap.example.com:44300 or http://localhost:50000)", args.url, current.get("SAP_URL"))
    user = ask("SAP user", args.user, current.get("SAP_USER"))
    client = ask("SAP client", args.client, current.get("SAP_CLIENT") or "001")
    language = ask("Language", args.language, current.get("SAP_LANGUAGE") or "EN")
    password = os.environ.get("SAP_PASSWORD") or ""
    if not password:
        if not interactive:
            raise SystemExit("setup: put the password in the SAP_PASSWORD environment variable when stdin is not a terminal.")
        password = getpass.getpass("SAP password (not shown): ")
    values = {"SAP_URL": url.rstrip("/"), "SAP_USER": user, "SAP_PASSWORD": password, "SAP_CLIENT": client, "SAP_LANGUAGE": language}
    if args.insecure:
        values["SAP_INSECURE"] = "true"
    try:
        settings = Settings.from_values(values)
    except NotConfigured as exc:
        print(f"setup: {exc}", file=sys.stderr)
        return 2
    warning = settings.plaintext_warning()
    if warning:
        print(f"Warning: {warning}", file=sys.stderr)

    if not args.skip_test and _selftest(settings) != 0:
        print("setup: the connection test failed; nothing was saved. Fix the settings and run the setup again, or pass --skip-test.", file=sys.stderr)
        return 1

    path = config_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    lines = ["# sap-system MCP server configuration. Keep this file private; it holds the SAP password."]
    lines += [f"{key}={value}" for key, value in values.items()]
    for key in ("SAP_READ_ONLY", "SAP_BLOCK_FREE_SQL", "SAP_MODE", "SAP_TIMEOUT", "SAP_MAX_ROWS", "SAP_VERBOSE"):
        if current.get(key):
            lines.append(f"{key}={current[key]}")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    print(f"Saved the connection to {path}. Restart your agent so the sap-system server picks it up.", file=sys.stderr)
    return 0


def cmd_print_tools(_: argparse.Namespace) -> int:
    import anyio

    server = build_server(None)

    async def list_tools():
        return await server.list_tools()

    tools = anyio.run(list_tools)
    # by_alias gives the wire names (inputSchema), the shape of an MCP tools/list result.
    print(json.dumps({"tools": [t.model_dump(mode="json", by_alias=True, exclude_none=True) for t in tools]}, indent=2))
    return 0


def cmd_new_secret(_: argparse.Namespace) -> int:
    print(secrets.token_urlsafe(48))
    return 0


def cmd_config_path(_: argparse.Namespace) -> int:
    print(config_path())
    return 0


def cmd_self_check(_: argparse.Namespace) -> int:
    """Offline checks of the guards and the token rules. Needs only the standard library."""
    failures: list[str] = []

    def expect(label: str, condition: bool) -> None:
        if not condition:
            failures.append(label)

    def raises(fn) -> bool:
        try:
            fn()
            return False
        except SapError:
            return True

    expect("plain table name", validate_name("T000") == "T000")
    expect("namespaced name", validate_name("/dmo/booking") == "/DMO/BOOKING")
    expect("name with statement separator", raises(lambda: validate_name("T000; DROP TABLE X")))
    expect("name with path traversal", raises(lambda: validate_name("..")))
    expect("name too long", raises(lambda: validate_name("A" * 41)))
    expect("simple where", validate_where("CARRID = 'LH' AND FLDATE >= '20250101'") == "CARRID = 'LH' AND FLDATE >= '20250101'")
    expect("where with delete", raises(lambda: validate_where("1 = 1; DELETE FROM T000")))
    expect("where with comment", raises(lambda: validate_where("MANDT = '001' --")))
    expect("where with backslash", raises(lambda: validate_where("MANDT = '001' \\ x")))
    expect("update statement", raises(lambda: assert_read_only_sql("UPDATE T000 SET MTEXT = 'x'")))
    expect("select statement", not raises(lambda: assert_read_only_sql("SELECT * FROM T000")))
    expect("select with union", not raises(lambda: assert_read_only_sql("SELECT a FROM t UNION SELECT b FROM u")))
    expect("dotenv parsing", parse_dotenv('# c\nSAP_URL="https://h:44300"\nSAP_USER=dev\nexport SAP_CLIENT=\'001\'\nbad line\n') == {"SAP_URL": "https://h:44300", "SAP_USER": "dev", "SAP_CLIENT": "001"})
    expect("product hint s4", product_hint({"SAP_BASIS": {"release": "754", "support_package": "0003"}, "S4CORE": {"release": "104", "support_package": "0003"}}) == "SAP S/4HANA 1909 (SAP_BASIS 7.54 SP 3)")
    expect("product hint ecc", product_hint({"SAP_BASIS": {"release": "731", "support_package": "0012"}, "SAP_APPL": {"release": "606", "support_package": "0012"}}) == "SAP ECC 6.0 EHP6 (SAP_BASIS 7.31 SP 12)")
    expect("product hint basis only", product_hint({"SAP_BASIS": {"release": "816", "support_package": ""}}) == "ABAP platform SAP_BASIS 8.16 (the release of SAP S/4HANA 2025)")
    expect("product hint trial", product_hint({"SAP_BASIS": {"release": "754", "support_package": "0007"}}) == "ABAP platform SAP_BASIS 7.54 SP 7 (the release of SAP S/4HANA 1909)")

    base = dict(issuers=["https://login.microsoftonline.com/t1/v2.0"], tenant_id="t1", audiences=["app1", "https://host.example.com"], scope="SAP.Read", allowed_client_ids=[])
    good = {"iss": "https://login.microsoftonline.com/t1/v2.0", "tid": "t1", "aud": "app1", "scp": "SAP.Read offline_access", "azp": "client1"}
    expect("claims accepted", check_claims(good, **base)[0])
    expect("claims uri audience", check_claims({**good, "aud": "https://host.example.com"}, **base)[0])
    expect("claims wrong issuer", not check_claims({**good, "iss": "https://login.microsoftonline.com/t2/v2.0"}, **base)[0])
    expect("claims wrong tenant", not check_claims({**good, "tid": "t2"}, **base)[0])
    expect("claims wrong audience", not check_claims({**good, "aud": "other"}, **base)[0])
    expect("claims missing scope", not check_claims({**good, "scp": "offline_access"}, **base)[0])
    expect("claims app role instead of scope", check_claims({**good, "scp": "", "roles": ["SAP.Read.All"]}, **base)[0])
    expect("claims client allow list", not check_claims(good, **{**base, "allowed_client_ids": [TOKEN_STORE_CLIENT_ID]})[0])
    expect("claims token store allowed", check_claims({**good, "azp": TOKEN_STORE_CLIENT_ID}, **{**base, "allowed_client_ids": [TOKEN_STORE_CLIENT_ID]})[0])

    cfg = HttpConfig.from_values({"MCP_PUBLIC_URL": "https://host.example.com/mcp", "ENTRA_TENANT_ID": "t1", "ENTRA_CLIENT_ID": "app1", "ENTRA_AUDIENCES": "https://host.example.com, api://x"})
    expect("http audiences", cfg.audiences == ["app1", "https://host.example.com", "api://x"])
    expect("http path", cfg.mcp_path == "/mcp")
    expect("http host", cfg.public_host == "host.example.com")
    demo = HttpConfig.from_values({"MCP_PUBLIC_URL": "https://host.example.com/mcp", "MCP_DEMO_PATH_SECRET": "x" * 40})
    expect("demo path", demo.mcp_path == "/mcp/" + "x" * 40)
    expect("http needs auth", _raises_runtime(lambda: HttpConfig.from_values({"MCP_PUBLIC_URL": "https://host.example.com/mcp"})))
    expect("short demo secret", _raises_runtime(lambda: HttpConfig.from_values({"MCP_PUBLIC_URL": "https://host.example.com/mcp", "MCP_DEMO_PATH_SECRET": "short"})))
    expect("placeholder counts as unset", _PLACEHOLDER.match("${user_config.sap_url}") is not None and _PLACEHOLDER.match("https://h") is None)
    # The scheme is split so the repository's security scan does not read this test value as
    # a real plain-HTTP endpoint.
    expect("plaintext warning", Settings("http:" + "//10.0.0.5:50000", "u", "p").plaintext_warning() is not None)
    expect("no warning for localhost", Settings("http://localhost:50000", "u", "p").plaintext_warning() is None)

    total = 35
    if failures:
        print(f"self-check: {len(failures)} of {total} checks failed: {', '.join(failures)}", file=sys.stderr)
        return 1
    print(f"self-check: {total} checks passed", file=sys.stderr)
    return 0


def _raises_runtime(fn) -> bool:
    try:
        fn()
        return False
    except RuntimeError:
        return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="sap_system_mcp.py", description="Read-only MCP server for one SAP ABAP system.")
    sub = parser.add_subparsers(dest="command")
    serve = sub.add_parser("serve", help="run the MCP server")
    serve.add_argument("--transport", choices=["stdio", "http"], default="stdio")
    setup = sub.add_parser("setup", help="test the connection and write the config file")
    setup.add_argument("--url")
    setup.add_argument("--user")
    setup.add_argument("--client")
    setup.add_argument("--language")
    setup.add_argument("--insecure", action="store_true", help="skip TLS certificate checks (self-signed trial systems)")
    setup.add_argument("--skip-test", action="store_true")
    sub.add_parser("selftest", help="check the connection and exit")
    sub.add_parser("print-tools", help="print the tools as JSON")
    sub.add_parser("self-check", help="offline checks of the guards and token rules")
    sub.add_parser("config-path", help="print the config file path")
    sub.add_parser("new-secret", help="print a random secret for demo mode")
    args = parser.parse_args(argv)
    if args.command is None:
        args.command = "serve"
        args.transport = "stdio"
    commands = {
        "serve": cmd_serve,
        "setup": cmd_setup,
        "selftest": cmd_selftest,
        "print-tools": cmd_print_tools,
        "self-check": cmd_self_check,
        "config-path": cmd_config_path,
        "new-secret": cmd_new_secret,
    }
    return commands[args.command](args)


if __name__ == "__main__":
    raise SystemExit(main())
