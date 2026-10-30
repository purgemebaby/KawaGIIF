import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../i18n';
import { invoke } from '../../lib/ipc';
import { notifyError } from '../../lib/notify';
import { isAudioType, isVideoType, type MediaItem } from '../../lib/media';
import {
	ANIMATION_KINDS,
	POP_MS_RANGE,
	SPEED_RANGE,
	defaultAnimation,
	type Anchor,
	type Animation,
	type Meme,
	type Preset,
	type Side,
} from '../../lib/memeboard';
import { useLibrary } from '../../context/LibraryProvider';
import { useEscape } from '../../hooks/useDismiss';
import MediaThumb from '../MediaThumb';
import SettingsToggle from '../settings/SettingsToggle';
import ChoiceChips from '../ui/ChoiceChips';
import InfoTip from '../ui/InfoTip';
import { MODAL_ROOT_ID } from '../ui/Modal';
import Slider from '../ui/Slider';
import BehaviourPanel from './BehaviourPanel';
import HotkeyField from './HotkeyField';
import MemePreview from './MemePreview';
import PathRecorder from './PathRecorder';
import StyleRow from './StyleRow';

interface MemeEditorProps {
	meme: Meme;
	isNew: boolean;
	maxMemeMs: number;
	presets: Preset[];
	onClose: () => void;
}

/** A monitor as `list_monitors` reports it. */
interface MonitorInfo {
	name: string;
	width: number;
	height: number;
	primary: boolean;
}

const SIDES: readonly Side[] = ['left', 'right', 'top', 'bottom'];
const ANCHORS: readonly Anchor['kind'][] = ['cursor', 'center', 'random'];
const DEFAULT_STILL_MS = 3000;
const MIN_TIME_MS = 500;
// until list_monitors answers (or in the browser preview): no name, so nothing gets pinned to it
const FALLBACK_MONITOR: MonitorInfo = {
	name: '',
	width: 1920,
	height: 1080,
	primary: true,
};
/** Animations that follow the "Appears at" anchor; the others place themselves. */
const ANCHORED = new Set<Animation['kind']>([
	'pop',
	'static',
	'dvd_bounce',
	'bounce',
	'shake',
]);

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const times = (v: number) => `× ${v.toFixed(2)}`;
const percent = (v: number) => `${Math.round(v * 100)} %`;

/** A titled block of the editor, the same card as a Settings section. */
function Block({
	title,
	extra,
	children,
}: {
	title: string;
	extra?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="meme-block">
			<header className="meme-block-title">
				<h4>{title}</h4>
				{extra}
			</header>
			{children}
		</section>
	);
}

/** Library items to pick from: visuals or cassettes, plus a "None" tile. Only the chosen tile moves or plays. */
function MediaPicker({
	items,
	selected,
	onSelect,
	disabled,
}: {
	items: MediaItem[];
	selected: string | null;
	onSelect: (id: string | null) => void;
	disabled?: boolean;
}) {
	return (
		<div className={`meme-picker${disabled ? ' is-disabled' : ''}`}>
			<button
				type="button"
				className={`meme-picker-tile meme-picker-none${selected === null ? ' active' : ''}`}
				disabled={disabled}
				onClick={() => onSelect(null)}
			>
				{t.memeboard.editor.none}
			</button>
			{items.map((item) => {
				const chosen = selected === item.id;
				return (
					<div
						key={item.id}
						role="button"
						tabIndex={disabled ? -1 : 0}
						aria-pressed={chosen}
						aria-disabled={disabled}
						className={`meme-picker-tile${chosen ? ' active' : ''}`}
						title={item.original_file_name}
						onClick={() => !disabled && onSelect(item.id)}
						onKeyDown={(e) => {
							if (disabled || (e.key !== 'Enter' && e.key !== ' ')) return;
							e.preventDefault();
							onSelect(item.id);
						}}
					>
						<MediaThumb
							item={item}
							still={!chosen}
							playable={!disabled && chosen}
							alt={item.original_file_name}
						/>
					</div>
				);
			})}
		</div>
	);
}

