import { useMemo, useState } from 'react';
import { t } from '../../i18n';
import { invoke } from '../../lib/ipc';
import { notifyError } from '../../lib/notify';
import type { MediaItem } from '../../lib/media';
import { displayHotkey, type Meme, type MemeView } from '../../lib/memeboard';
import { useLibrary } from '../../context/LibraryProvider';
import { useMemeboard } from '../../hooks/useMemeboard';
import { useTauriEvent } from '../../hooks/useTauriEvent';
import MediaThumb from '../MediaThumb';
import Modal from '../ui/Modal';
import SketchIcon from '../ui/SketchIcon';
import Toast from '../ui/Toast';
import WaveText from '../brand/WaveText';
import MemeEditor from './MemeEditor';
import MemeboardSettings from './MemeboardSettings';
import Podium from './Podium';
import './MemeboardScreen.css';

type Tab = 'memes' | 'podium';

interface Editing {
	meme: Meme;
	isNew: boolean;
}

const REJECTED_TOAST_MS = 4000;

function MemeCard({
	meme,
	visual,
	audio,
	onEdit,
	onDelete,
}: {
	meme: MemeView;
	visual: MediaItem | undefined;
	audio: MediaItem | undefined;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const card = t.memeboard.card;
	const shown = visual ?? audio;
	return (
		<article className="meme-card">
			<div className="meme-card-thumb">
				{shown ? (
					<MediaThumb item={shown} alt={meme.name} />
				) : (
					<SketchIcon name="laugh" size={48} />
				)}
				{!visual && audio && (
					<span className="meme-card-badge">{card.onlySound}</span>
				)}
			</div>
			<div className="meme-card-body">
				<h3 className="meme-card-name" title={meme.name}>
					{meme.name}
				</h3>
				<p className="meme-card-meta">
					{t.memeboard.animations[meme.animation.kind]}
				</p>
				<span
					className={`meme-hotkey${meme.hotkey_conflict ? ' is-conflict' : ''}${meme.hotkey ? '' : ' is-empty'}`}
					title={meme.hotkey_conflict ? card.conflict : undefined}
				>
					{meme.hotkey ? displayHotkey(meme.hotkey) : card.noHotkey}
				</span>
			</div>
			<div className="meme-card-actions">
				<button
					type="button"
					className="kg-btn kg-btn--primary kg-btn--sm"
					onClick={() =>
						invoke('fire_meme', { id: meme.id }).catch(notifyError)
					}
				>
					▶ {card.test}
				</button>
				<button
					type="button"
					className="kg-btn kg-btn--secondary kg-btn--sm icon-hover"
					onClick={onEdit}
				>
					<SketchIcon name="pencil" />
					{card.edit}
				</button>
				<button
					type="button"
					className="kg-btn kg-btn--ghost kg-btn--sm icon-hover"
					aria-label={card.delete}
					title={card.delete}
					onClick={onDelete}
				>
					<SketchIcon name="trash" />
				</button>
			</div>
		</article>
	);
}

/** The Memeboard section: the memes with their shortcuts, the podium of the most used, and the sound settings. */
function MemeboardScreen() {
	const { view } = useMemeboard();
	const { items } = useLibrary();
	const [tab, setTab] = useState<Tab>('memes');
	const [editing, setEditing] = useState<Editing | null>(null);
	const [deleting, setDeleting] = useState<MemeView | null>(null);
	const [rejected, setRejected] = useState<string | null>(null);

	const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

	useTauriEvent<string>('meme-rejected', (reason) => {
		setRejected(t.memeboard.rejected(reason));
		window.setTimeout(() => setRejected(null), REJECTED_TOAST_MS);
	});

	const createMeme = async () => {
		try {
			const name = t.memeboard.defaultName((view?.memes.length ?? 0) + 1);
			const meme = await invoke<Meme>('new_meme', { name });
			setEditing({ meme, isNew: true });
		} catch (e) {
			notifyError(e);
		}
	};

	if (!view) return <p className="empty-state">{t.common.loading}</p>;

	const memeboard = t.memeboard;
	return (
		<div className="memeboard-screen">
			<div className="storage-header">
				<h1>{memeboard.title}</h1>
				<div className="storage-header-actions">
					<button
						type="button"
						className="kg-btn kg-btn--secondary"
						title={memeboard.stopHint(displayHotkey(view.stop_hotkey))}
						onClick={() => invoke('stop_all_memes').catch(notifyError)}
					>
						■ {memeboard.stopAll}
					</button>
					<button
						type="button"
						className="kg-btn kg-btn--primary"
						onClick={createMeme}
					>
						{memeboard.newMeme}
					</button>
				</div>
			</div>

			<div className="memeboard-layout">
				<section className="library-island memeboard-island">
					<div className="storage-tabs" role="tablist">
						{(['memes', 'podium'] as const).map((id) => (
							<button
								key={id}
								type="button"
								role="tab"
								aria-selected={tab === id}
								className={tab === id ? 'storage-tab active' : 'storage-tab'}
								onClick={() => setTab(id)}
							>
								{memeboard.tabs[id]}
							</button>
						))}
					</div>

					{tab === 'podium' ? (
						<Podium memes={view.memes} byId={byId} />
					) : view.memes.length === 0 ? (
						<div className="storage-empty">
							<WaveText as="p" className="storage-empty-title">
								{memeboard.empty}
							</WaveText>
							<p className="storage-empty-hint">{memeboard.emptyHint}</p>
						</div>
					) : (
						<div className="meme-grid">
							{view.memes.map((meme) => (
								<MemeCard
									key={meme.id}
									meme={meme}
									visual={meme.visual ? byId.get(meme.visual) : undefined}
									audio={meme.audio ? byId.get(meme.audio) : undefined}
									onEdit={() => setEditing({ meme, isNew: false })}
									onDelete={() => setDeleting(meme)}
								/>
							))}
						</div>
					)}
					<p className="meme-field-note memeboard-note">{memeboard.gameNote}</p>
				</section>

				<aside className="memeboard-aside">
					<MemeboardSettings stopHotkey={view.stop_hotkey} />
				</aside>
			</div>

			{editing && (
				<MemeEditor
					meme={editing.meme}
					isNew={editing.isNew}
					maxMemeMs={view.max_meme_ms}
					onClose={() => setEditing(null)}
				/>
			)}

			{deleting && (
				<Modal
					title={memeboard.card.deleteConfirm.title(deleting.name)}
					confirmLabel={memeboard.card.deleteConfirm.confirm}
					destructive
					onCancel={() => setDeleting(null)}
					onConfirm={() => {
						const id = deleting.id;
						setDeleting(null);
						invoke('delete_meme', { id }).catch(notifyError);
					}}
				>
					<p className="modal-body">{memeboard.card.deleteConfirm.body}</p>
				</Modal>
			)}

			{rejected && (
				<Toast tone="error" onDismiss={() => setRejected(null)}>
					{rejected}
				</Toast>
			)}
		</div>
	);
}

export default MemeboardScreen;
