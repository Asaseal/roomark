Roomark bundles the following furniture GLB files in this folder:

- `chair.glb`
- `table.glb`
- `bed.glb`
- `sofa.glb`

If a GLB cannot be loaded, the scene falls back to a simple generated furniture block so the room remains usable.

Later optimization:

- Use Draco or Meshopt compression for large GLB files.
- Keep mobile GLB files under 2-5 MB where possible.
- Record source, license, dimensions, and model version in the asset manifest before shipping updated furniture data.
