import React from 'react';
import ReactDOM from 'react-dom/client';
import { suppressBrowserContextMenu } from './entries/shared';
import { loadConfig } from './lib/config';
import { applyAppearance } from './lib/appearance';
import { applyLanguage } from './i18n';
import './styles/index.css';

suppressBrowserContextMenu();
if (import.meta.env.DEV && import.meta.env.VITE_KG_PERF)
	import('./lib/devPerf').then((m) => m.startDevPerf());

// Screens import only after the language is set: some read `t` at load time.
async function render() {
	const { default: ControlApp } = await import('./windows/ControlApp');
	ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
		<React.StrictMode>
			<ControlApp />
		</React.StrictMode>,
	);
}

loadConfig()
	.then((config) => {
		applyAppearance(config);
		applyLanguage(config.language);
	})
	.catch(() => {})
	.finally(render);
