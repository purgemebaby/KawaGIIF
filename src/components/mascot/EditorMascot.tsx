import editorChibi from '../../assets/mascot/editor.png';
import { useMascotShown } from '../../hooks/useMascotShown';
import { t } from '../../i18n';
import type { Point } from '../../lib/sketch';
import SketchFrame from '../ui/SketchFrame';
import './Mascot.css';

// The bubble outline: the box fills the 100x56 viewBox, so it always fits the text; the tail dips below it, down-left at the chibi.
const BUBBLE: readonly Point[] = [
	[2, 10],
	[4, 4],
	[10, 2],
	[50, 2],
	[90, 2],
	[96, 4],
	[98, 10],
	[98, 46],
	[96, 54],
	[90, 56],
	[62, 56],
	[40, 56],
	[22, 68],
	[28, 56],
	[10, 56],
	[4, 54],
	[2, 46],
];

// `editor-canvas-hint` stays on the root: editorBurst fades it with the panels.
function EditorMascot() {
	const showMascot = useMascotShown();

	return (
		<div className="editor-canvas-hint editor-mascot">
			<p className="editor-mascot-bubble">
				<SketchFrame
					className="editor-mascot-bubble-frame"
					viewBox="0 0 100 56"
					seed="editor-bubble"
					points={BUBBLE}
					roughness={1.6}
				/>
				{t.editor.canvasHint}
			</p>
			{showMascot && (
				<div className="editor-mascot-peek" aria-hidden="true">
					<img
						className="editor-mascot-chibi"
						src={editorChibi}
						alt=""
						draggable={false}
						decoding="async"
					/>
				</div>
			)}
		</div>
	);
}

export default EditorMascot;
