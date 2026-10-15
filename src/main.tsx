import React from 'react';
import ReactDOM from 'react-dom/client';
import ControlApp from './windows/ControlApp';
import { suppressBrowserContextMenu } from './entries/shared';
import { invoke } from './lib/ipc';
import { applyAppearance, type Appearance } from './lib/appearance';
import './styles/index.css';

suppressBrowserContextMenu();
// dev frame meter (fps + long tasks per window, printed in the tauri dev terminal): set VITE_KG_PERF=1
if (import.meta.env.DEV && import.meta.env.VITE_KG_PERF)
	import('./lib/devPerf').then((m) => m.startDevPerf());
invoke<Appearance>('get_config')
	.then(applyAppearance)
	.catch(() => {});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<ControlApp />
	</React.StrictMode>,
);
