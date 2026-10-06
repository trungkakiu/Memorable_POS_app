import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/inter/index.css'
import '@fontsource-variable/inter/wght.css'
import './styles/tailwind.css'
import './styles/main.scss'
import App from './App'
import { bootstrapAuth } from './store/auth'
import { installWebShim } from './lib/webShim'

if (import.meta.env.DEV) installWebShim()

bootstrapAuth().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><App /></React.StrictMode>,
  )
})
