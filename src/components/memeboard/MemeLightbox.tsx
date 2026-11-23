import { createPortal } from 'react-dom';
import { t } from '../../i18n';
import { isVideoType, type MediaItem } from '../../lib/media';
import type { Trim } from '../../lib/memeboard';
import { useMediaFiles } from '../../hooks/useMediaFiles';
import { useEscape } from '../../hooks/useDismiss';
import GifCanvasPlayer from '../GifCanvasPlayer';
import { MODAL_ROOT_ID } from '../ui/Modal';
import { TrimmedVideo } from './MemeLayer';

interface MemeLightboxProps {
	name: string;
	visual: MediaItem;
	/** A video plays only its chosen part, as it does on the stage. */
	trim: Trim | null;
	onClose: () => void;
}

/** A meme's visual blown up over the Memeboard, moving; a click anywhere or Escape closes it. */
function MemeLightbox({ name, visual, trim, onClose }: MemeLightboxProps) {
	const { url } = useMediaFiles(visual);
	useEscape(true, onClose, true);

	return createPortal(
		<div className="modal-backdrop meme-lightbox" onClick={onClose}>
			<figure
				className="meme-lightbox-frame"
				role="dialog"
				aria-modal="true"
				aria-label={name}
			>
				{url &&
					(isVideoType(visual.media_type) ? (
						<TrimmedVideo
							url={url}
							speed={1}
							trim={trim}
							onNatural={() => {}}
						/>
					) : visual.media_type === 'gif' ? (
						<GifCanvasPlayer
							src={url}
							speedMultiplier={1}
							className="meme-lightbox-media"
						/>
					) : (
						<img src={url} alt={name} draggable={false} />
					))}
				<figcaption>
					{name}
					<small>{t.memeboard.card.closeHint}</small>
				</figcaption>
			</figure>
		</div>,
		document.getElementById(MODAL_ROOT_ID) ?? document.body,
	);
}

export default MemeLightbox;
