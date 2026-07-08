import ifcopenshell
from collections import defaultdict

# ---------------------------------------------------
# CHANGE THIS TO YOUR IFC
# ---------------------------------------------------
IFC_FILE = r"C:\Users\User\OneDrive\Desktop\Upwork\BIM\bim-4d-viewer\SimpleWall.ifc"

model = ifcopenshell.open(IFC_FILE)

print("=" * 80)
print("IFC INFORMATION")
print("=" * 80)

print("Schema:", model.schema)
print("Entities:", len(model))

print()


# ---------------------------------------------------
# Helper
# ---------------------------------------------------

def label(entity):
    if entity is None:
        return "None"

    name = getattr(entity, "Name", None)

    if name:
        return f"{entity.is_a()} : {name}"

    gid = getattr(entity, "GlobalId", None)

    if gid:
        return f"{entity.is_a()} : {gid}"

    return entity.is_a()


# ====================================================
# 1. SPATIAL DECOMPOSITION
# ====================================================

print("=" * 80)
print("SPATIAL DECOMPOSITION (IfcRelAggregates)")
print("=" * 80)

for rel in model.by_type("IfcRelAggregates"):

    parent = rel.RelatingObject

    print()
    print(label(parent))

    for child in rel.RelatedObjects:
        print("   └──", label(child))


# ====================================================
# 2. STOREY CONTAINMENT
# ====================================================

print()
print("=" * 80)
print("STOREY CONTAINMENT (IfcRelContainedInSpatialStructure)")
print("=" * 80)

for rel in model.by_type("IfcRelContainedInSpatialStructure"):

    spatial = rel.RelatingStructure

    print()
    print(label(spatial))

    for obj in rel.RelatedElements:
        print("   └──", label(obj))


# ====================================================
# 3. OPENINGS
# ====================================================

print()
print("=" * 80)
print("VOID RELATIONSHIPS")
print("=" * 80)

for rel in model.by_type("IfcRelVoidsElement"):

    print()

    print(
        label(rel.RelatingBuildingElement),
        "contains opening",
        label(rel.RelatedOpeningElement),
    )


# ====================================================
# 4. DOORS/WINDOWS FILLING OPENINGS
# ====================================================

print()
print("=" * 80)
print("FILLS RELATIONSHIPS")
print("=" * 80)

for rel in model.by_type("IfcRelFillsElement"):

    print()

    print(
        label(rel.RelatedBuildingElement),
        "fills",
        label(rel.RelatingOpeningElement),
    )


# ====================================================
# 5. TYPE ASSIGNMENTS
# ====================================================

print()
print("=" * 80)
print("TYPE ASSIGNMENTS")
print("=" * 80)

for rel in model.by_type("IfcRelDefinesByType"):

    print()

    print(label(rel.RelatingType))

    for obj in rel.RelatedObjects:
        print("   └──", label(obj))


# ====================================================
# 6. PROPERTY SETS
# ====================================================

print()
print("=" * 80)
print("PROPERTY SETS")
print("=" * 80)

for rel in model.by_type("IfcRelDefinesByProperties"):

    pset = rel.RelatingPropertyDefinition

    if not hasattr(pset, "Name"):
        continue

    for obj in rel.RelatedObjects:

        print(
            f"{label(obj)}"
            f"  -->  {pset.Name}"
        )


# ====================================================
# 7. ENTITY COUNTS
# ====================================================

print()
print("=" * 80)
print("ENTITY COUNTS")
print("=" * 80)

counts = defaultdict(int)

for e in model:
    counts[e.is_a()] += 1

for k in sorted(counts):
    print(f"{k:<35} {counts[k]}")
