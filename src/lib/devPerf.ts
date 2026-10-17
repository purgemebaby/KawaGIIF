import { getCurrentWindow } from '@tauri-apps/api/window';

const REPORT_MS = 2000;

/** Chromium's long-animation-frame entry (not in lib.dom yet), only the fields read here. */
interface LongAnimationFrame extends PerformanceEntry {
	renderStart: number;
	styleAndLayoutStart: number;
	scripts: { invoker: string; sourceURL: string; duration: number }[];
}

/** One long frame as text: total, script time before render, style, layout + paint, and the scripts that ran. */
function describeFrame(frame: LongAnimationFrame) {
	const end = frame.startTime + frame.duration;
	const renderStart = frame.renderStart || end;
	const scripts = frame.scripts
		.map(
			(s) =>
				`${s.invoker}@${s.sourceURL.split('/').pop()}:${Math.round(s.duration)}`,
		)
		.join(',');
	return `${Math.round(frame.duration)}ms(pre=${Math.round(renderStart - frame.startTime)} render=${Math.round(frame.styleAndLayoutStart - renderStart)} lp=${Math.round(end - frame.styleAndLayoutStart)} js=[${scripts}])`;
}

/**
 * Dev-only: while `done` is pending, counts frames and long animation frames, then logs
 * `[kg-vt] <label> <ms> fps= worst= loaf=[...]`. Used for the screen pan and the editor burst, see `VITE_KG_PERF`.
 */
export function measureTransition(label: string, done: Promise<unknown>) {
	const startedAt = performance.now();
	let frames = 0;
	let worst = 0;
	let last = startedAt;
	let running = true;
	const longFrames: string[] = [];

	const observer = new PerformanceObserver((list) => {
		for (const entry of list.getEntries())
			longFrames.push(describeFrame(entry as LongAnimationFrame));
	});
	observer.observe({ type: 'long-animation-frame', buffered: false });

	const tick = (now: number) => {
		if (!running) return;
		frames++;
		worst = Math.max(worst, now - last);
		last = now;
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);

	// a cancelled animation rejects `finished`; the measurement still ends there
	done
		.catch(() => {})
		.finally(() => {
			running = false;
			const total = performance.now() - startedAt;
			// the last long-animation-frame entries arrive just after the transition ends
			window.setTimeout(() => {
				observer.disconnect();
				console.warn(
					`[kg-vt] ${label} ${Math.round(total)}ms fps=${Math.round((frames * 1000) / total)} worst=${Math.round(worst)}ms loaf=[${longFrames.join(' ')}]`,
				);
			}, 100);
		});
}

/**
 * Dev-only frame meter: every `REPORT_MS` logs frames per second and how long the main thread was blocked by long
 * tasks (over 50 ms) in this window. Vite forwards the console to the `tauri dev` terminal, so it can be read there.
 */
export function startDevPerf() {
	const label =
		'__TAURI_INTERNALS__' in window ? getCurrentWindow().label : 'browser';
	let frames = 0;
	let worstGap = 0;
	let last = performance.now();
	let blocked = 0;

	new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) blocked += entry.duration;
	}).observe({ type: 'longtask', buffered: false });

	const tick = (now: number) => {
		frames++;
		worstGap = Math.max(worstGap, now - last);
		last = now;
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);

	window.setInterval(() => {
		if (document.visibilityState === 'visible') {
			const fps = Math.round((frames * 1000) / REPORT_MS);
			console.warn(
				`[kg-perf] ${label} fps=${fps} worstFrame=${Math.round(worstGap)}ms longTasks=${Math.round(blocked)}ms`,
			);
		}
		frames = 0;
		worstGap = 0;
		blocked = 0;
	}, REPORT_MS);
}
