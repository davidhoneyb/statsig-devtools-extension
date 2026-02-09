# HB Statsig DevTools Chrome Extension

A Chrome extension for overriding Statsig feature gates and experiment values during HoneyBook development.

https://github.com/user-attachments/assets/4a5464d3-beb1-4a47-8e6d-d4791bd72e00

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select this folder (`statsig-devtools-extension`)

## Usage

1. Navigate to a HoneyBook development environment (localhost, staging)
2. Click the extension icon in the Chrome toolbar
3. Use the Gates or Experiments tabs to manage overrides
4. Changes auto-refresh the page

## Features

- **Gates Tab**: Toggle feature gates on/off
- **Experiments Tab**: Override experiment config values
- **Clear All**: Remove all overrides at once

## Notes

- Only works on HoneyBook sites (reads/writes `hb_statsig_overrides` localStorage key)
- Overrides persist across page refreshes
- Works alongside the console tool (`window.HBStatsig`)
