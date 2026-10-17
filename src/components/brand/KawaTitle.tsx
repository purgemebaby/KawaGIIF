import { t } from '../../i18n/en';
import WaveText from './WaveText';
import './KawaTitle.css';

interface KawaTitleProps {
	size?: string;
	/** When false the title holds still (used by the small section logo). */
	animated?: boolean;
}

function KawaTitle({ size = '72px', animated = true }: KawaTitleProps) {
	const text = t.app.name;
	const content = <WaveText animated={animated}>{text}</WaveText>;

	return (
		<div className="kg-title-wrap" style={{ fontSize: size }}>
			<span className="kg-title-layer kg-title-keyline" aria-hidden="true">
				{content}
			</span>
			<span className="kg-title-layer kg-title-fill" aria-hidden="true">
				{content}
			</span>
			<span className="kg-title-sr">{text}</span>
		</div>
	);
}

export default KawaTitle;
