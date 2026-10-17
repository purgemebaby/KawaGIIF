import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
} from 'react';
import { invoke } from '../lib/ipc';
import { announceZoom, nextZoom, onZoomAnnounced } from '../lib/zoom';
import { onNavAnimationsChanged } from '../lib/navAnimations';
import { transitionKind, worldOffset } from '../lib/navTransition';
import {
	allFinished,
	burstPanels,
	captureRing,
	fadeHome,
	spinRing,
} from '../lib/editorBurst';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { LibraryProvider } from '../context/LibraryProvider';
import { t } from '../i18n/en';
import BrandBar from '../components/BrandBar';
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

const PAN_MS = 650;
const PAN_EASING = 'cubic-bezier(0.65, 0, 0.35, 1)';

/** A pan in progress: the camera moves `offset` px from `from` to `to`. */
interface Transition {
	from: Screen;
	to: Screen;
	offset: { x: number; y: number };
}

/** Home ↔ Editor: the ring spins and the panels fly, one `part` after the other (ring first on the way in). */
interface Burst {
	kind: 'burst' | 'unburst';
	part: 'ring' | 'panels';
}

/** The running sequence, kept so a new navigation can settle it first. */
interface Running {
	to: Screen;
	animation?: Animation;
	onSettled?: () => void;
}

const PERF = import.meta.env.DEV && Boolean(import.meta.env.VITE_KG_PERF);

/** Dev only: logs frame stats until `done` settles. */
function measureInDev(label: string, done: Promise<unknown>) {
	if (PERF)
		import('../lib/devPerf').then((m) => m.measureTransition(label, done));
}

/** Screens mounted now; an unburst lays Home out (hidden) under the folding panels to learn where the ring is. */
function mountedScreens(
	screen: Screen,
	transition: Transition | null,
	burst: Burst | null,
): Screen[] {
	if (burst?.kind === 'burst')
		return burst.part === 'ring' ? ['home'] : ['editor'];
	if (burst) return burst.part === 'panels' ? ['home', 'editor'] : ['home'];
	return transition ? [transition.from, transition.to] : [screen];
}

/** Home during an unburst's panel fold: laid out for measuring, but not shown. */
function isWaitingHome(id: Screen, burst: Burst | null): boolean {
	return burst?.kind === 'unburst' && burst.part === 'panels' && id === 'home';
}

/** The layer being left: it takes no input while it plays out. */
function isDeparting(
	id: Screen,
	transition: Transition | null,
	burst: Burst | null,
): boolean {
	if (transition) return transition.from === id;
	if (burst?.kind === 'burst') return burst.part === 'ring' && id === 'home';
	return burst?.part === 'panels' && id === 'editor';
}

