"""Persistent asset/object identity for evidence binding.

The ID is stored in the object's custom properties so it survives renaming. IDs
must be unique within the scene; duplicate IDs are ambiguous and must block
enforcement rather than silently selecting one object.
"""

import json
import sys
import uuid

ASSET_ID_KEY = "asset_id"


def get_asset_id(obj):
    value = obj.get(ASSET_ID_KEY, "") if obj is not None else ""
    return str(value).strip() if value is not None else ""


def assign_asset_id(obj, value=None):
    value = str(value) if value else str(uuid.uuid4())
    obj[ASSET_ID_KEY] = value
    return value


def object_ids(objects, errors, require=True):
    """Return name -> ID and report missing/duplicate IDs."""
    result = {}
    owners = {}
    for obj in objects:
        asset_id = get_asset_id(obj)
        if not asset_id:
            if require:
                errors.append(f"object has no persistent asset_id: {obj.name}")
            continue
        if asset_id in owners:
            errors.append(
                f"duplicate asset_id {asset_id}: {owners[asset_id]}, {obj.name}")
        else:
            owners[asset_id] = obj.name
        result[obj.name] = asset_id
    return result


def id_index(objects):
    index = {}
    for obj in objects:
        asset_id = get_asset_id(obj)
        if asset_id:
            index.setdefault(asset_id, []).append(obj)
    return index


def resolve_ids(ids, objects, errors, label="manifest"):
    """Resolve IDs to exactly one object each; report missing/ambiguous."""
    index = id_index(objects)
    resolved = []
    for asset_id in ids:
        if not asset_id:
            errors.append(f"{label} has an empty target asset_id")
            continue
        matches = index.get(asset_id, [])
        if not matches:
            errors.append(f"{label} target asset_id is missing: {asset_id}")
        elif len(matches) > 1:
            errors.append(
                f"{label} target asset_id is ambiguous: {asset_id} -> "
                f"{[obj.name for obj in matches]}")
        else:
            resolved.append(matches[0])
    return resolved


def main():
    import argparse
    import bpy
    parser = argparse.ArgumentParser(description="Assign persistent asset IDs.")
    parser.add_argument("--objects", default="")
    parser.add_argument("--prefix", default="")
    parser.add_argument("--all-meshes", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--save", action="store_true")
    args = parser.parse_args(
        sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    names = [name.strip() for name in args.objects.split(",") if name.strip()]
    objects = [bpy.data.objects[name] for name in names]
    if args.prefix:
        objects += [obj for obj in bpy.data.objects
                    if obj.type == "MESH" and obj.name.startswith(args.prefix)]
    if args.all_meshes:
        objects += [obj for obj in bpy.data.objects if obj.type == "MESH"]
    objects = list({obj.name: obj for obj in objects}.values())
    if not objects:
        raise RuntimeError("No objects selected")
    result = {}
    for obj in objects:
        if get_asset_id(obj) and not args.force:
            result[obj.name] = get_asset_id(obj)
            continue
        result[obj.name] = assign_asset_id(obj)
    print("ASSET_IDS " + json.dumps(result, sort_keys=True))
    if args.save:
        if not bpy.data.filepath:
            raise RuntimeError("Open a saved .blend before --save")
        bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
        print("SAVED " + bpy.data.filepath)


if __name__ == "__main__":
    main()
