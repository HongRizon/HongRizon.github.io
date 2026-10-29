# hongrizon.github.io

A single self-contained page: `index.html`. No runtime dependencies, no trackers,
no remote requests. Everything else in this repository exists to regenerate and
verify that page.

## Layout

| path | role |
| --- | --- |
| `index.html` | the published page (generated; do not edit by hand) |
| `src/index.template.html` | the page source: markup, CSS and script, with data placeholders |
| `data/usdkrw.csv`, `data/usdkrw.json` | the USD/KRW observations, readable and in the page's lossless encoding |
| `build.mjs` | fills the template: static figure, baseline table, metrics strip, labels |
| `tools/fetch-data.mjs` | fetches the latest Federal Reserve H.10 release into `data/` |
| `tools/og.mjs` | renders `og.png`, `favicon-32.png`, `apple-touch-icon.png` |
| `.github/workflows/update-data.yml` | scheduled refresh: fetch → build → validate → commit when the data changed |
| `qa/` | the checks listed below |
| `404.html`, `robots.txt`, `sitemap.xml` | site plumbing |

## Editing the page

1. Change `src/index.template.html`.
2. `node build.mjs` writes `index.html`.
3. Commit both.

## Data refresh

The H.10 release is weekly (Mondays, for the week before). The workflow runs
Tuesday to Saturday at 09:17 UTC, and commits only when new observations exist,
so the page's "Stored observations through …" line stays current without manual
work. Run it by hand from the Actions tab ("Update data" → Run workflow), or locally:

    node tools/fetch-data.mjs   # refuses to shrink or rewrite history
    node build.mjs

GitHub disables scheduled workflows in a repository with no activity for 60 days;
the weekly data commits count as activity, so this only matters if the source
stops publishing. GitHub emails a notice in that case.

## Checks (`npm install` first; `npx playwright install chromium` once)

    npm run validate   # html-validate, recommended rules
    npm run qa         # static/live parity, interactions, print (8 combinations, one page), axe-core
    node qa/shots.js   # screenshots 320–1920px, forced colors, no JavaScript
