// Esbuild will recognize this file as CJS since it incldues bare `exports` variable access.
// Vite can counter against this behavior by injecting dummy `export {}` statement.
console.log(typeof exports)
