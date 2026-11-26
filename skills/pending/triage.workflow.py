# Judges the unscheduled pending cards, 20 per agent in parallel; a chunk that fails leaves its cards not judged.
import json

cards = args["cards"]
agent_type = args["agent"]
model = args.get("model") or "flash"

JUDGED = {
    "type": "object",
    "properties": {
        "results": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "n": {},
                    "kind": {"enum": ["finding", "ordered"]},
                    "row": {"enum": ["blocking", "pending", "drop", None]},
                    "reason": {"type": "string"},
                },
                "required": ["n", "kind", "row", "reason"],
            },
        },
    },
    "required": ["results"],
}


async def safe_judge(item):
    idx, chunk = item
    try:
        return await agent(
            prompt=f"Judge these cards:\n{json.dumps(chunk, separators=(',', ':'), ensure_ascii=False)}",
            schema=JUDGED,
            role=f"judge {idx + 1}",
            type_name=agent_type,
            model=model,
        )
    except Exception:
        return None


phase("Judge")
chunks = [cards[i : i + 20] for i in range(0, len(cards), 20)]
got = await parallel(list(enumerate(chunks)), safe_judge) if chunks else []

judged = []
ordered = []
seen = set()
for i, chunk in enumerate(chunks):
    mine = {c["n"] for c in chunk}
    for r in (got[i] or {}).get("results") or []:
        n = r.get("n")
        if n not in mine or n in seen:
            continue
        if r.get("kind") == "ordered":
            ordered.append({**r, "row": None})
        elif r.get("row") in ("blocking", "pending", "drop"):
            judged.append(r)
        else:
            continue
        seen.add(n)

result = {
    "judged": judged,
    "ordered": ordered,
    "notJudged": [c["n"] for c in cards if c["n"] not in seen],
}
print(json.dumps(result, separators=(",", ":"), ensure_ascii=False))
