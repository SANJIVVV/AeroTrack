# Third-party browser files

These files are copied here so the app runs without a bundler or a CDN (the
server's Content Security Policy only allows scripts from this site).

| File | Library | Version | Licence | Used for |
|---|---|---|---|---|
| `qrcode.js` | [qrcode](https://github.com/soldair/node-qrcode) | 1.5.4 | MIT | Drawing the QR code on the digital baggage tag. Bundled once into an ES module with esbuild (`import QRCode from 'qrcode/lib/browser.js'`). |
| `html5-qrcode.min.js` | [html5-qrcode](https://github.com/mebjas/html5-qrcode) | 2.3.8 | Apache-2.0 | Reading QR codes from the camera or a photo. Copied unchanged from the npm package. Loaded only when the camera or photo scan is used. |

Icons in `js/lib/icons.js` are SVG paths from [Lucide](https://lucide.dev) (ISC licence).
