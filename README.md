# AV Roms

AV Roms is a browser-based firmware metadata index viewer for Xiaomi firmware update feeds.

## Disclaimer

- This is an unofficial tool.
- It is not affiliated with, endorsed by, or sponsored by Xiaomi.
- Xiaomi, MIUI, HyperOS, and other marks are trademarks of their respective owners.

## What This Project Does

- Loads device codenames from the upstream public RSS index.
- Lets users filter by build type, flash method, region, and version.
- Shows metadata (version, Android base, size, date, MD5) and source download links.

## What This Project Does Not Do

- Does not host firmware files.
- Does not redistribute full feed content archives.
- Does not claim ownership over third-party data or trademarks.

## Data Source

Primary upstream source:

- https://github.com/XiaomiFirmwareUpdater/miui-updates-tracker

## Privacy

- Core functionality runs in the browser.
- The app stores temporary selection state in browser storage (`sessionStorage`) under `av_roms_v1`.
- No backend database is required for normal operation.

See also:

- [PRIVACY.md](PRIVACY.md)
- [TERMS.md](TERMS.md)
- [NOTICE.md](NOTICE.md)

## Local Development

Because this is a static frontend project, you can run it with any static server.

### Option 1: VS Code Live Server

1. Open the folder in VS Code.
2. Start Live Server on `index.html`.

### Option 2: Python static server

```bash
python -m http.server 5500
```

Then open:

- http://localhost:5500

## Project Structure

- `index.html`: app shell and legal/footer links.
- `style.css`: glassmorphism UI styles and responsive layout.
- `app.js`: data fetching, parsing, filters, and rendering.
- `NOTICE.md`: attribution, trademark, and non-affiliation notice.
- `TERMS.md`: terms of use.
- `PRIVACY.md`: privacy policy.
- `LICENSE`: project source code license.

## License

This project source code is licensed under the MIT License. See [LICENSE](LICENSE).

Third-party data, names, and trademarks remain the property of their respective owners.
