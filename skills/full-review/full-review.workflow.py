# Two reviews times N zones, one read-only zone-review agent each.
import json

REVIEWS = ["thermo-nuclear-review", "thermo-nuclear-code-quality-review"]
ZONES = args["zones"]
SKILLS = args["skills"]
AGENT_TYPE = args.get("agent") or "zone-review"
MODEL = args.get("model") or "pro"
RANK = {"high": 0, "medium": 1, "low": 2}

SCHEMA = {
    "type": "object",
    "properties": {
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "severity": {"enum": ["high", "medium", "low"]},
                    "kind": {"enum": ["error", "restructure"]},
                    "row": {"enum": ["blocking", "pending", "drop"]},
                    "file": {"type": "string"},
                    "line": {"type": "number"},
                    "title": {"type": "string"},
                    "case": {"type": "string"},
                },
                "required": ["severity", "kind", "row", "file", "line", "title", "case"],
            },
        },
    },
    "required": ["findings"],
}

pairs = [{"review": review, "zone": zone} for review in REVIEWS for zone in ZONES]


async def run_pair(pair):
    review = pair["review"]
    zone = pair["zone"]
    prompt = f'Follow {SKILLS[review]}/SKILL.md, its "Whole-repo mode" section, on this zone only. Zone "{zone["key"]}", paths: {", ".join(zone["paths"])}. Return the findings in the "findings" field.'
    try:
        out = await agent(prompt=prompt, schema=SCHEMA, role=f"{review}: {zone['key']}", type_name=AGENT_TYPE, model=MODEL)
        if not out or "findings" not in out:
            return None
        return [{**f, "review": review, "zone": zone["key"]} for f in out["findings"]]
    except Exception:
        return None


phase("Review")
results = await parallel(pairs, run_pair) if pairs else []
ok = [r for r in results if r is not None]
log(f"{len(ok)} of {len(pairs)} agents returned")

phase("Merge")
seen = {}
for group_list in ok:
    for f in group_list:
        at = f"{f['file']}:{f['line']}"
        seen.setdefault(at, []).append(f)

all_findings = []
for group in seen.values():
    both = len({f["review"] for f in group}) > 1
    for f in group:
        all_findings.append({**f, "both": both})

all_findings.sort(key=lambda f: (0 if f["both"] else 1, RANK.get(f["severity"], 3)))
result = {
    "errors": [f for f in all_findings if f["kind"] == "error"],
    "restructures": [f for f in all_findings if f["kind"] == "restructure"],
    "missing": [{"review": p["review"], "zone": p["zone"]["key"]} for i, p in enumerate(pairs) if results[i] is None],
}
print(json.dumps(result, separators=(",", ":"), ensure_ascii=False))
