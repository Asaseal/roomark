# Roomark Web Furnish

Roomark Web Furnish is the maintained browser implementation of the local 3D furnishing workflow. It supports room selection, furniture placement, drag interaction, locking, deletion, automatic local persistence, and concept-effect status.

## Run locally

```powershell
cd apps/web-furnish
node server.cjs
```

Open `http://127.0.0.1:5191/`.

## Product workflow

1. Select one of the local room records.
2. Open the furnishing studio.
3. Add a bed, table, chair, sofa, or storage unit.
4. Drag furniture across the room floor.
5. Lock or remove the selected item.
6. Return to the room list and confirm the persisted furniture count and save time.

## Local fallback behavior

The editor includes generated room geometry and placeholder furniture so the workflow remains available when an external GLB file cannot be loaded. Every room keeps an independent layout in browser `localStorage`.

Included room samples:

- Sample room: `3m × 3m × 3m`
- Long studio: `4.2m × 2.8m × 3m`
- Window bedroom: `3.6m × 3.2m × 2.9m`
- Compact living room: `4.6m × 3.4m × 2.9m`

The browser implementation is a maintained fallback and inspection surface. The Android application in `apps/mobile` is the primary Roomark product.
