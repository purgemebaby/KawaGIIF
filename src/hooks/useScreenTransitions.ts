import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type CSSProperties,
} from 'react';
import { invoke } from '../lib/ipc';
import type { AppConfig } from '../lib/config';
import {
	announceNavAnimations,
	onNavAnimationsChanged,
} from '../lib/navAnimations';
import { transitionKind, worldOffset } from '../lib/navTransition';
import {
	allFinished,
	burstPanels,
	captureRing,
	fadeHome,
	spinRing,
} from '../lib/editorBurst';
import type { Screen } from '../components/navItems';

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

/** One screen layer of the stage, with what the render needs to draw it. */
export interface ScreenLayer {
	id: Screen;
	quiet: boolean;
	inert: boolean;
	style: CSSProperties | undefined;
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

/** Screen navigation with its pan and Home ↔ Editor burst animations; `navigate` settles any running sequence first. */
export function useScreenTransitions(
	initial: Screen,
	configPromise: Promise<AppConfig>,
) {
	// `screen` is the settled screen; `transition` is set only while a pan shows both.
	const [screen, setScreen] = useState<Screen>(initial);
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
		// Overlays stop being editable as soon as you leave, not when the exit animation ends.
		if (from === 'editor' && to !== 'editor')
			invoke('set_edit_mode', { enabled: false });
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

	// The nav animations setting is read once at mount, then follows its announcements.
	useEffect(() => {
		configPromise.then((c) => {
			navAnimationsRef.current = c.nav_animations ?? true;
			announceNavAnimations(navAnimationsRef.current);
		});
		return onNavAnimationsChanged((enabled) => {
			navAnimationsRef.current = enabled;
		});
	}, [configPromise]);

	/** Settles the running sequence, then goes to `to` unless already there. */
	const navigate = useCallback(
		(to: Screen) => {
			settleTransition();
			if (to === screenRef.current) return;
			changeScreen(screenRef.current, to);
		},
		[settleTransition, changeScreen],
	);

	/** Where the app is heading: a running sequence counts as already being on its destination. */
	const destination = useCallback(
		() => runningRef.current?.to ?? screenRef.current,
		[],
	);

	const layers: ScreenLayer[] = mountedScreens(screen, transition, burst).map(
		(id) => ({
			id,
			quiet: isWaitingHome(id, burst),
			inert: isDeparting(id, transition, burst),
			style: layerStyle(id, transition, burst),
		}),
	);

	const stageClass = ['screen-stage']
		.concat(transition ? 'is-panning' : [], burst ? 'is-bursting' : [])
		.join(' ');

	return {
		layers,
		stageClass,
		stageRef,
		contentRef,
		navigate,
		destination,
	};
}
