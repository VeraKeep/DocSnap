# DocSnap

**Scan documents to PDF instantly — no account, no upload, no Adobe license.**

DocSnap is a dead-simple web app that uses your phone or laptop camera to snap a document and immediately turns it into a downloadable PDF. Everything runs locally in your browser — nothing is ever uploaded to a server.

## How It Works

1. **Open Camera** — Uses the browser's MediaDevices API to access your camera
2. **Capture** — Snap a frame of your document
3. **Edge Detection & Crop** — Auto-detects document edges, crops, and deskews the image using pure canvas image processing
4. **Multi-page PDF** — Capture as many pages as you need, then download them as a single PDF

### Privacy First

DocSnap is **100% client-side**. Your documents never leave your device. No accounts, no uploads, no server processing — just your browser and the camera you already have.

## Tech Stack

- **[Bun](https://bun.sh)** — JavaScript runtime & package manager
- **[Vite](https://vitejs.dev)** — Build tool & dev server
- **[TanStack Start](https://tanstack.com/start)** — React framework with SSR
- **[jsPDF](https://github.com/parallax/jsPDF)** — Client-side PDF generation
- **[Tailwind CSS](https://tailwindcss.com)** — Utility-first styling
- **Pure Canvas API** — Document edge detection, crop, and deskew (no OpenCV, no WASM)

## Live Site

**[docsnapapp.com](https://docsnapapp.com)**

## Development

```bash
# Install dependencies
bun install

# Run dev server
bun run dev

# Build for production
bun run build

# Publish to production
bun run publish
```

## License

MIT
