// Transient badge shown for about 1 s after a zoom change.
function ZoomToast({ zoom }: { zoom: number }) {
	return (
		<div
			style={{
				position: 'fixed',
				right: 'var(--kg-space-5)',
				bottom: 'var(--kg-space-5)',
				padding: 'var(--kg-space-2) var(--kg-space-3)',
				border: '1px solid var(--kg-border)',
				borderRadius: 'var(--kg-radius-md)',
				background: 'var(--kg-bg-raised)',
				color: 'var(--kg-fg)',
				fontSize: 'var(--kg-text-md)',
				boxShadow: 'var(--kg-shadow-2)',
				pointerEvents: 'none',
				zIndex: 50,
				animation: 'kg-fade-in var(--kg-dur-fast) var(--kg-ease-out)',
			}}
		>
			{Math.round(zoom * 100)} %
		</div>
	);
}

export default ZoomToast;
