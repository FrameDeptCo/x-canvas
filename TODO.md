# TODO

## Fixes

- [ ] **Correctly grab username from imported content** — `screen_name` is blank on many cards after likes/bookmark import. Ensure the author handle is properly extracted from GraphQL responses and stored on each bookmark item.

## Features

- [ ] **Filter by bookmark folder** — Add folder/collection filtering to the canvas so users can show only bookmarks from a specific X.com collection or manually created folder.

- [ ] **Filter by color** — Add color tags to cards and a color-filter HUD control so users can visually group and filter their canvas by color label.

- [ ] **Frameless floating window** — Make the app a true floating window with no OS titlebar/taskbar chrome. Use `frame: false` + `transparent: true` in the Electron `BrowserWindow` config and implement custom drag/close controls so all 4 edges are seamless.