/** The editor of one meme: what it shows and plays, how it moves, its shortcut, with a live preview. */
function MemeEditor({
	meme,
	isNew,
	maxMemeMs,
	presets,
	onClose,
}: MemeEditorProps) {
	const { items } = useLibrary();
	const [draft, setDraft] = useState<Meme>(meme);
	const [hotkeyOk, setHotkeyOk] = useState(true);
	const [saving, setSaving] = useState(false);
	const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
	useEscape(true, onClose);

	useEffect(() => {
		invoke<MonitorInfo[]>('list_monitors')
			.then((list) => setMonitors(list ?? []))
			.catch(() => setMonitors([]));
	}, []);

	const visuals = useMemo(
		() => items.filter((i) => !isAudioType(i.media_type) && !i.missing),
		[items],
	);
	const sounds = useMemo(
		() => items.filter((i) => isAudioType(i.media_type) && !i.missing),
		[items],
	);
	const visual = visuals.find((i) => i.id === draft.visual) ?? null;
	const sound = sounds.find((i) => i.id === draft.audio) ?? null;
	const videoVisual = visual !== null && isVideoType(visual.media_type);

	// the length rule of memeboard.rs: the video's own sound, else the sound, else one GIF loop, at the playback speed
	const mediaMs = videoVisual
		? visual.has_audio
			? visual.duration_ms
			: undefined
		: (sound?.duration_ms ??
			(visual?.media_type === 'gif' ? visual.duration_ms : undefined));
	const naturalMs = mediaMs
		? Math.round(mediaMs / draft.playback_speed)
		: DEFAULT_STILL_MS;
	const durationMs = Math.min(
		maxMemeMs,
		Math.max(MIN_TIME_MS, draft.duration_ms ?? naturalMs),
	);

	// the meme's monitor; one that is gone, or none picked yet, means the primary one
	const chosen = draft.monitor.kind === 'named' ? draft.monitor.name : null;
	const screen =
		monitors.find((m) => m.name === chosen) ??
		monitors.find((m) => m.primary) ??
		FALLBACK_MONITOR;

	// the list has no "wherever the cursor is": once the monitors are known, pin the meme to one of them
	useEffect(() => {
		if (!screen.name || screen.name === chosen) return;
		setDraft((d) => ({ ...d, monitor: { kind: 'named', name: screen.name } }));
	}, [screen, chosen]);

	const set = <K extends keyof Meme>(key: K, value: Meme[K]) =>
		setDraft((d) => ({ ...d, [key]: value }));
	const setAnimation = (animation: Animation) => set('animation', animation);

	const hasMedia = visual !== null || (sound !== null && !videoVisual);
	const canSave = hasMedia && hotkeyOk && draft.name.trim() !== '' && !saving;

	const save = async () => {
		setSaving(true);
		try {
			await invoke('save_meme', { meme: draft });
			onClose();
		} catch (e) {
			notifyError(e);
			setSaving(false);
		}
	};

	const anim = draft.animation;
	const editor = t.memeboard.editor;
	const options = t.memeboard.options;
	const isPath = anim.kind === 'path';

	const preview = (
		<Block
			title={editor.preview}
			extra={
				<InfoTip text={t.memeboard.gameNote} label={t.memeboard.infoLabel} />
			}
		>
			<MemePreview
				visual={visual}
				animation={anim}
				anchor={draft.anchor}
				size={draft.size}
				durationMs={durationMs}
				maxMs={maxMemeMs}
				motionSpeed={draft.motion_speed}
				playbackSpeed={draft.playback_speed}
				aspect={screen.width / screen.height}
				onPathDrawn={
					isPath
						? (points) => setAnimation({ kind: 'path', points })
						: undefined
				}
			/>
			{isPath && (
				<PathRecorder
					points={anim.points}
					onClear={() => setAnimation({ kind: 'path', points: [] })}
				/>
			)}
		</Block>
	);

	// where along the other axis a crossing or a fall goes, shown in px of the meme's monitor
	const positionSlider = (
		at: number,
		vertical: boolean,
		onAt: (at: number) => void,
	) => {
		const length = vertical ? screen.height : screen.width;
		return (
			<Slider
				label={vertical ? editor.heightAt : editor.widthAt}
				min={0}
				max={1}
				step={0.01}
				value={at}
				format={(v) => editor.pxOf(Math.round(v * length), length)}
				onChange={onAt}
			/>
		);
	};

	const animationOptions = (() => {
		switch (anim.kind) {
			case 'pop':
				return (
					<>
						<Slider
							label={options.popIn}
							min={POP_MS_RANGE[0]}
							max={POP_MS_RANGE[1]}
							step={20}
							value={anim.enter_ms}
							format={(ms) => `${ms} ms`}
							onChange={(enter_ms) => setAnimation({ ...anim, enter_ms })}
						/>
						<Slider
							label={options.popOut}
							min={POP_MS_RANGE[0]}
							max={POP_MS_RANGE[1]}
							step={20}
							value={anim.exit_ms}
							format={(ms) => `${ms} ms`}
							onChange={(exit_ms) => setAnimation({ ...anim, exit_ms })}
						/>
					</>
				);
			case 'shake':
				return (
					<Slider
						label={options.intensity}
						min={0.05}
						max={1}
						step={0.05}
						value={anim.intensity}
						format={percent}
						onChange={(intensity) => setAnimation({ ...anim, intensity })}
					/>
				);
			case 'dvd_bounce':
				return (
					<SettingsToggle
						checked={anim.colors}
						text={{ label: options.dvdColors }}
						onChange={(colors) => setAnimation({ ...anim, colors })}
					/>
				);
			case 'cross':
				return (
					<>
						<div className="meme-field">
							<span>{editor.from}</span>
							<ChoiceChips
								options={SIDES}
								value={anim.from}
								label={(side) => t.memeboard.sides[side]}
								onChange={(from) => setAnimation({ ...anim, from })}
							/>
						</div>
						{positionSlider(
							anim.at,
							anim.from === 'left' || anim.from === 'right',
							(at) => setAnimation({ ...anim, at }),
						)}
					</>
				);
			case 'fall':
				return positionSlider(anim.at, false, (at) =>
					setAnimation({ ...anim, at }),
				);
			default:
				return null;
		}
	})();

	return createPortal(
		<div className="modal-backdrop" onClick={onClose}>
			<div
				className="modal meme-editor"
				role="dialog"
				aria-modal="true"
				aria-label={isNew ? editor.titleNew : editor.titleEdit}
				onClick={(e) => e.stopPropagation()}
			>
				<h3 className="modal-title">
					{isNew ? editor.titleNew : editor.titleEdit}
				</h3>

				<StyleRow draft={draft} presets={presets} onChange={setDraft} />

				{/* drawing a path wants room: the preview takes the whole width */}
				{isPath && <div className="meme-editor-wide">{preview}</div>}

				<div className="meme-editor-body">
					<div className="meme-editor-column">
						<Block title={editor.media}>
							<label className="meme-field">
								<span>{editor.name}</span>
								<input
									className="filter-search"
									value={draft.name}
									maxLength={60}
									onChange={(e) => set('name', e.target.value)}
								/>
							</label>
							<div className="meme-field">
								<span>{editor.visual}</span>
								<MediaPicker
									items={visuals}
									selected={draft.visual}
									onSelect={(id) => set('visual', id)}
								/>
							</div>
							<div className="meme-field">
								<span>{editor.sound}</span>
								<MediaPicker
									items={sounds}
									selected={draft.audio}
									onSelect={(id) => set('audio', id)}
									disabled={videoVisual}
								/>
								{videoVisual && (
									<small className="meme-field-note">{editor.videoSound}</small>
								)}
							</div>
						</Block>

						<Block title={editor.animation}>
							<ChoiceChips
								options={ANIMATION_KINDS}
								value={anim.kind}
								label={(kind) => t.memeboard.animations[kind]}
								onChange={(kind) => setAnimation(defaultAnimation(kind))}
								ariaLabel={editor.animation}
							/>
							{ANCHORED.has(anim.kind) && (
								<div className="meme-field">
									<span>{editor.anchor}</span>
									<ChoiceChips
										options={ANCHORS}
										value={
											draft.anchor.kind === 'fixed'
												? 'center'
												: draft.anchor.kind
										}
										label={(kind) => t.memeboard.anchors[kind]}
										onChange={(kind) => set('anchor', { kind } as Anchor)}
									/>
								</div>
							)}
						</Block>

						<Block title={editor.hotkey}>
							<HotkeyField
								value={draft.hotkey}
								memeId={draft.id}
								onChange={(hotkey) => set('hotkey', hotkey)}
								onValidity={setHotkeyOk}
								hint={false}
							/>
							<BehaviourPanel
								behaviour={draft.behaviour}
								onChange={(behaviour) => set('behaviour', behaviour)}
							/>
						</Block>
					</div>

					<div className="meme-editor-column">
						{!isPath && preview}

						{animationOptions && (
							<Block title={editor.options}>{animationOptions}</Block>
						)}

						<Block title={editor.playback}>
							<label className="meme-field">
								<span>{editor.monitor}</span>
								<select
									className="filter-search"
									value={screen.name}
									onChange={(e) =>
										set('monitor', { kind: 'named', name: e.target.value })
									}
								>
									{monitors.map((m) => (
										<option key={m.name} value={m.name}>
											{editor.monitorName(
												m.name.replace(/^\\\\\.\\/, ''),
												m.width,
												m.height,
											)}
										</option>
									))}
								</select>
							</label>
							<Slider
								label={editor.size}
								min={0.05}
								max={1}
								step={0.01}
								value={draft.size}
								format={percent}
								onChange={(v) => set('size', v)}
							/>
							<Slider
								label={editor.motionSpeed}
								min={SPEED_RANGE[0]}
								max={SPEED_RANGE[1]}
								step={0.05}
								value={draft.motion_speed}
								format={times}
								onChange={(v) => set('motion_speed', v)}
								onReset={() => set('motion_speed', 1)}
								resetLabel={editor.motionSpeed}
							/>
							<Slider
								label={editor.playbackSpeed}
								min={SPEED_RANGE[0]}
								max={SPEED_RANGE[1]}
								step={0.05}
								value={draft.playback_speed}
								format={times}
								onChange={(v) => set('playback_speed', v)}
								onReset={() => set('playback_speed', 1)}
								resetLabel={editor.playbackSpeed}
							/>
							<Slider
								label={editor.time}
								min={MIN_TIME_MS}
								max={maxMemeMs}
								step={100}
								value={durationMs}
								format={seconds}
								onChange={(v) => set('duration_ms', v)}
								// back to "as long as its sound"
								onReset={() => set('duration_ms', null)}
								resetLabel={editor.time}
								info={
									<InfoTip
										text={editor.timeInfo}
										label={t.memeboard.infoLabel}
									/>
								}
							/>
							<Slider
								label={editor.volume}
								min={0}
								max={1}
								step={0.01}
								value={draft.volume}
								format={percent}
								onChange={(v) => set('volume', v)}
							/>
						</Block>
					</div>
				</div>

				<div className="modal-actions">
					{!hasMedia && (
						<small className="meme-editor-warning">{editor.needsMedia}</small>
					)}
					<button
						type="button"
						className="kg-btn kg-btn--secondary"
						onClick={onClose}
					>
						{t.common.cancel}
					</button>
					<button
						type="button"
						className="kg-btn kg-btn--primary"
						disabled={!canSave}
						onClick={save}
					>
						{editor.save}
					</button>
				</div>
			</div>
		</div>,
		document.getElementById(MODAL_ROOT_ID) ?? document.body,
	);
}

export default MemeEditor;
