import { useRef } from 'react';
import { invoke } from '../lib/ipc';
import { loadPlacedMedia, type PlacedMedia } from '../lib/placed';
import { STATIC_TYPES } from '../lib/media';
import { usePlacedMedia } from '../hooks/usePlacedMedia';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { t } from '../i18n';
import Slider from './ui/Slider';
import SketchIcon from './ui/SketchIcon';

/** Right angles pull a rotation within a few degrees onto themselves. */
const SNAP_ANGLES = [-180, -90, 0, 90, 180];
// geometry events this soon after a slider move are its own echo, not a turn made on the desktop
const ECHO_MS = 400;

function snapRotation(rotation: number): number {
	return SNAP_ANGLES.find((a) => Math.abs(rotation - a) <= 4) ?? rotation;
}

function PropertiesPanel({
	selectedId,
	onEdited,
}: {
	selectedId: string | null;
	onEdited?: () => void;
}) {
	const {
		item: placed,
		setItem: setPlaced,
		mediaType,
	} = usePlacedMedia(selectedId);
	const sliderMovedAt = useRef(0);

	// the rotate sphere on the desktop turns the item too: the slider follows it
	useTauriEvent<string>('overlay-geometry-changed', (id) => {
		if (id !== selectedId) return;
		if (performance.now() - sliderMovedAt.current < ECHO_MS) return;
		loadPlacedMedia(id).then((loaded) => {
			if (loaded) setPlaced(loaded.item);
		});
	});

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
		onEdited?.();
	};

	const setPlaybackRate = (rate: number) => {
		setPlaced({ ...placed, playback_rate: rate });
		invoke('set_item_playback_rate', {
			instanceId: selectedId,
			playbackRate: rate,
		});
		onEdited?.();
	};

	const setRotation = (rotation: number) => {
		const snapped = snapRotation(rotation);
		sliderMovedAt.current = performance.now();
		setPlaced({ ...placed, rotation: snapped });
		invoke('set_item_rotation', { instanceId: selectedId, rotation: snapped });
		onEdited?.();
	};

	const resetProperties = async () => {
		const reset = await invoke<PlacedMedia | null>('reset_placed_media', {
			instanceId: selectedId,
		});
		if (reset) setPlaced(reset);
		onEdited?.();
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
				onReset={() => setOpacity(1)}
				resetLabel={t.properties.resetOne(t.properties.opacity)}
			/>

			{supportsSpeed && (
				<Slider
					label={t.properties.speed}
					min={0.25}
					max={3}
					step={0.05}
					value={placed.playback_rate ?? 1}
					format={(v) => `${v.toFixed(2)}x`}
					onChange={setPlaybackRate}
					onReset={() => setPlaybackRate(1)}
					resetLabel={t.properties.resetOne(t.properties.speed)}
				/>
			)}

			<Slider
				label={t.properties.rotation}
				min={-180}
				max={180}
				step={1}
				value={placed.rotation}
				format={(v) => `${Math.round(v)}°`}
				onChange={setRotation}
				onReset={() => setRotation(0)}
				resetLabel={t.properties.resetOne(t.properties.rotation)}
			/>

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
					className="kg-btn kg-btn--danger kg-btn--sm icon-hover"
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
