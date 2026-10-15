import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { invoke } from '../lib/ipc';
import { announceZoom, nextZoom, onZoomAnnounced } from '../lib/zoom';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { LibraryProvider } from '../context/LibraryProvider';
import { t } from '../i18n/en';
import SectionTabs from '../components/SectionTabs';
import { NAV_ITEMS, type Screen } from '../components/navItems';
import HomeScreen from '../components/HomeScreen';
import StorageScreen from '../components/StorageScreen';
import EditorScreen from '../components/EditorScreen';
import SettingsScreen from '../components/SettingsScreen';
import LoadingScreen from '../components/LoadingScreen';
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

/**
 * Runs a screen change inside a view transition, so Home tiles morph into the section tabs and back (they share
 * `view-transition-name`s). `flushSync` makes React update the DOM inside the snapshot callback.
 */
function withViewTransition(change: () => void, from: Screen, to: Screen) {
	const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (!document.startViewTransition || reduced) {
		change();
		return;
	}
	const transition = document.startViewTransition(() => flushSync(change));
	if (import.meta.env.DEV && import.meta.env.VITE_KG_PERF)
		import('../lib/devPerf').then((m) =>
			m.measureTransition(`${from}→${to}`, transition.finished),
		);
}

// Transient badge shown for ~1s after a zoom change; styles use tokens, so no ControlApp.css entry.
function ZoomToast({ zoom }: { zoom: number }) {
	return (
		<div
			style={{
				position: 'fixed',
				right: 'var(--kg-space-5)',
				bottom: 'var(--kg-space-5)',
				padding: 'var(--kg-space-2) var(--kg-space-3)',
				border: '1px solid var(--kg-border)',
				borderRadius: 'var(--kg-radius-md)',
				background: 'var(--kg-bg-raised)',
				color: 'var(--kg-fg)',
				fontSize: 'var(--kg-text-md)',
				boxShadow: 'var(--kg-shadow-2)',
				pointerEvents: 'none',
				zIndex: 50,
				animation: 'kg-fade-in var(--kg-dur-fast) var(--kg-ease-out)',
			}}
		>
			{Math.round(zoom * 100)} %
		</div>
	);
}

function ControlApp() {
	const [screen, setScreen] = useState<Screen>(DEV_SCREEN ?? 'home');
	const [pendingExit, setPendingExit] = useState<PendingExit | null>(null);
	const [booting, setBooting] = useState(!hasBooted);

	// Obsidian-style UI zoom: the backend applies it to the webview; we track the value here.
	const uiZoomRef = useRef(1);
	const [zoomToast, setZoomToast] = useState<number | null>(null);
	const zoomTimerRef = useRef<number | undefined>(undefined);

	// what the UI needs before it's usable; the loading bar advances as each one finishes
	const bootSteps = useMemo(
		() => [
			invoke('get_config'),
			invoke('list_media'),
			invoke('list_placed_items'),
			document.fonts.ready,
		],
		[],
	);

	const screenRef = useRef(screen);
	screenRef.current = screen;

	const runExit = useCallback((exit: PendingExit) => {
		if (exit.kind === 'navigate') {
			if (exit.screen === screenRef.current) return;

			withViewTransition(
				() => setScreen(exit.screen),
				screenRef.current,
				exit.screen,
			);
		} else {
			invoke('hide_control_window');
		}
	}, []);

	const requestExit = useCallback(
		async (exit: PendingExit) => {
			if (screen !== 'editor') {
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
		[screen, runExit],
	);

	useTauriEvent('close-requested', () => requestExit({ kind: 'hide' }));

	// Ctrl+1..4 jump to Home, Library, Editor, Settings (the order of NAV_ITEMS), through the same exit guard.
	const requestExitRef = useRef(requestExit);
	requestExitRef.current = requestExit;
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
			const target = NAV_ITEMS[Number(e.key) - 1];
			if (!target) return;
			e.preventDefault();
			requestExitRef.current({ kind: 'navigate', screen: target.id });
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, []);

	// Applies a zoom step (1 in / -1 out / 0 reset) and flashes the percentage badge for ~1s.
	const applyZoom = useCallback(async (direction: 1 | -1 | 0) => {
		const applied = await invoke<number>('set_ui_zoom', {
			zoom: nextZoom(uiZoomRef.current, direction),
		});
		announceZoom(applied);
		setZoomToast(applied);
		window.clearTimeout(zoomTimerRef.current);
		zoomTimerRef.current = window.setTimeout(() => setZoomToast(null), 1000);
	}, []);

	// The backend re-applies the saved zoom at startup; sync the tracked value once on mount.
	useEffect(() => {
		const track = (zoom: number) => {
			uiZoomRef.current = zoom;
		};
		invoke<{ ui_zoom: number }>('get_config').then((c) =>
			track(c.ui_zoom ?? 1),
		);
		return onZoomAnnounced(track);
	}, []);

	// Ctrl+= / Ctrl++ zoom in, Ctrl+- out, Ctrl+0 reset. Sits beside the Ctrl+1..4 handler above.
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
			if (e.key === '=' || e.key === '+') {
				e.preventDefault();
				applyZoom(1);
			} else if (e.key === '-') {
				e.preventDefault();
				applyZoom(-1);
			} else if (e.key === '0') {
				e.preventDefault();
				applyZoom(0);
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [applyZoom]);

	// Ctrl + mouse wheel zooms; throttled to one step per 80ms so a single spin doesn't jump several levels.
	useEffect(() => {
		let lastApplied = 0;
		const onWheel = (e: WheelEvent) => {
			if (!e.ctrlKey) return;
			e.preventDefault();
			if (Date.now() - lastApplied < 80) return;
			lastApplied = Date.now();
			applyZoom(e.deltaY < 0 ? 1 : -1);
		};
		window.addEventListener('wheel', onWheel, { passive: false });
		return () => window.removeEventListener('wheel', onWheel);
	}, [applyZoom]);

	const resolveExit = async (action: 'save' | 'discard') => {
		if (!pendingExit) return;
		if (action === 'save') {
			await invoke('save_template');
		} else {
			await invoke('discard_template_changes');
		}
		await invoke('set_control_minimizable', { enabled: true });
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

				<main className="control-content">
					{screen !== 'home' && (
						<SectionTabs
							active={screen}
							onNavigate={(next) =>
								requestExit({ kind: 'navigate', screen: next })
							}
						/>
					)}

					<div key={screen} className="screen-slot">
						{screen === 'home' && (
							<HomeScreen
								onNavigate={(next) =>
									requestExit({ kind: 'navigate', screen: next })
								}
							/>
						)}
						{screen === 'storage' && <StorageScreen />}
						{screen === 'editor' && <EditorScreen />}
						{screen === 'settings' && <SettingsScreen />}
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
