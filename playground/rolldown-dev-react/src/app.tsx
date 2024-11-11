import { useState } from 'react'
// @ts-expect-error no type
import virtualTest from 'virtual:test'
// @ts-expect-error no type
import testAlias from 'test-alias'

export function App() {
  const [count, setCount] = useState(0)

  return (
    <div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          Count: {count}
        </button>
        <pre>[virtual] {virtualTest}</pre>
        <pre>[alias] {testAlias}</pre>
      </div>
    </div>
  )
}
