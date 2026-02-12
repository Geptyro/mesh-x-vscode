import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
	plugins: [svelte()],
	build: {
		outDir: '../media',
		emptyOutDir: false,
		lib: {
			entry: 'src/main.js',
			name: 'FalcraEditor',
			formats: ['iife'],
			fileName: () => 'editor.js',
		},
		rollupOptions: {
			output: {
				assetFileNames: 'editor.[ext]',
			},
		},
		cssCodeSplit: false,
	},
})
