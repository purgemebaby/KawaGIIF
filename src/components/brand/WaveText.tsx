import type { ReactNode } from 'react';

interface WaveTextProps {
	children: string;
	className?: string;
	as?: 'span' | 'h1' | 'h2' | 'p';
}

// Each letter is its own inline-block span, where a plain space would collapse.
const NBSP = '\u00a0';

function WaveText({ children, className, as: Tag = 'span' }: WaveTextProps) {
	const letters: ReactNode[] = [...children].map((char, i) => (
		<span key={i} style={{ ['--i' as string]: i }} aria-hidden="true">
			{char === ' ' ? NBSP : char}
		</span>
	));

	return (
		<Tag
			className={className ? `kg-wave ${className}` : 'kg-wave'}
			aria-label={children}
		>
			{letters}
		</Tag>
	);
}

export default WaveText;
