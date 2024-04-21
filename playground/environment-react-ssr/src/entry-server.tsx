import './css-server.css'
import ReactDomServer from 'react-dom/server'
import type { Connect, ViteDevServer } from 'vite'
import Root from './root'
import fs from 'node:fs'
import path from 'node:path'

const hanlder: Connect.NextHandleFunction = async (_req, res) => {
  const ssrHtml = ReactDomServer.renderToString(<Root />)
  let html = await importHtml()
  let css = await importCss()
  html = html.replace('<body>', `<body><div id="root">${ssrHtml}</div>`)
  html = html.replace('<head>', `<head><style>${css}</style>`)
  res.setHeader('content-type', 'text/html').end(html)
}

export default hanlder

declare let __globalServer: ViteDevServer

async function importHtml(): Promise<string> {
  if (import.meta.env.DEV) {
    const mod = await import('/index.html?raw')
    return __globalServer.transformIndexHtml('/', mod.default)
  } else {
    const mod = await import('/dist/client/index.html?raw')
    return mod.default
  }
}

async function importCss(): Promise<string> {
  if (import.meta.env.DEV) {
    const transformed =
      await __globalServer.environments.client.transformRequest(
        '/src/css-server.css?direct',
      )
    return transformed.code
  } else {
    let result: string[] = []
    for await (const x of await fs.promises.opendir(
      new URL('./assets', import.meta.url),
    )) {
      if (x.name.endsWith('.css')) {
        result.push(
          await fs.promises.readFile(path.join(x.path, x.name), 'utf-8'),
        )
      }
    }
    return result.join('\n')
  }
}
