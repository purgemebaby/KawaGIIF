import type { ReactNode } from 'react';

// Corner badge for zoom changes and errors; an error can also be clicked away.
function Toast({
	children,
	tone = 'info',
	onDismiss,
}: {
	children: ReactNode;
	tone?: 'info' | 'error';
	onDismiss?: () => void;
}) {
	const error = tone === 'error';
	return (
		<div
			role={error ? 'alert' : 'status'}
			onClick={onDismiss}
			style={{
				position: 'fixed',
				right: 'var(--kg-space-5)',
				// Sits above the info badge, so both can be up at once.
				bottom: error ? 'calc(var(--kg-space-5) * 3)' : 'var(--kg-space-5)',
				padding: 'var(--kg-space-2) var(--kg-space-3)',
				border: `1px solid ${error ? 'var(--kg-danger)' : 'var(--kg-border)'}`,
				borderRadius: 'var(--kg-radius-md)',
				background: 'var(--kg-bg-raised)',
				color: 'var(--kg-fg)',
				fontSize: 'var(--kg-text-md)',
				boxShadow: 'var(--kg-shadow-2)',
				pointerEvents: error ? 'auto' : 'none',
				cursor: error ? 'pointer' : undefined,
				zIndex: 50,
				animation: 'kg-fade-in var(--kg-dur-fast) var(--kg-ease-out)',
			}}
		>
			{children}
		</div>
	);
}

export default Toast;
