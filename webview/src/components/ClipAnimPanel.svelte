<script>
	import { anim } from '../stores/animation.svelte.js'
</script>

{#each anim.clipActions as item}
	<div class="anim-row">
		<span class="anim-name">{item.name}</span>
		<button class="anim-btn" onclick={() => {
			if (item.action.isRunning()) {
				item.action.stop()
			} else {
				item.action.play()
			}
		}}>
			{item.action.isRunning() ? 'Stop' : 'Play'}
		</button>
	</div>
{/each}

<style>
	.anim-row {
		padding: 4px 12px;
		font-size: 11px;
		color: var(--vscode-foreground, #ccc);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 4px;
	}
	.anim-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.anim-btn {
		flex-shrink: 0;
		padding: 1px 6px;
		font-size: 10px;
		background: var(--vscode-button-secondaryBackground, #3a3a3a);
		color: var(--vscode-button-secondaryForeground, #ccc);
		border: none;
		border-radius: 2px;
		cursor: pointer;
	}
	.anim-btn:hover {
		background: var(--vscode-button-secondaryHoverBackground, #454545);
	}
</style>