function layerStyle(
	id: Screen,
	transition: Transition | null,
	burst: Burst | null,
): CSSProperties | undefined {
	if (isWaitingHome(id, burst)) return { visibility: 'hidden' };
	if (transition?.to !== id) return undefined;
	return {
		transform: `translate(${transition.offset.x}px, ${transition.offset.y}px)`,
	};
}

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

	// `screen` is the settled screen; `transition` is set only while a pan shows both.
	const [transition, setTransition] = useState<Transition | null>(null);
	const [burst, setBurst] = useState<Burst | null>(null);
	const contentRef = useRef<HTMLElement>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const runningRef = useRef<Running | null>(null);
	const navAnimationsRef = useRef(true);

	const screenRef = useRef(screen);
	screenRef.current = screen;

	// Ends the running sequence at once, so the next navigation starts from where it was heading.
	const settleTransition = useCallback(() => {
		const running = runningRef.current;
		if (!running) return;
		runningRef.current = null;
		if (running.animation) {
			running.animation.onfinish = null;
			running.animation.finish();
		}
		running.onSettled?.();
		screenRef.current = running.to;
		setScreen(running.to);
		setTransition(null);
		setBurst(null);
	}, []);

	const changeScreen = useCallback((from: Screen, to: Screen) => {
		const content = contentRef.current;
		const reduced = window.matchMedia(
			'(prefers-reduced-motion: reduce)',
		).matches;
		const kind = transitionKind(from, to);
		if (
			!content ||
			!navAnimationsRef.current ||
			reduced ||
			kind === 'instant'
		) {
			setScreen(to);
			return;
		}
		if (kind === 'burst' || kind === 'unburst') {
			const running: Running = { to };
			measureInDev(
				`${from}→${to}`,
				new Promise<void>((resolve) => {
					running.onSettled = resolve;
				}),
			);
			runningRef.current = running;
			setBurst({ kind, part: kind === 'burst' ? 'ring' : 'panels' });
			return;
		}
		const offset = worldOffset(
			from,
			to,
			content.clientWidth,
			content.clientHeight,
		);
		setTransition({ from, to, offset });
	}, []);

	useLayoutEffect(() => {
		const stage = stageRef.current;
		if (!transition || !stage) return;
		const { from, to, offset } = transition;
		const animation = stage.animate(
			[
				{ transform: 'translate(0, 0)' },
				{ transform: `translate(${-offset.x}px, ${-offset.y}px)` },
			],
			{ duration: PAN_MS, easing: PAN_EASING, fill: 'forwards' },
		);
		animation.onfinish = settleTransition;
		runningRef.current = { animation, to };
		measureInDev(`${from}→${to}`, animation.finished);
		return () => {
			if (runningRef.current?.animation === animation)
				runningRef.current = null;
			animation.onfinish = null;
			animation.cancel();
		};
	}, [transition, settleTransition]);

	// Plays one part of a burst; when it ends the other part follows, then the sequence settles.
	useLayoutEffect(() => {
		const stage = stageRef.current;
		if (!burst || !stage) return;
		const { kind, part } = burst;
		const reverse = kind === 'unburst';
		const home = stage.querySelector<HTMLElement>('[data-screen="home"]');
		const editor = stage.querySelector<HTMLElement>('[data-screen="editor"]');
		const ring = home?.querySelector<SVGSVGElement>('.radial-menu');
		// the ring is still unrotated here: the animations start below
		if (ring) captureRing(ring);

		const animations: Animation[] = [];
		if (part === 'ring' && home && ring)
			animations.push(spinRing(ring, reverse), ...fadeHome(home, reverse));
		if (part === 'panels' && editor)
			animations.push(...burstPanels(editor, reverse));

		// Home's ring comes last when returning, the Editor's panels when leaving.
		const lastPart = reverse ? 'ring' : 'panels';
		const arrived = reverse ? 'home' : 'editor';
		let cancelled = false;
		allFinished(animations).then(
			() => {
				if (cancelled) return;
				if (part === lastPart) {
					settleTransition();
					return;
				}
				screenRef.current = arrived;
				setScreen(arrived);
				setBurst({ kind, part: lastPart });
			},
			() => {},
		);
		return () => {
			cancelled = true;
			animations.forEach((animation) => animation.cancel());
		};
	}, [burst, settleTransition]);

	const runExit = useCallback(
		(exit: PendingExit) => {
			if (exit.kind === 'hide') {
				invoke('hide_control_window');
				return;
			}
			settleTransition();
			if (exit.screen === screenRef.current) return;
			changeScreen(screenRef.current, exit.screen);
		},
		[settleTransition, changeScreen],
	);

	const requestExit = useCallback(
		async (exit: PendingExit) => {
			// a running sequence counts as already being on its destination
			const current = runningRef.current?.to ?? screenRef.current;
			if (current !== 'editor') {
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
		[runExit],
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

	// The backend re-applies the saved zoom at startup; sync the tracked zoom and nav animations once on mount.
	useEffect(() => {
		const track = (zoom: number) => {
			uiZoomRef.current = zoom;
		};
		invoke<{ ui_zoom: number; nav_animations: boolean }>('get_config').then(
			(c) => {
				track(c.ui_zoom ?? 1);
				navAnimationsRef.current = c.nav_animations ?? true;
			},
		);
		const stopZoom = onZoomAnnounced(track);
		const stopNav = onNavAnimationsChanged((enabled) => {
			navAnimationsRef.current = enabled;
		});
		return () => {
			stopZoom();
			stopNav();
		};
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
		const exit = pendingExit;
		setPendingExit(null);
		runExit(exit);
	};

	const stageClass = ['screen-stage']
		.concat(transition ? 'is-panning' : [], burst ? 'is-bursting' : [])
		.join(' ');

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
						{mountedScreens(screen, transition, burst).map((id) => (
							<div
								key={id}
								className="screen-layer"
								data-screen={id}
								style={layerStyle(id, transition, burst)}
								inert={isDeparting(id, transition, burst)}
							>
								<ScreenView
									id={id}
									quiet={isWaitingHome(id, burst)}
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
