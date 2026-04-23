# TODO

## Fixes

- [x] **Correctly grab username from imported content** — `screen_name` is blank on many cards after likes/bookmark import. Ensure the author handle is properly extracted from GraphQL responses and stored on each bookmark item.

## Features

- [x] **Filter by bookmark folder** — Add folder/collection filtering to the canvas so users can show only bookmarks from a specific X.com collection or manually created folder.

- [x] **Filter by color** — Add color tags to cards and a color-filter HUD control so users can visually group and filter their canvas by color label.

- [x] **Frameless floating window** — Make the app a true floating window with no OS titlebar/taskbar chrome. Use `frame: false` in the Electron `BrowserWindow` config with macOS-style traffic light controls (close/minimize/maximize) and an invisible drag zone at the top edge.
