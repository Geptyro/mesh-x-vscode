<script module>
	const _collapsedSections = new Map()
</script>

<script>
	let { title, id, children } = $props()

	let isCollapsed = $state(_collapsedSections.get(id) || false)

	function toggle() {
		isCollapsed = !isCollapsed
		_collapsedSections.set(id, isCollapsed)
	}
</script>

<div class="panel-header collapsible" onclick={toggle}>
	<span class="collapse-chevron">{isCollapsed ? '\u25B8' : '\u25BE'}</span>
	{title}
</div>
{#if !isCollapsed}
	<div class="panel-section-content">
		{@render children()}
	</div>
{/if}

<style>
	.panel-header {
		padding: 10px 12px;
		font-weight: 600;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--vscode-sideBarTitle-foreground, #bbb);
		border-bottom: 1px solid var(--vscode-panel-border, #333);
	}
	.panel-header.collapsible {
		cursor: pointer;
		user-select: none;
	}
	.panel-header.collapsible:hover {
		background: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.04));
	}
	.collapse-chevron {
		display: inline-block;
		width: 10px;
		font-size: 10px;
	}
</style>
