import fs from 'node:fs';
import { renderToSvg, exportDiagram } from '@moona3k/excalidraw-export';
import { backend } from './backend.mjs';

const only = process.argv.slice(2);
const png = process.env.PNG === '1';
const diagrams = { backend };
for (const extra of ['frontend', 'ui']) {
	if (fs.existsSync(new URL(`./${extra}.mjs`, import.meta.url))) diagrams[extra] = (await import(`./${extra}.mjs`))[extra];
}
for (const [name, make] of Object.entries(diagrams)) {
	if (only.length && !only.includes(name)) continue;
	const doc = make().toJSON();
	fs.writeFileSync(`${name}.excalidraw`, JSON.stringify(doc, null, 2));
	fs.writeFileSync(`${name}.svg`, await renderToSvg(doc));
	if (png) await exportDiagram(`${name}.excalidraw`, `${name}.png`, { scale: 1 });
	console.log('wrote', name);
}
