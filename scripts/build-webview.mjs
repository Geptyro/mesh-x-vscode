import { build } from 'vite'

const watch = process.argv.includes('--watch')

await build({
	configFile: 'webview/vite.config.js',
	root: 'webview',
	build: {
		watch: watch ? {} : null,
		sourcemap: watch,
		minify: !watch,
	},
	logLevel: 'info',
})

if (watch) {
	console.log('Watching webview...')
}
