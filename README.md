# Image Resizer & Compressor

A lightweight, client-side web app to resize and compress images directly in your browser. Built with Tailwind CSS and jQuery. No uploads or servers required.

## Features
- Select multiple images (drag & drop or click)
- Resize by width/height with optional aspect ratio lock
- Choose output format: Original, JPEG, PNG, WEBP
- Control quality (for JPEG/WEBP)
- Target size (KB) compression for JPEG/WEBP via binary search
- Live previews and per-file download buttons
- Dark/Light theme toggle with saved preference

## Quick Start
1. Open `index.html` in your browser.
2. Click the drop area (or drag & drop images) to select files.
3. Set width/height, output format, and either quality or target size (KB).
4. Click "Process Images" and download results per preview card.

Notes:
- Compression quality only applies to JPEG/WEBP. PNG ignores quality; file sizes depend on content and dimensions.
- All processing happens locally using Canvas APIs; images never leave your device.

## Development
- Styling: Tailwind CDN
- Interactivity: jQuery
- Logic: `assets/js/app.js`

### Folder Structure
```
Image resizer/
├─ index.html
├─ README.md
└─ assets/
   └─ js/
      └─ app.js
```

## License
This project is provided as-is. Use at your own discretion.
