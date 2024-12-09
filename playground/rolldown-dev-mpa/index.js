import shared from './shared'

document.getElementById('root').innerHTML = `
  <p>Rendered by /index.js: ${Math.random().toString(36).slice(2)}</p>
  <pre>shared: ${shared}</pre>
`
