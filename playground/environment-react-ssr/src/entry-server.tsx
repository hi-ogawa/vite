import ReactDomServer from 'react-dom/server'
import type { Connect, ViteDevServer } from 'vite'
import testDep from '@vitejs/test-dep'
import Root from './root'

const handler: Connect.NextHandleFunction = async (_req, res) => {
  const url = new URL(_req.url!, 'http://localhost')
  if (url.pathname === '/late-discovery') {
    // simulate late discovery by importing new modules from virtual.
    // this can cuase double modules on first request handling and
    // response would look like
    //   {"entry":{"id":"heyzuawcitr"},"late":{"id":"autz5sutu1k"}}
    // @ts-expect-error no dts
    const mod = await import('virtual:late-discovery')
    res.setHeader('content-type', 'application/json').end(
      JSON.stringify({
        entry: testDep,
        late: mod.default,
      }),
    )
    return
  }
  const ssrHtml = ReactDomServer.renderToString(<Root />)
  let html = await importHtml()
  html = html.replace(/<body>/, `<body><div id="root">${ssrHtml}</div>`)
  res.setHeader('content-type', 'text/html').end(html)
}

export default handler

declare let __globalServer: ViteDevServer

async function importHtml() {
  if (import.meta.env.DEV) {
    const mod = await import('/index.html?raw')
    return __globalServer.transformIndexHtml('/', mod.default)
  } else {
    const mod = await import('/dist/client/index.html?raw')
    return mod.default
  }
}
