#!/usr/bin/env python3
"""Look up SAP objects in SAP's Cloudification Repository.

The repository (https://github.com/SAP/abap-atc-cr-cv-s4hc, Apache-2.0) publishes the release
state of SAP objects for ABAP Cloud and the successors of objects that will not be released.

Usage:
    python3 lookup_api_state.py VBAK KNA1 CL_ABAP_UNIT_ASSERT
    python3 lookup_api_state.py --source ./objectReleaseInfoLatest.json VBAK --json
    python3 lookup_api_state.py --fail-on-not-released VBAK

Exit codes: 0 success, 2 bad arguments or unreadable source, 3 when --fail-on-not-released is
set and at least one object is not released.

Only the Python standard library is used. Sources must be local files or https URLs.
"""

import argparse
import json
import sys
import urllib.request

DEFAULT_SOURCE = (
    "https://raw.githubusercontent.com/SAP/abap-atc-cr-cv-s4hc/main/src/objectReleaseInfoLatest.json"
)


def load_source(source):
    """Return the parsed JSON document from a local path or an https URL."""
    if source.startswith("https://"):
        with urllib.request.urlopen(source, timeout=60) as response:  # nosec - https only
            return json.load(response)
    if "://" in source:
        raise ValueError("Only https URLs or local file paths are accepted: " + source)
    with open(source, encoding="utf-8") as handle:
        return json.load(handle)


def build_index(document):
    """Index entries by upper-case TADIR object name and object key."""
    entries = document.get("objectReleaseInfo") or document.get("objectClassifications") or []
    index = {}
    for entry in entries:
        for key in (entry.get("tadirObjName"), entry.get("objectKey")):
            if key:
                index.setdefault(key.upper(), [])
                if entry not in index[key.upper()]:
                    index[key.upper()].append(entry)
    return index


def describe(name, entries):
    """Return a result record for one looked-up name."""
    if not entries:
        return {
            "name": name,
            "found": False,
            "state": "not found",
            "note": "Not in the file. Treat as not released.",
            "entries": [],
        }
    records = []
    for entry in entries:
        records.append(
            {
                "type": entry.get("tadirObject"),
                "objectType": entry.get("objectType"),
                "state": entry.get("state"),
                "applicationComponent": entry.get("applicationComponent"),
                "successors": [s.get("tadirObjName") for s in entry.get("successors", [])],
            }
        )
    states = sorted({r["state"] for r in records if r["state"]})
    return {"name": name, "found": True, "state": "/".join(states), "entries": records}


def main(argv=None):
    parser = argparse.ArgumentParser(description="Look up SAP object release states.")
    parser.add_argument("names", nargs="+", help="Object names, for example VBAK or I_PRODUCT")
    parser.add_argument("--source", default=DEFAULT_SOURCE, help="Local JSON file or https URL")
    parser.add_argument("--json", action="store_true", help="Print JSON instead of a table")
    parser.add_argument(
        "--fail-on-not-released",
        action="store_true",
        help="Exit with code 3 if any object is not released",
    )
    args = parser.parse_args(argv)

    try:
        index = build_index(load_source(args.source))
    except (OSError, ValueError) as error:
        print("Could not read source: " + str(error), file=sys.stderr)
        return 2

    results = [describe(name, index.get(name.upper(), [])) for name in args.names]

    if args.json:
        print(json.dumps({"source": args.source, "results": results}, indent=2))
    else:
        print("Source: " + args.source)
        print("{:<32} {:<6} {:<16} {}".format("Object", "Type", "State", "Successors"))
        for result in results:
            if not result["found"]:
                print("{:<32} {:<6} {:<16} {}".format(result["name"], "-", "not found", result["note"]))
                continue
            for record in result["entries"]:
                successors = ", ".join(record["successors"]) or "-"
                print("{:<32} {:<6} {:<16} {}".format(result["name"], record["type"] or "-", record["state"] or "-", successors))

    if args.fail_on_not_released:
        if any(r["state"] != "released" for r in results):
            return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
