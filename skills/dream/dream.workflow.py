# One analyzer per session file, in parallel, then one organizer alone over the memory notes of the dream branch.
import json
import re

sessions = args["sessions"]
memory = args["memory"]
focus = args.get("focus") or ""
agents = args["agents"]
model = args.get("model") or "flash"
brought = args.get("brought") or []

steer = f"\nSteer toward this: {focus}" if focus else ""
bring = f"\nBrought notes (old notes from an earlier folder, each named by its bare file name): {', '.join(brought)}" if brought else ""


def obj_list(props):
    return {"type": "array", "items": {"type": "object", "properties": props, "required": list(props.keys())}}


STR = {"type": "string"}
ANALYZED = {
    "type": "object",
    "properties": {"proposals": obj_list({"rule": STR, "session": STR})},
    "required": ["proposals"],
}
ORGANIZED = {
    "type": "object",
    "properties": {
        "merged": {"type": "integer"},
        "conflicts": {"type": "integer"},
        "remove": obj_list({"note": STR, "reason": STR}),
        "fates": obj_list({"note": STR, "fate": STR, "into": STR, "reason": STR}),
        "owner": obj_list({"text": STR, "note": STR}),
    },
    "required": ["merged", "conflicts"],
}


async def safe_agent(prompt, schema, role, type_name):
    try:
        return await agent(prompt=prompt, schema=schema, role=role, type_name=type_name, model=model)
    except Exception:
        return None


phase("Analyze")
found = (
    await parallel(
        list(enumerate(sessions)),
        lambda item: safe_agent(
            f"Agent: {agents['analyzer']}\nSession file: {item[1]}\nMemory folder: {memory}{steer}",
            ANALYZED,
            f"analyze {item[0] + 1}",
            agents["analyzer"],
        ),
    )
    if sessions
    else []
)
ok = [r for r in found if r]

phase("Organize")
merged = await safe_agent(
    f"Agent: {agents['organizer']}\nMemory folder: {memory}{steer}{bring}",
    ORGANIZED,
    "organize",
    agents["organizer"],
)

result = {
    "merged": merged.get("merged", 0) if isinstance(merged, dict) else 0,
    "conflicts": merged.get("conflicts", 0) if isinstance(merged, dict) else 0,
    "proposals": [p for r in ok for p in (r.get("proposals") or [])],
    "missing": [re.sub(r"\.txt$", "", re.split(r"[/\\]", f)[-1]) for i, f in enumerate(sessions) if not found[i]],
    "remove": merged.get("remove", []) if isinstance(merged, dict) else [],
    "fates": merged.get("fates", []) if isinstance(merged, dict) else [],
    "owner": merged.get("owner", []) if isinstance(merged, dict) else [],
}
print(json.dumps(result, separators=(",", ":"), ensure_ascii=False))
