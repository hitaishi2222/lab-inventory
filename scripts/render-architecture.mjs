#!/usr/bin/env node
/**
 * Render docs/architecture.mmd to docs/architecture.svg (light) and
 * docs/architecture-dark.svg (dark) with Pele (https://pele.run).
 *
 * Pele themes with CSS variables, so both variants come from the same Mermaid
 * source and only the injected palette differs. The SVG is kept self-contained
 * (opaque background, system font stack, no external CSS) so it renders the
 * same on GitHub, in an <img> tag, and when opened directly.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { render } from 'pele'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'docs/architecture.mmd'), 'utf8')

const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

// Palette: warm paper and ink, one ochre accent reserved for the two nodes that
// implement lab isolation (Lab resolver, Drizzle ORM). Everything else stays
// neutral so the accent means something.
const themes = {
  light: {
    bg: '#fbfaf6',
    vars: {
      '--pele-bg': '#fbfaf6',
      '--pele-fg': '#191813',
      '--pele-muted': '#5b584e',
      '--pele-line': '#403d34',
      '--pele-surface': '#ffffff',
      '--pele-surface-alt': '#f1eee4',
      '--pele-border': '#c9c3b2',
      '--pele-accent': '#8a5a1f',
      '--pele-radius': '8px',
    },
    cluster: '#f1eee4',
    clusterBorder: '#c9c3b2',
    card: '#ffffff',
    cardBorder: '#c9c3b2',
    store: { fill: '#f7efdd', border: '#d9c49a' },
    accent: '#8a5a1f',
  },
  dark: {
    bg: '#15150f',
    vars: {
      '--pele-bg': '#15150f',
      '--pele-fg': '#ece9dd',
      '--pele-muted': '#a5a196',
      '--pele-line': '#cfcabb',
      '--pele-surface': '#1f1f18',
      '--pele-surface-alt': '#24241c',
      '--pele-border': '#494639',
      '--pele-accent': '#d3a45f',
      '--pele-radius': '8px',
    },
    cluster: '#24241c',
    clusterBorder: '#494639',
    card: '#1f1f18',
    cardBorder: '#494639',
    store: { fill: '#2b2518', border: '#6b5733' },
    accent: '#d3a45f',
  },
}

function styles(t) {
  const vars = Object.entries(t.vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
  return `<style>
.pele{${vars};--pele-font:${font}}
.pele-cluster > rect{fill:${t.cluster};stroke:${t.clusterBorder}}
.pele-cluster-label{fill:var(--pele-muted);font-weight:600;letter-spacing:0}
.pele-cluster[data-id="edge"] > rect{stroke-dasharray:6 4}
.pele-cluster[data-id="store"] > rect{fill:${t.store.fill};stroke:${t.store.border}}
.pele-service > rect{fill:${t.card};stroke:${t.cardBorder}}
.pele-service[data-id="lab"] > rect,
.pele-service[data-id="orm"] > rect{stroke:${t.accent};stroke-width:2}
.pele-service[data-id="lab"] .pele-icon path,
.pele-service[data-id="orm"] .pele-icon path{stroke:${t.accent}}
.pele-edge path{stroke:var(--pele-line);stroke-width:1.5}
</style>`
}

function postprocess(svg, theme) {
  const title = 'Labs architecture: browser, Cloudflare Tunnel, one Node container, one SQLite file per lab'
  return svg.replace(
    /(<svg[^>]*>)/,
    `$1<title>${title}</title><rect width="100%" height="100%" fill="${theme.bg}"/>${styles(theme)}`,
  )
}

for (const [name, theme] of Object.entries(themes)) {
  const { svg, width, height, type } = render(source, {
    fontFamily: font,
    fontSize: 16,
    padding: 28,
    idPrefix: `labs-arch-${name}`,
  })
  if (type !== 'architecture') {
    throw new Error(`Expected an architecture diagram, Pele detected "${type}"`)
  }
  const file = join(root, name === 'light' ? 'docs/architecture.svg' : 'docs/architecture-dark.svg')
  writeFileSync(file, postprocess(svg, theme) + '\n')
  console.log(`${file.replace(root + '/', '')}  ${width}x${height}`)
}
