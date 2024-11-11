import { useState } from 'react'
// @ts-expect-error no type
import virtualTest from 'virtual:test'

export function App() {
  const [count, setCount] = useState(0)

  return (
    <div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          Count: {count}
        </button>
        <pre>[virtual:test] {virtualTest}</pre>
      </div>
    </div>
  )
}
