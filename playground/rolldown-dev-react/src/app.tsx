import { useState } from 'react'

export function App() {
  const [count, setCount] = useState(0)

  return (
    <div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          Count: {count}
        </button>
      </div>
    </div>
  )
}
