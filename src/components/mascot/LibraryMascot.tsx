import libraryChibi from '../../assets/mascot/library.webp';
import './Mascot.css';

interface LibraryMascotProps {
	/** Counts the imports so far. Every new value makes the camera flash again. */
	flashes: number;
}

/** Rises from the window's bottom-right corner and snaps its camera whenever media is imported. */
function LibraryMascot({ flashes }: LibraryMascotProps) {
	return (
		<div className="library-mascot" aria-hidden="true">
			<img src={libraryChibi} alt="" draggable={false} decoding="async" />
			{flashes > 0 && <span key={flashes} className="library-mascot-flash" />}
		</div>
	);
}

export default LibraryMascot;
