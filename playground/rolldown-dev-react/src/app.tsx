import React from 'react'
// @ts-expect-error no type
import virtualTest from 'virtual:test'
// @ts-expect-error no type
import testAlias from 'test-alias'
import { throwError } from './error'
import './test-style.css'
import testStyleInline from './test-style-inline.css?inline'
// TODO: hmr for url assets?
import testStyleUrl from './test-style-url.css?url'

// TODO: isolating finalizer doesn't rewrite yet
// const testAssetTxt = new URL('./test-asset.txt', import.meta.url).href;
// console.log(testAssetTxt);

export function App() {
  const [count, setCount] = React.useState(0)

  return (
    <div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          Count: {count}
        </button>
        <pre>[virtual] {virtualTest}</pre>
        <pre>[alias] {testAlias}</pre>
        <button onClick={() => throwError()}>stacktrace</button>
        <pre>
          [css] <span className="test-style">orange</span>
        </pre>
        <link rel="stylesheet" href={testStyleUrl} />
        <pre>
          [css?url] <span className="test-style-url">orange</span>
        </pre>
        <style>{testStyleInline}</style>
        <pre>
          [css?inline] <span className="test-style-inline">orange</span>
        </pre>
      </div>
    </div>
  )
}
