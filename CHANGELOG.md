# Changelog

## 0.13.0 — 2026-10-31
- **Resize handles like Tinkercad**: blue squares on the ends, edges and corners of the selected piece change its
  length and width by dragging. They stop against the faces of other pieces; when the face is slanted the piece also
  gets the right angled cut (Fit, without the command). The cuts on the moving end follow it.
- **Sizes on the piece can be typed**: tap the length, width or thickness label in 3D. Length and width are the
  *finished* sizes: a piece trimmed by a cut reaches the size you type (the cut moves with the end). The piece panel
  explains when the finished size is smaller than the fields because of cuts.
- **Live snapping while dragging**: faces, edges and centres line up with nearby pieces while moving (green edges),
  never pushing a piece into another one; Alt disables it. When the piece ends up resting on another one, the
  «Align» panel opens to type the distances from the edges.
- **Sheet and stock length per project** in the cutting layout: each material shows its sheet (L × H) or bar length,
  editable for the current project (offcuts, sheets pre-cut by the shop), with a button to go back to the catalogue.
- Changing length or width in the piece panel now moves the cuts of end B with it.

## 0.12.0 — 2026-10-31
- **Five languages**: Italian, English, French, German, Spanish. The first time the language follows the browser;
  it can be changed from the ⋯ menu. Numbers, dates and currency follow the chosen language. A test checks that
  every dictionary has every text with the same placeholders.
- **Prices and costs are optional** and hidden by default: they are turned on from the ⋯ menu (setting shared
  between devices). New materials no longer need a price.
- Assembly instructions and screw notes no longer depend on Italian text (thin pieces are found by thickness).
- Toolbars and dialog headers no longer overflow with longer words.

## 0.11.0 — 2026-10-30
- **2D drawing** of a panel, modelled on LightBurn: rectangles (with corner radius), ellipses, polygons and
  point-to-point lines; each shape is solid, through hole or pocket (depth, from the top or the bottom). The piece is
  the union of the solids minus the holes. Snapping to the grid (1, 5, 10 mm) and to the key points of the other
  shapes, handles for the size, line nodes, rotation, centring, series, undo, zoom and scrolling. Positions are read
  as distances from the edges of the piece. New «Draw» tool and «Draw» shape in the piece panel.
- Pockets in the dimensioned drawings (dashed, with depth) and in the DXF on `..._SCASSO_<depth>mm` layers.
- Fixed: opening the profile editor several times stacked its event handlers (one save could be applied twice).

## 0.10.0 — 2026-10-30
- Thickness of every panel and section of every batten can be typed by hand: the piece becomes «custom» (cut list,
  cutting layout and costs keep it apart from the catalogue material). In the piece panel sizes come first, then
  the material.
- Templates: sizes at the top, «Materials and thicknesses» in a collapsible section with the thickness (or section)
  of every material; new sizes (table leg inset and apron, top overhangs, bookcase back panel, first shelf of the
  shelving unit, bench side inset and rail).
- Free movement: drag the piece on the floor plane (as in Tinkercad), the arrow on top raises it; Shift = one
  direction only. In the Front, Side and Top views you drag in the screen plane.
- Place redone: tap the face of the piece to rest on (also turning it) and then the point on the other piece where
  it goes; «Align» panel with left/centre/right, distances from the edges, distance from the face and «Copy to the
  other corners». The whole selection moves.
- Fit also works with rotated pieces and in width: tap the end or edge to extend, then the exact face it must reach.
- Units mm or cm (at the top), and the unit can be typed in the fields («76 cm», «760 mm», «30\"»).

## 0.9.0 — 2026-10-29
- Direct editing: move and rotate by dragging, magnetic snapping, multiple selection, groups, mirrored copy,
  Measure tool, sizes in 3D and overall sizes in the views, exploded view, shortcuts.
- Templates: bookcase, base cabinet, wall cabinet, chest of drawers, shelving, table, bench.
- Drawers on ball-bearing runners; moving parts not screwed to the cabinet.
- Fastening chosen per joint (screws, confirmat, dowels, cam locks, glue); screws in corners move so they don't
  collide; check of interpenetrating pieces.
- Edge banding per side with cutting size, grain per piece.
- Free profiles with arcs, dimensioned drawings of the pieces with hole table, 1:1 templates on A4, labels.
- CSV, DXF, STL, PNG export; assembly instructions; workshop mode; offcut stock; personal material catalogue;
  project versions; quick guide; tablet interface in portrait.
- Docker and automatic tests on GitHub.

## 0.5.0 — 2026-10-28
Weight, stability and shelf sag.

## 0.4.0 — 2026-10-28
Divide command.

## 0.3.0 — 2026-10-28
Hinges and handles with holes, automatic screws with checks, shopping list.

## 0.2.0 — 2026-10-28
Project export/import, cutting layout.

## 0.1.0 — 2026-10-28
First prototype: panels and battens, Place, Fit, circles and rounded corners, cut list, saving, portable version
for Windows.
