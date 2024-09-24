import { createServer, createServerModuleRunner } from 'vite'

async function main() {
  const server = await createServer({
    root: import.meta.dirname,
  })
  const runner = createServerModuleRunner(server.environments.ssr)
  globalThis.log = (...msg) => console.log('[mock-logger]', ...msg)
  globalThis.__HMR__ = {}
  await runner.import('/hmr.ts')
}

main()
