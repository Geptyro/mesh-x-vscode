let _vscode = null
const _handlers = new Map()

export function initMessages(vscodeApi) {
	_vscode = vscodeApi
}

export function postMessage(msg) {
	_vscode.postMessage(msg)
}

export function onMessage(type, handler) {
	if (!_handlers.has(type)) _handlers.set(type, [])
	_handlers.get(type).push(handler)
}

export function startListening() {
	window.addEventListener('message', (e) => {
		const msg = e.data
		const list = _handlers.get(msg.type)
		if (list) {
			for (const fn of list) fn(msg)
		}
	})
	postMessage({ type: 'ready' })
}
