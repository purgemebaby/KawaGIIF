import { Scene } from './lib.mjs';

const K = '#1e1e1e', BL = '#1971c2', RD = '#e03131', GR = '#2f9e44';

export function ui() {
	const s = new Scene({ rough: 2 });
	const r = (x, y, w, h, c = K, o = {}) => s.rect(x, y, w, h, { stroke: c, sw: 2, ...o });
	const t = (x, y, str, c = K, size = 15, o = {}) => s.text(x, y, str, { size, color: c, ...o });
	const ln = (pts, c = K, o = {}) => s.line(pts, { stroke: c, sw: 2, ...o });
	const ar = (pts, c = K, o = {}) => s.arrow(pts, { stroke: c, sw: 2, ...o });

	t(40, 14, 'KawaGiif UI whiteboard', BL, 40);
	t(520, 28, 'control window screens, overlay window, design tokens (src/styles/tokens.css, motion.css)', K, 16);

	const nav = ['Home', 'Storage', 'Editor', 'Settings'];
	const frame = (x, y, name, active, label) => {
		t(x, y - 34, name, BL, 24);
		r(x, y, 560, 340, K, { round: false });
		r(x + 10, y + 10, 100, 320, BL);
		t(x + 14, y + 12, 'SectionTabs', BL, 12);
		nav.forEach((n, i) => {
			const on = i === active;
			if (on) r(x + 16, y + 38 + i * 36, 88, 28, GR, { bg: '#b2f2bb', fill: 'hachure', sw: 1.5 });
			t(x + 26, y + 43 + i * 36, n, on ? GR : K, 16);
		});
		return { cx: x + 120, w: 430 };
	};
	const thumb = (x, y, w, h, c = K) => {
		r(x, y, w, h, c, { sw: 1.5 });
		ln([[x + 4, y + 4], [x + w - 4, y + h - 4]], c, { sw: 1 });
		ln([[x + w - 4, y + 4], [x + 4, y + h - 4]], c, { sw: 1 });
	};
	const toggle = (x, y, on) => {
		r(x, y, 46, 22, on ? GR : K, { bg: on ? '#b2f2bb' : 'transparent', fill: 'solid', sw: 1.5 });
		s.ellipse(on ? x + 26 : x + 3, y + 3, 16, 16, { stroke: on ? GR : K, bg: '#fff', fill: 'solid', sw: 1.5 });
	};
	const slider = (x, y, w, k) => { ln([[x, y], [x + w, y]], K); s.ellipse(x + w * k - 7, y - 7, 14, 14, { stroke: BL, bg: '#a5d8ff', fill: 'solid', sw: 1.5 }); };

	// Home
	let X = 40, Y = 110;
	let f = frame(X, Y, '1. Home', 0);
	t(f.cx + 70, Y + 20, 'KawaGiif', BL, 48);
	ln([[f.cx + 70, Y + 78], [f.cx + 100, Y + 66], [f.cx + 140, Y + 90], [f.cx + 180, Y + 66], [f.cx + 220, Y + 90], [f.cx + 260, Y + 66]], RD, { sw: 1.5 });
	t(f.cx + 270, Y + 84, 'KawaTitle (Modak) + WaveText', RD, 12);
	['Storage', 'Editor', 'Settings'].forEach((n, i) => { r(f.cx + i * 142, Y + 130, 130, 80, K); t(f.cx + 14 + i * 142, Y + 160, n, K, 16); });
	t(f.cx, Y + 214, 'HOME_TILES: click -> screen', K, 12);
	r(f.cx + 90, Y + 262, 240, 44, RD, { bg: '#ffc9c9', fill: 'hachure' });
	t(f.cx + 110, Y + 273, 'Kill all animations', RD, 18);
	[[30, 20], [380, 50], [330, 105], [60, 300], [400, 250]].forEach(([dx, dy]) => s.diamond(f.cx + dx, Y + dy, 14, 14, { stroke: GR, bg: '#b2f2bb', fill: 'solid', sw: 1 }));
	t(f.cx + 340, Y + 316, 'KawaiiBackdrop', GR, 12);

	// Storage
	X = 660; f = frame(X, Y, '2. Storage', 1);
	r(f.cx, Y + 14, 200, 28, K, { sw: 1.5 }); t(f.cx + 8, Y + 19, 'search...', '#868e96', 14);
	['pixel', 'cat', 'loop'].forEach((n, i) => { r(f.cx + 210 + i * 62, Y + 14, 56, 28, BL, { sw: 1.5, bg: i === 0 ? '#a5d8ff' : 'transparent' }); t(f.cx + 218 + i * 62, Y + 19, n, BL, 13); });
	r(f.cx + 400, Y + 14, 34, 28, K, { sw: 1.5 }); t(f.cx + 407, Y + 19, 'v', K, 14);
	t(f.cx, Y + 46, 'MediaFilterBar + SortMenu', RD, 12);
	for (let i = 0; i < 8; i++) {
		const gx = f.cx + (i % 4) * 108, gy = Y + 70 + Math.floor(i / 4) * 110;
		thumb(gx, gy, 96, 66);
		r(gx + 4, gy + 72, 30, 14, GR, { sw: 1 }); r(gx + 38, gy + 72, 30, 14, GR, { sw: 1 });
	}
	t(f.cx, Y + 296, 'MediaGrid + TagChips', RD, 12);
	// TagManager modal
	t(X + 330, Y + 372, 'TagManager (Modal): rename / delete tags', BL, 14);
	r(X + 300, Y + 250, 250, 110, K, { bg: '#fff', fill: 'solid', sw: 2.5 });
	t(X + 312, Y + 258, 'Tags', K, 16);
	['pixel  (4)  [rename] [x]', 'cat    (2)  [rename] [x]', 'loop   (7)  [rename] [x]'].forEach((l, i) => t(X + 312, Y + 284 + i * 22, l, K, 13));

	// Editor
	X = 40; Y = 570; f = frame(X, Y, '3. Editor', 2);
	r(f.cx, Y + 10, 110, 320, GR, { sw: 1.5 }); t(f.cx + 4, Y + 12, 'MediaSidebar', GR, 12);
	[0, 1, 2].forEach((i) => thumb(f.cx + 10, Y + 36 + i * 90, 90, 70, GR));
	r(f.cx + 120, Y + 10, 200, 320, K, { dash: 'dotted', sw: 1.5 }); t(f.cx + 150, Y + 14, 'desktop behind', '#868e96', 12);
	r(f.cx + 160, Y + 100, 90, 80, BL, { dash: 'dashed' });
	thumb(f.cx + 166, Y + 106, 78, 68, K);
	t(f.cx + 140, Y + 190, 'placed overlay (selected)', BL, 12);
	ar([[f.cx + 50, Y + 90], [f.cx + 160, Y + 130]], GR, { sw: 1.5 }); t(f.cx + 10, Y + 304, 'drag to place', GR, 12);
	r(f.cx + 330, Y + 10, 100, 100, RD, { sw: 1.5 }); t(f.cx + 332, Y + 12, 'PlacedItems', RD, 12);
	['item 1', 'item 2', 'item 3'].forEach((n, i) => t(f.cx + 340, Y + 36 + i * 22, n, K, 13));
	r(f.cx + 330, Y + 120, 100, 130, BL, { sw: 1.5 }); t(f.cx + 332, Y + 122, 'Properties', BL, 12);
	t(f.cx + 336, Y + 144, 'opacity', K, 12); slider(f.cx + 338, Y + 175, 80, 0.7);
	t(f.cx + 336, Y + 190, 'speed', K, 12); slider(f.cx + 338, Y + 222, 80, 0.4);
	r(f.cx + 330, Y + 270, 48, 28, GR, { bg: '#b2f2bb', fill: 'hachure', sw: 1.5 }); t(f.cx + 336, Y + 276, 'Save', GR, 13);
	r(f.cx + 382, Y + 270, 48, 28, RD, { sw: 1.5 }); t(f.cx + 384, Y + 276, 'Drop', RD, 13);

	// Settings
	X = 660; f = frame(X, Y, '4. Settings', 3);
	['Launch on startup', 'Start minimized to tray', 'Confirm media delete'].forEach((n, i) => { t(f.cx, Y + 24 + i * 40, n, K, 16); toggle(f.cx + 270, Y + 22 + i * 40, i !== 1); });
	t(f.cx, Y + 150, 'Overlay pool size (on restart)', K, 16); slider(f.cx + 5, Y + 190, 300, 0.4); t(f.cx + 320, Y + 180, '8', BL, 18);
	t(f.cx, Y + 215, 'RamGauge  <- get_system_stats', RD, 13);
	s.ellipse(f.cx + 20, Y + 238, 110, 90, { stroke: K, sw: 1.5 });
	ln([[f.cx + 75, Y + 283], [f.cx + 112, Y + 252]], RD, { sw: 3 });
	t(f.cx + 170, Y + 262, 'used / total RAM', K, 14);
	t(f.cx + 170, Y + 284, 'webview ~11 MB asleep', GR, 14);

	// Overlay sketch
	X = 1300; Y = 110;
	t(X, Y - 34, '5. Overlay window (OV-SLOT-n)', BL, 24);
	r(X, Y, 340, 260, K, { dash: 'dotted', sw: 1.5, round: false });
	t(X + 8, Y + 4, 'fully transparent window, no frame', '#868e96', 13);
	s.ellipse(X + 70, Y + 60, 200, 150, { stroke: GR, bg: '#b2f2bb', fill: 'hachure', sw: 2 });
	s.ellipse(X + 120, Y + 105, 14, 14, { stroke: K, sw: 2 }); s.ellipse(X + 200, Y + 105, 14, 14, { stroke: K, sw: 2 });
	ln([[X + 130, Y + 160], [X + 170, Y + 175], [X + 210, Y + 160]], K);
	r(X + 50, Y + 40, 240, 190, BL, { dash: 'dashed', round: false });
	[[50, 40], [290, 40], [50, 230]].forEach(([dx, dy]) => r(X + dx - 5, Y + dy - 5, 10, 10, BL, { bg: BL, fill: 'solid', sw: 1, round: false }));
	r(X + 280, Y + 220, 22, 22, RD, { bg: '#ffc9c9', fill: 'solid', sw: 2, round: false });
	ar([[X + 400, Y + 300], [X + 300, Y + 236]], RD); t(X + 345, Y + 305, 'resize handle\n-> resize_overlay (per frame)', RD, 14);
	ar([[X + 400, Y + 100], [X + 292, Y + 100]], BL); t(X + 350, Y + 80, 'selection outline\n(edit mode)', BL, 14);
	ar([[X + 400, Y + 180], [X + 260, Y + 160]], GR); t(X + 350, Y + 185, 'video / gif / img', GR, 14);
	t(X, Y + 275, 'click-through unless edit mode\nrecover: Ctrl+Alt+Esc', K, 14);

	// Fonts and shape tokens
	X = 1860; Y = 110;
	t(X, Y - 34, '6. Type, radius, space', BL, 24);
	t(X, Y, 'Kawa', GR, 64);
	t(X + 190, Y + 20, '<- title: Modak (--kg-font-display)\n    + outline #16121c, keyline #f4eefc', GR, 15);
	t(X, Y + 100, 'UI text: system-ui, Segoe UI  (--kg-font-ui)', K, 18);
	t(X, Y + 130, 'code: Cascadia Mono  (--kg-font-mono)', K, 18);
	t(X, Y + 170, 'sizes: xs 11 / sm 12 / md 13\n       base 14 / xl 24 px', BL, 16);
	t(X, Y + 215, 'radius: sm 8 / md 14 / lg 22 / pill 999', BL, 16);
	[8, 14, 22].forEach((rad, i) => r(X + i * 70, Y + 247, 56, 40, BL, { sw: 1.5, round: true }));
	t(X, Y + 300, 'space: 4 / 8 / 12 / 16 / 24 / 32 px', BL, 16);
	[4, 8, 12, 16, 24, 32].reduce((px, v) => { r(px, Y + 327, v, v, RD, { sw: 1, round: false }); return px + v + 10; }, X);
	t(X, Y + 365, 'shadow-1: 0 2 8 .35   shadow-2: 0 8 28 .5', K, 14);

	// Swatches
	Y = 1070;
	t(40, Y - 44, '7. Color tokens (dark theme, --kg-*)', BL, 28);
	const sw = [
		['bg-app', '#16171b'], ['bg-panel', '#1d1f24'], ['bg-raised', '#26282f'], ['bg-input', '#121317'], ['fg', '#e8e9ee'], ['fg-muted', '#9a9da8'], ['fg-faint', '#6b6e7a'], ['fg-on-accent', '#16121c'],
		['accent', '#a97bff'], ['accent-strong', '#b98fff'], ['accent-2', '#ff7bd0'], ['danger', '#ff6b6b'], ['border', '#33363f'], ['border-strong', '#454956'], ['title-outline', '#16121c'], ['title-keyline', '#f4eefc'],
	];
	sw.forEach(([n, hex], i) => {
		const x = 40 + (i % 8) * 285, y = Y + Math.floor(i / 8) * 140;
		r(x, y, 240, 70, K, { bg: hex, fill: 'solid', sw: 2 });
		t(x, y + 76, `--kg-${n}\n${hex}`, K, 15);
	});
	t(40, Y + 262, 'also: --kg-scrim rgba(9,10,13,.62)   --kg-accent-soft = accent @ 14%   --kg-danger-soft = danger @ 14%', '#868e96', 14);

	// Motion
	Y = 1440;
	t(40, Y - 44, '8. Motion (src/styles/motion.css)', BL, 28);
	s.note(40, Y, 640, 'Timing + easing', [
		'--kg-dur-fast 140ms / med 260ms / slow 420ms', '--kg-ease-out  cubic-bezier(.22, .61, .36, 1)', '--kg-ease-pop  cubic-bezier(.34, 1.56, .64, 1)  (overshoot)',
		'prefers-reduced-motion: animations and', 'transitions drop to 0.01ms'], { bg: '#d0ebff', color: BL });
	s.note(720, Y, 760, 'Keyframes', [
		'kg-wave        4s linear infinite, -0.14s per letter, +-0.12em', 'kg-pop         scale 0 -> 1.09 -> .965 -> 1 (pop in)',
		'kg-slide-down  -130% -> +6px -> 0 (drop in)', 'kg-neon-pulse  accent glow breathes 12px <-> 22px'], { bg: '#fff3bf', color: '#e67700' });
	s.note(1520, Y, 760, 'Entrances', [
		'kg-fade-up         6px rise + fade (menus, cards)', 'kg-screen-in-down  +52px -> 0 + fade (screen change)', 'kg-screen-in-up    -52px -> 0 + fade (screen change)'],
	{ bg: '#d3f9d8', color: GR });

	return s;
}
