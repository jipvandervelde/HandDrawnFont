# handdrawn.software

Static website for the HandDrawnFont Swift package. The site uses the four
finished Grug Hand font faces made from the original drawings: Light, Book,
Regular, and Medium.

The checked-in website fonts are byte-for-byte copies of the Ocho Grug font
exports. The Swift package continues to use normalized stroke data for its
animated renderer.

## Local development

```bash
npm ci
npm run dev
```

Wrangler serves the generated site locally. The production output is written
to the ignored `dist/` directory.

## Checks

```bash
npm run build
npm run check
```

## Deployment

The Wrangler configuration is pinned to the Ocho Cloudflare account and the
`handdrawn.software` custom domain.

```bash
npm run deploy
```
