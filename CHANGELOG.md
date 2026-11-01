# Changelog

## 0.16.0-alpha.1 — 2026-11-01
**Build a cabinet in a few taps.**
- **Fill** (left toolbar, key K): tap inside an opening of a cabinet and choose **shelves**, **dividers**, a **back
  panel**, **doors** or **drawers**. The walls, top and bottom are found by themselves and the new pieces are already
  cut to size, evenly spaced, with a preview of the gaps before adding them. Works on cabinets turned by 90°.
- **Doors** from Fill cover the whole front between the pieces that reach the front (shelves set back are ignored):
  full overlay on outer sides, half overlay on a divider shared with another opening, 3 mm gaps, hinges and handles
  included. One or two doors.
- **Simpler toolbars**: the left column only has the tools that create (Panel, Batten, Drawing, Models, Fill,
  Measure). **Place, Fit and Divide** moved to the bar that appears when a piece is selected, so they are never greyed
  out; press them again to leave. Mirrored copy, multiple selection and Lock are in its **⋯** menu.
- Drawer replaced by Fill → Drawers in the left column.

## 0.15.0-alpha.1 — 2026-11-01
**Wood type is now optional: thickness is enough.**
- New pieces, ready-made models and drawers start as a plain **“Panel 18 mm”** or **“Batten 45×45”**: no need to
  pick a product that you might not find in your shop. Cut list, cutting layout and shopping list group pieces by
  thickness (or section).
- Under the thickness, **quick buttons with the common shop sizes** (3–30 mm for panels, 40×20 to 100×100 for battens).
- The wood type moved to a collapsed **“Wood type: not specified”** section of the piece panel: choose one only if you
  want its colour, grain or more precise weight and sag checks. Changing it keeps the piece's thickness.
- **Grain** is chosen piece by piece (“Doesn't matter”, along the length, along the width); with no wood type, pieces
  may rotate on the sheet to save material.
- Ready-made models ask only for **thicknesses**; drawers ask for the box and front thickness.
- Offcuts in the stock list take a thickness (or section), so they match pieces with the same size.
- With prices hidden, the ⋯ menu shows **“Sheets and lengths”** instead of “Materials and prices”.
- Existing projects keep their materials.

## 0.14.0-alpha.1 — 2026-11-01
First **alpha** for testers: everything works, but sizes, screws and stability checks are indicative.
- **Projects screen at start-up**: the app no longer reopens the last project by itself. Projects are cards with a
  picture, date and “open now / last opened”; tap the picture or the name to open, **Continue “…”** reopens the last
  one with one tap. Closing the screen without choosing reopens the last project.
- **Rename and Duplicate** on every project card; the **open project can be deleted** too, with **Undo** in the message.
- A project deleted while offline no longer comes back from the server (the deletion is retried when online).
- First start no longer saves the example as one of your projects (no more duplicate “Cabinet with lectern”).
- **Faster loading**, especially on tablets over a VPN: the server sends unchanged files as “not modified”, compresses
  them and keeps connections open; requests that get no answer within 5 s fall back to the copy on the device.
- Messages shown while a window is open now appear inside that window (they used to be hidden behind it).
- Version and “alpha” shown in the ⋯ menu and in the guide; the Windows portable read-me has an English section.

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
- **Fit fixes**: tapping the far face of the other piece (e.g. the top of a table top) now makes the piece end flush
  with it instead of cutting it away entirely; a piece that went past the face is shortened to the cut, so its
  length field matches the finished size; the tapped end is the one that moves (also end A, the other stays put).
- **Lock** (selection bar, key B): a locked piece can't be moved by mistake and **notches** every unlocked piece
  that passes through it, automatically and live (e.g. lock the legs, duplicate the table top and lower it: the
  shelf gets the leg notches). Notches are listed in the piece panel and in the cut list.
- **Holes and shapes on a placed piece**: «+ Hole Ø 40» or «Draw holes and shapes…» (the 2D editor with the piece
  outline fixed). Through holes and pockets keep their size and their distance from an edge (left/centre/right,
  bottom/centre/top) when the piece is resized; both are editable in the panel.
- **Shorter piece panel**: sizes, thickness and material stay on top; shape, holes, orientation and position, cuts,
  edges, hardware and joints are collapsible sections (the open ones are remembered).
- **Drawers rebuilt**: press Drawer and tap inside the opening (inner face of a side, the bottom or the back); the
  walls, top, bottom and open front are found by themselves, also in cabinets turned by 90°. Three runner types with
  editable sizes: ball-bearing side runners (clearance per side, length), concealed undermount runners (clearance,
  space under the box) and wooden runner battens screwed to the walls (clearance, batten height and width).
- **Screwed ends stay put**: typing a new length or width keeps the end fixed with screws (or other fasteners) to
  another piece and changes the piece on the free side.
- Place: when the two tapped faces look the same way, the half turn is around the vertical, not a random axis.

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
