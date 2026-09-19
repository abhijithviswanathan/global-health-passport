# Dependency audit helper for the backend. Audit output is time-specific evidence,
# not a guarantee that dependencies remain free of vulnerabilities.

import json, urllib.request, sys
from pathlib import Path

source = Path(sys.argv[1])
target = Path(sys.argv[2])
root = json.loads(source.read_text())
packages = {}


def visit(n):
    if n.get("scope") and n.get("groupId"):
        packages[n["groupId"] + ":" + n["artifactId"] + ":" + n["version"]] = {
            "package": {
                "ecosystem": "Maven",
                "name": n["groupId"] + ":" + n["artifactId"],
            },
            "version": n["version"],
            "scope": n["scope"],
        }
    for c in n.get("children", []):
        visit(c)


visit(root)
items = list(packages.values())
queries = [{k: v for k, v in p.items() if k != "scope"} for p in items]
request = urllib.request.Request(
    "https://api.osv.dev/v1/querybatch",
    data=json.dumps({"queries": queries}).encode(),
    headers={"Content-Type": "application/json"},
)
result = json.loads(urllib.request.urlopen(request, timeout=90).read())
output = []
for pkg, res in zip(items, result["results"]):
    entries = []
    for v in res.get("vulns", []):
        detail = json.loads(
            urllib.request.urlopen(
                "https://api.osv.dev/v1/vulns/" + v["id"], timeout=30
            ).read()
        )
        entries.append(detail)
    output.append({"dependency": pkg, "vulnerabilities": entries})
target.write_text(
    json.dumps(
        {"source": str(source), "packages": len(items), "results": output}, indent=2
    )
)
for row in output:
    if row["vulnerabilities"]:
        print(
            row["dependency"],
            [
                (
                    v["id"],
                    v.get("database_specific", {}).get("severity", ""),
                    v.get("summary", ""),
                )
                for v in row["vulnerabilities"]
            ],
        )
print(
    "PACKAGES", len(items), "AFFECTED", sum(bool(x["vulnerabilities"]) for x in output)
)
