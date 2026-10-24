import { useEffect, useState } from 'react';
import { invoke } from '../lib/ipc';
import { loadPlacedMedia, type PlacedMedia } from '../lib/placed';
import { STATIC_TYPES, type MediaType } from '../lib/media';
import { t } from '../i18n';
import Slider from './ui/Slider';
import SketchIcon from './ui/SketchIcon';

const DEFAULT_RATE = 1;

function PropertiesPanel({ selectedId }: { selectedId: string | null }) {
	const [placed, setPlaced] = useState<PlacedMedia | null>(null);
	const [mediaType, setMediaType] = useState<MediaType | null>(null);

	useEffect(() => {
		if (!selectedId) {
			setPlaced(null);
			setMediaType(null);
			return;
		}
		let cancelled = false;
		loadPlacedMedia(selectedId).then((result) => {
			if (cancelled || !result) return;
			setPlaced(result.item);
			setMediaType(result.mediaType);
		});
		return () => {
			cancelled = true;
		};
	}, [selectedId]);

	if (!selectedId || !placed) {
		return (
			<div className="properties-panel">
				<p className="empty-state">{t.properties.empty}</p>
			</div>
		);
	}

	const supportsSpeed = mediaType !== null && !STATIC_TYPES.includes(mediaType);

	const setOpacity = (opacity: number) => {
		setPlaced({ ...placed, opacity });
		invoke('set_item_opacity', { instanceId: selectedId, opacity });
	};

	const setPlaybackRate = (rate: number) => {
		setPlaced({ ...placed, playback_rate: rate });
		invoke('set_item_playback_rate', {
			instanceId: selectedId,
			playbackRate: rate,
		});
	};

	const resetProperties = async () => {
		const reset = await invoke<PlacedMedia | null>('reset_placed_media', {
			instanceId: selectedId,
		});
		if (reset) setPlaced(reset);
	};

	return (
		<div className="properties-panel">
			<Slider
				label={t.properties.opacity}
				min={0.1}
				max={1}
				step={0.05}
				value={placed.opacity}
				format={(v) => `${Math.round(v * 100)}%`}
				onChange={setOpacity}
			/>

			{supportsSpeed && (
				<Slider
					label={t.properties.speed}
					min={0.25}
					max={3}
					step={0.05}
					value={placed.playback_rate ?? DEFAULT_RATE}
					format={(v) => `${v.toFixed(2)}x`}
					onChange={setPlaybackRate}
				/>
			)}

			<button
				type="button"
				className="kg-btn kg-btn--secondary kg-btn--sm properties-reset"
				onClick={resetProperties}
				title={t.properties.resetHint}
			>
				{t.properties.reset}
			</button>
			<div className="properties-danger">
				<button
					type="button"
					className="kg-btn kg-btn--danger kg-btn--sm pixel-hover"
					onClick={() =>
						invoke('remove_placed_media', { instanceId: selectedId })
					}
				>
					<SketchIcon name="trash" />
					{t.editor.removeItem}
				</button>
			</div>
		</div>
	);
}

export default PropertiesPanel;
