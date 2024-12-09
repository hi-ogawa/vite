import React from 'react'

export function DynamicImport() {
  const [value, setValue] = React.useState('???')

  return (
    <div className="test-dynamic-import">
      <button
        onClick={async () => {
          const dep = await import('./dynamic-import-dep')
          setValue(dep.default)
        }}
      >
        dynamic-import
      </button>{' '}
      <span>{value}</span>
    </div>
  )
}
