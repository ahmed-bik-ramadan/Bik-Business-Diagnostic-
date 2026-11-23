# Netlify build and launch checklist

- Build from the repository root with `pnpm --filter @workspace/bik-platform run build` on Node.js `24.22.3`.
- Publish `artifacts/bik-platform/dist` and rewrite `/*` to `/index.html` with status `200`.
- The build writes the local Express bundle to `server-dist/server.js` outside the publish folder. [Build audit](./PROGRESS.md)

## At launch

- Remove the `noindex` meta tag from `artifacts/bik-platform/index.html`.
- Set `artifacts/bik-platform/public/robots.txt` to allow crawling (`Allow: /` under `User-agent: *`).
- Set `og:url` and the canonical URL in `artifacts/bik-platform/index.html` to the final site URL.
- Fill the PayPal URLs in `artifacts/bik-platform/src/config/paymentConfig.ts`.
