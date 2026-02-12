import { mount } from 'svelte'
import App from './App.svelte'
import { initMessages, startListening } from './stores/messages.svelte.js'
import './global.css'

const vscode = acquireVsCodeApi()
initMessages(vscode)

mount(App, { target: document.getElementById('root') })

startListening()
