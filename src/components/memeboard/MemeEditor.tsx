import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../i18n';
import { invoke } from '../../lib/ipc';
import { notifyError } from '../../lib/notify';
import { isAudioType, isVideoType, type MediaItem } from '../../lib/media';
import {
	ANIMATION_KINDS,
	defaultAnimation,
	type Anchor,
	type Meme,
	type Preset,
	type Side,
} from '../../lib/memeboard';
import { useLibrary } from '../../context/LibraryProvider';
import { useEscape } from '../../hooks/useDismiss';
import MediaThumb from '../MediaThumb';
import { MODAL_ROOT_ID } from '../ui/Modal';
import Slider from '../ui/Slider';
import HotkeyField from './HotkeyField';
import MemePreview from './MemePreview';
import PathRecorder from './PathRecorder';
import BehaviourPanel from './BehaviourPanel';

interface MemeEditorProps {
	meme: Meme;
	isNew: boolean;
	maxMemeMs: number;
	presets: Preset[];
	onClose: () => void;
}

const SIDES: Side[] = ['left', 'right', 'top', 'bottom'];
const ANCHORS: Anchor['kind'][] = ['cursor', 'center', 'random'];
const DEFAULT_STILL_MS = 3000;

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Library items to pick from: visuals or cassettes, plus a "None" tile. */
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
			{items.map((item) => (
				<button
					key={item.id}
					type="button"
					className={`meme-picker-tile${selected === item.id ? ' active' : ''}`}
					title={item.original_file_name}
					disabled={disabled}
					onClick={() => onSelect(item.id)}
				>
					<MediaThumb item={item} preview alt={item.original_file_name} />
				</button>
			))}
		</div>
	);
}

/** The editor of one meme: what it shows and plays, how it moves, and its shortcut, with a live preview. */
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
	useEscape(true, onClose);

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
	// the length rule of memeboard.rs: the video's own sound, else the sound, else its own duration
	const soundLength = videoVisual
		? visual.has_audio
			? visual.duration_ms
			: undefined
		: sound?.duration_ms;
	const ownDuration =
		draft.duration_ms ??
		(visual?.media_type === 'gif' && visual.duration_ms
			? visual.duration_ms
			: DEFAULT_STILL_MS);
	const durationMs = Math.min(soundLength ?? ownDuration, maxMemeMs);

	const set = <K extends keyof Meme>(key: K, value: Meme[K]) =>
		setDraft((d) => ({ ...d, [key]: value }));

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

				<div className="meme-editor-body">
					<div className="meme-editor-fields">
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
							{videoVisual && <small>{editor.videoSound}</small>}
						</div>

						<div className="meme-field">
							<span>{editor.animation}</span>
							<div className="filter-types">
								{ANIMATION_KINDS.map((kind) => (
									<button
										key={kind}
										type="button"
										className={
											anim.kind === kind ? 'filter-type active' : 'filter-type'
										}
										aria-pressed={anim.kind === kind}
										onClick={() =>
											anim.kind !== kind &&
											set('animation', defaultAnimation(kind))
										}
									>
										{t.memeboard.animations[kind]}
									</button>
								))}
							</div>
							{anim.kind === 'cross' && (
								<div className="meme-subfield">
									<small>{editor.from}</small>
									<div className="filter-types">
										{SIDES.map((side) => (
											<button
												key={side}
												type="button"
												className={
													anim.from === side
														? 'filter-type active'
														: 'filter-type'
												}
												onClick={() =>
													set('animation', { kind: 'cross', from: side })
												}
											>
												{t.memeboard.sides[side]}
											</button>
										))}
									</div>
								</div>
							)}
							{anim.kind === 'path' && (
								<PathRecorder
									points={anim.points}
									maxMs={maxMemeMs}
									onRecorded={(points) =>
										set('animation', { kind: 'path', points })
									}
								/>
							)}
						</div>

						{anim.kind !== 'cross' &&
							anim.kind !== 'fall' &&
							anim.kind !== 'path' && (
								<div className="meme-field">
									<span>{editor.anchor}</span>
									<div className="filter-types">
										{ANCHORS.map((kind) => (
											<button
												key={kind}
												type="button"
												className={
													draft.anchor.kind === kind
														? 'filter-type active'
														: 'filter-type'
												}
												onClick={() => set('anchor', { kind } as Anchor)}
											>
												{t.memeboard.anchors[kind]}
											</button>
										))}
									</div>
								</div>
							)}

						<Slider
							label={editor.size}
							min={0.05}
							max={1}
							step={0.01}
							value={draft.size}
							format={(v) => `${Math.round(v * 100)} %`}
							onChange={(v) => set('size', v)}
						/>
						<Slider
							label={editor.volume}
							min={0}
							max={1}
							step={0.01}
							value={draft.volume}
							format={(v) => `${Math.round(v * 100)} %`}
							onChange={(v) => set('volume', v)}
						/>
						{soundLength !== undefined ? (
							<small className="meme-field-note">
								{editor.durationFromSound(seconds(soundLength))}
							</small>
						) : (
							<Slider
								label={editor.duration}
								min={500}
								max={maxMemeMs}
								step={100}
								value={Math.min(ownDuration, maxMemeMs)}
								format={seconds}
								onChange={(v) => set('duration_ms', v)}
							/>
						)}

						<div className="meme-field">
							<span>{editor.hotkey}</span>
							<HotkeyField
								value={draft.hotkey}
								memeId={draft.id}
								onChange={(hotkey) => set('hotkey', hotkey)}
								onValidity={setHotkeyOk}
							/>
						</div>

						<BehaviourPanel
							draft={draft}
							presets={presets}
							onChange={setDraft}
						/>
					</div>

					<div className="meme-editor-side">
						<span className="meme-editor-side-title">{editor.preview}</span>
						<MemePreview
							visual={visual}
							animation={draft.animation}
							anchor={draft.anchor}
							size={draft.size}
							durationMs={durationMs}
						/>
						<small className="meme-field-note">{t.memeboard.gameNote}</small>
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
