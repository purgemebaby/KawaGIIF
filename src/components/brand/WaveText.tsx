import type { ReactNode } from 'react';

interface WaveTextProps {
	children: string;
	className?: string;
	as?: 'span' | 'h1' | 'h2' | 'p';
	/** When false the letters hold still (the small logo keeps the title's look without the wave). */
	animated?: boolean;
}

// Each letter is its own inline-block span, where a plain space would collapse.
const NBSP = '\u00a0';

function WaveText({
	children,
	className,
	as: Tag = 'span',
	animated = true,
}: WaveTextProps) {
	const letters: ReactNode[] = [...children].map((char, i) => (
		<span key={i} style={{ ['--i' as string]: i }} aria-hidden="true">
			{char === ' ' ? NBSP : char}
		</span>
	));

	const classes = ['kg-wave'];
	if (!animated) classes.push('kg-wave--still');
	if (className) classes.push(className);

	return (
		<Tag className={classes.join(' ')} aria-label={children}>
			{letters}
		</Tag>
	);
}

export default WaveText;
