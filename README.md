# Links to QR

Paste links, get a QR code for each. [linkstoqr.com](https://linkstoqr.com) is free, needs no sign-up and has no tracking, ads, watermarks or limits on codes.

- **Private:** codes are generated in your browser. A strict Content Security Policy stops the page's scripts from sending links anywhere, and a test checks this.
- **Permanent:** each code contains your link directly, so it keeps working even if this site goes away.

## Development

Requires Node 22.18 or later.

```sh
npm install
npx playwright install chromium
npm run dev -w @linkstoqr/web   # local dev server
npm run typecheck
npm test                        # encoding and decode tests
npm run test:e2e                # browser tests under the production security headers
```

To run the browser tests against a deployed site, set `BASE_URL`.

## Layout

- `packages/qr-core`: link parsing, QR encoding, and SVG, PNG and ZIP output. It has no browser or server dependencies.
- `apps/web`: the static free tool. It works without any backend.

Every generated code is decoded by two independent decoders, [ZXing](https://github.com/zxing-cpp/zxing-cpp) and [jsQR](https://github.com/cozmo/jsQR), across sizes, colours, margins and error correction levels.

## Deployment

```sh
cd apps/web && npx cf deploy
```

## License

[AGPL-3.0](LICENSE). The vendored encoder in `packages/qr-core/src/vendor` is [Project Nayuki's QR Code generator](https://www.nayuki.io/page/qr-code-generator-library), under the MIT License, with an ES module export added.

Contributions are accepted under the [Developer Certificate of Origin](https://developercertificate.org/): sign off commits with `git commit -s`.
