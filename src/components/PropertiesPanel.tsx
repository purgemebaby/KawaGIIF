import { useEffect, useState } from 'react';
import { invoke } from '../lib/ipc';
import { loadPlacedMedia, type PlacedMedia } from '../lib/placed';
import { monitorIndexAt } from '../lib/monitors';
import { useMonitors } from '../hooks/useMonitors';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { STATIC_TYPES, type MediaType } from '../lib/media';
import { t } from '../i18n/en';
import Slider from './ui/Slider';
import MonitorSelect from './ui/MonitorSelect';

const DEFAULT_OPACITY = 1;
const DEFAULT_RATE = 1;

function PropertiesPanel({ selectedId }: { selectedId: string | null }) {
	const [placed, setPlaced] = useState<PlacedMedia | null>(null);
	const [mediaType, setMediaType] = useState<MediaType | null>(null);
	const monitors = useMonitors();

	// Keep the monitor picker right when the animation is dragged to another screen.
	useTauriEvent<string>('overlay-geometry-changed', async (instanceId) => {
		if (instanceId !== selectedId) return;
		const item = await invoke<PlacedMedia | null>('get_placed_media', {
			instanceId,
		});
		if (item) setPlaced(item);
	});

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

	const moveToMonitor = async (monitor: number) => {
		const moved = await invoke<PlacedMedia | null>('move_overlay_to_monitor', {
			instanceId: selectedId,
			monitor,
		});
		if (moved) setPlaced(moved);
	};

	const currentMonitor = monitorIndexAt(
		monitors,
		placed.x + placed.width / 2,
		placed.y + placed.height / 2,
	);

	const resetProperties = () => {
		setOpacity(DEFAULT_OPACITY);
		if (supportsSpeed) setPlaybackRate(DEFAULT_RATE);
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

			<MonitorSelect
				monitors={monitors}
				value={currentMonitor}
				label={t.editor.monitor.moveLabel}
				hint={t.editor.monitor.moveHint}
				onChange={moveToMonitor}
			/>

			<button
				type="button"
				className="kg-btn kg-btn--secondary kg-btn--sm"
				onClick={resetProperties}
				title={t.properties.resetHint}
			>
				{t.properties.reset}
			</button>

			<button
				type="button"
				className="kg-btn kg-btn--danger kg-btn--sm"
				onClick={() =>
					invoke('remove_placed_media', { instanceId: selectedId })
				}
			>
				{t.editor.removeItem}
			</button>
		</div>
	);
}

export default PropertiesPanel;
