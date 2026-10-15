import React from 'react';
import ReactDOM from 'react-dom/client';
import OverlayItemApp from '../windows/OverlayItemApp';
import { makeWindowTransparent, suppressBrowserContextMenu } from './shared';
import '../styles/overlay.css';

suppressBrowserContextMenu();
makeWindowTransparent();
// dev frame meter (fps + long tasks per window, printed in the tauri dev terminal): set VITE_KG_PERF=1
if (import.meta.env.DEV && import.meta.env.VITE_KG_PERF)
	import('../lib/devPerf').then((m) => m.startDevPerf());

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<OverlayItemApp />
	</React.StrictMode>,
);
