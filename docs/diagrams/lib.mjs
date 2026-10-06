let counter = 0;
const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

export class Scene {
	constructor({ rough = 1, font = 1 } = {}) { this.els = []; this.rough = rough; this.font = font; }

	base(type, x, y, w, h, o = {}) {
		counter++;
		const id = o.id ?? `${type}-${counter}`;
		return {
			id, type, x, y, width: w, height: h, angle: 0,
			strokeColor: o.stroke ?? '#1e1e1e', backgroundColor: o.bg ?? 'transparent',
			fillStyle: o.fill ?? 'hachure', strokeWidth: o.sw ?? 2, strokeStyle: o.dash ?? 'solid',
			roughness: o.rough ?? this.rough, opacity: o.opacity ?? 100, groupIds: [], frameId: null,
			roundness: o.round ? { type: 3 } : null, seed: hash(id) % 2000000000, version: 1,
			versionNonce: hash(id + 'n') % 2000000000, isDeleted: false, boundElements: [], updated: 1,
			link: null, locked: false,
		};
	}

	shape(type, x, y, w, h, o = {}) { const e = this.base(type, x, y, w, h, o); this.els.push(e); return e; }
	rect(x, y, w, h, o = {}) { return this.shape('rectangle', x, y, w, h, { round: true, ...o }); }
	ellipse(x, y, w, h, o = {}) { return this.shape('ellipse', x, y, w, h, o); }
	diamond(x, y, w, h, o = {}) { return this.shape('diamond', x, y, w, h, o); }

	text(x, y, str, o = {}) {
		const size = o.size ?? 16;
		const lines = String(str).split('\n');
		const w = o.w ?? Math.max(...lines.map((l) => l.length)) * size * 0.62;
		const h = lines.length * size * 1.25;
		const e = this.base('text', o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x, y, w, h, { ...o, bg: 'transparent', sw: 1 });
		Object.assign(e, {
			text: str, originalText: str, fontSize: size, fontFamily: o.font ?? this.font,
			textAlign: o.align ?? 'left', verticalAlign: 'top', containerId: null, lineHeight: 1.25,
			autoResize: true, baseline: Math.round(size * 0.9),
		});
		e.strokeColor = o.color ?? '#1e1e1e';
		this.els.push(e);
		return e;
	}

	line(pts, o = {}) {
		const [x0, y0] = pts[0];
		const rel = pts.map(([x, y]) => [x - x0, y - y0]);
		const xs = rel.map((p) => p[0]), ys = rel.map((p) => p[1]);
		const e = this.base(o.arrow ? 'arrow' : 'line', x0, y0, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), { round: !!o.arrow, ...o });
		Object.assign(e, {
			points: rel, lastCommittedPoint: null, startBinding: null, endBinding: null,
			startArrowhead: o.back ? 'arrow' : null, endArrowhead: o.arrow ? 'arrow' : null,
		});
		if (o.from) { e.startBinding = { elementId: o.from.id, focus: 0, gap: 4 }; o.from.boundElements.push({ id: e.id, type: 'arrow' }); }
		if (o.to) { e.endBinding = { elementId: o.to.id, focus: 0, gap: 4 }; o.to.boundElements.push({ id: e.id, type: 'arrow' }); }
		this.els.push(e);
		return e;
	}
	arrow(pts, o = {}) { return this.line(pts, { arrow: true, ...o }); }

	/** Module box: title, optional subtitle, bullet lines. Returns geometry for wiring arrows. */
	box(x, y, w, { title, sub, items = [], color = '#1e1e1e', bg = '#ffffff', fill = 'solid', size = 15, minH = 0 }) {
		const lineH = size * 1.25 + 5;
		const h = Math.max(minH, 16 + 30 + (sub ? 22 : 0) + items.length * lineH + 14);
		const r = this.rect(x, y, w, h, { stroke: color, bg, fill, sw: 2.5 });
		this.text(x + 16, y + 14, title, { size: 24, color });
		let cy = y + 48;
		if (sub) { this.text(x + 16, cy, sub, { size: 14, color: '#868e96' }); cy += 22; }
		for (const it of items) { this.text(x + 16, cy + 3, it, { size, color: '#343a40' }); cy += lineH; }
		return { id: r.id, boundElements: r.boundElements, x, y, w, h, cx: x + w / 2, cy: y + h / 2, r: x + w, b: y + h };
	}

	note(x, y, w, title, lines, { bg = '#fff3bf', color = '#e67700', size = 15 } = {}) {
		const lineH = size * 1.25 + 4;
		const h = 20 + 30 + lines.length * lineH + 10;
		this.rect(x, y, w, h, { stroke: color, bg, fill: 'solid', sw: 2, round: false });
		this.text(x + 14, y + 12, title, { size: 20, color });
		let cy = y + 44;
		for (const l of lines) { this.text(x + 14, cy, l, { size, color: '#343a40' }); cy += lineH; }
		return { x, y, w, h, r: x + w, b: y + h };
	}

	toJSON() {
		return { type: 'excalidraw', version: 2, source: 'kawagiif', elements: this.els, appState: { viewBackgroundColor: '#ffffff', gridSize: null }, files: {} };
	}
}
