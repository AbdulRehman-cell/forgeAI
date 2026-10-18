import { useEffect, useState } from 'react'

function getStored(): 'light' | 'dark' {
  try {
    const v = localStorage.getItem('forge-theme')
    if (v === 'dark' || v === 'light') return v
  } catch {}
  return 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getStored)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try { localStorage.setItem('forge-theme', theme) } catch {}
  }, [theme])

  return {
    theme,
    isDark: theme === 'dark',
    toggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark'),
  }
}
