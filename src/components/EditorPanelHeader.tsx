import { useState } from 'react';
import editorHand from '../assets/mascot/editor-hand.webp';
import { useMascotShown } from '../hooks/useMascotShown';
import { navAnimationsOn } from '../lib/navAnimations';
import { t } from '../i18n';

interface PanelHeaderProps {
	title: string;
	collapsed: boolean;
	onToggle: () => void;
}

interface Hand {
	action: 'push' | 'pull';
	// a new key restarts the one-shot animation on a quick second click
	key: number;
}

// The chevron is drawn pointing right; CSS turns it towards where the panel will move.
function PanelHeader({ title, collapsed, onToggle }: PanelHeaderProps) {
	const [hand, setHand] = useState<Hand | null>(null);
	const showMascot = useMascotShown();

	const toggle = () => {
		onToggle();
		// the hand is the chibi's paw: no mascot, no hand, and animations off skip it too
		if (!showMascot || !navAnimationsOn()) return;
		// expanding pulls the panel open, collapsing pushes it shut
		setHand((prev) => ({
			action: collapsed ? 'pull' : 'push',
			key: (prev?.key ?? 0) + 1,
		}));
	};

	return (
		<header className="editor-panel-header">
			<h2>{title}</h2>
			<button
				type="button"
				className="editor-panel-tab"
				aria-expanded={!collapsed}
				aria-label={
					collapsed
						? t.editor.panels.expand(title)
						: t.editor.panels.collapse(title)
				}
				onClick={toggle}
			>
				<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
					<path
						d="M4 2l4 4-4 4"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.6"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</button>
			{hand && (
				<img
					key={hand.key}
					className="editor-panel-hand"
					data-action={hand.action}
					src={editorHand}
					alt=""
					draggable={false}
					aria-hidden="true"
					onAnimationEnd={() => setHand(null)}
				/>
			)}
		</header>
	);
}

export default PanelHeader;
