import { useCallback, useMemo, useState } from 'react';
import { invoke } from '../lib/ipc';
import { loadConfig } from '../lib/config';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { useScreenTransitions } from '../hooks/useScreenTransitions';
import { useZoomShortcuts } from '../hooks/useZoomShortcuts';
import { LibraryProvider } from '../context/LibraryProvider';
import { t } from '../i18n/en';
import BrandBar from '../components/BrandBar';
import { NAV_ITEMS, type Screen } from '../components/navItems';
import HomeScreen from '../components/HomeScreen';
import StorageScreen from '../components/StorageScreen';
import EditorScreen from '../components/EditorScreen';
import SettingsScreen from '../components/SettingsScreen';
import LoadingScreen from '../components/LoadingScreen';
import ZoomToast from '../components/ZoomToast';
import Modal, { MODAL_ROOT_ID } from '../components/ui/Modal';
import './ControlApp.css';

type PendingExit = { kind: 'navigate'; screen: Screen } | { kind: 'hide' };

// Dev only: `?boot=0` skips the loading screen and `?screen=storage` opens a section, for headless screenshots.
const devParams = import.meta.env.DEV
	? new URLSearchParams(location.search)
	: null;
const DEV_SCREEN = NAV_ITEMS.find(
	(item) => item.id === devParams?.get('screen'),
)?.id;

let hasBooted = devParams?.get('boot') === '0';

interface ScreenViewProps {
	id: Screen;
	quiet: boolean;
	onNavigate: (screen: Screen) => void;
}

/** One world tile: a section brings its own top bar, so the logo travels with it. */
function ScreenView({ id, quiet, onNavigate }: ScreenViewProps) {
	return (
		<>
			{id !== 'home' && <BrandBar onNavigate={onNavigate} />}
			<div className="screen-slot">
				{id === 'home' && <HomeScreen quiet={quiet} onNavigate={onNavigate} />}
				{id === 'storage' && <StorageScreen />}
				{id === 'editor' && <EditorScreen />}
				{id === 'settings' && <SettingsScreen />}
			</div>
		</>
	);
}

function ControlApp() {
	const [pendingExit, setPendingExit] = useState<PendingExit | null>(null);
	const [booting, setBooting] = useState(!hasBooted);

	// one request for the whole window: the boot bar waits on it and the hooks below read it
	const configPromise = useMemo(loadConfig, []);

	// what the UI needs before it's usable; the loading bar advances as each one finishes
	const bootSteps = useMemo(
		() => [
			configPromise,
			invoke('list_media'),
			invoke('list_placed_items'),
			document.fonts.ready,
		],
		[configPromise],
	);

	const { layers, stageClass, stageRef, contentRef, navigate, destination } =
		useScreenTransitions(DEV_SCREEN ?? 'home', configPromise);
	const zoomToast = useZoomShortcuts(configPromise);

	const runExit = useCallback(
		(exit: PendingExit) => {
			if (exit.kind === 'hide') {
				invoke('hide_control_window');
				return;
			}
			navigate(exit.screen);
		},
		[navigate],
	);

	const requestExit = useCallback(
		async (exit: PendingExit) => {
			if (destination() !== 'editor') {
				runExit(exit);
				return;
			}
			const dirty = await invoke<boolean>('has_unsaved_changes');
			if (dirty) {
				setPendingExit(exit);
			} else {
				runExit(exit);
			}
		},
		[runExit, destination],
	);

	useTauriEvent('close-requested', () => requestExit({ kind: 'hide' }));

	const resolveExit = async (action: 'save' | 'discard') => {
		if (!pendingExit) return;
		if (action === 'save') {
			await invoke('save_template');
		} else {
			await invoke('discard_template_changes');
		}
		const exit = pendingExit;
		setPendingExit(null);
		runExit(exit);
	};

	return (
		<LibraryProvider>
			<div className="control-shell">
				{booting && (
					<LoadingScreen
						steps={bootSteps}
						onDone={() => {
							hasBooted = true;
							setBooting(false);
							invoke('show_boot_overlays');
						}}
					/>
				)}

				<main className="control-content" ref={contentRef}>
					<div ref={stageRef} className={stageClass}>
						{layers.map(({ id, quiet, inert, style }) => (
							<div
								key={id}
								className="screen-layer"
								data-screen={id}
								style={style}
								inert={inert}
							>
								<ScreenView
									id={id}
									quiet={quiet}
									onNavigate={(next) =>
										requestExit({ kind: 'navigate', screen: next })
									}
								/>
							</div>
						))}
					</div>
				</main>

				{pendingExit && (
					<Modal
						title={t.editor.exitGuard.title}
						confirmLabel={t.common.save}
						onCancel={() => setPendingExit(null)}
						onConfirm={() => resolveExit('save')}
						extraActions={
							<button
								type="button"
								className="kg-btn kg-btn--danger"
								onClick={() => resolveExit('discard')}
							>
								{t.common.discard}
							</button>
						}
					>
						<p className="modal-body">{t.editor.exitGuard.body}</p>
					</Modal>
				)}

				<div id={MODAL_ROOT_ID} />

				{zoomToast !== null && <ZoomToast zoom={zoomToast} />}
			</div>
		</LibraryProvider>
	);
}

export default ControlApp;
