<script>
	import { editor } from '../stores/editor.svelte.js'
</script>

{#if editor.statusText}
	<div id="status-bar">{editor.statusText}</div>
{/if}
