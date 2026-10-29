import React from 'react';
import ReactDOM from 'react-dom/client';
import MemeStageApp from '../windows/MemeStageApp';
import { makeWindowTransparent, suppressBrowserContextMenu } from './shared';
import { loadConfig } from '../lib/config';
import { applyLanguage } from '../i18n';
import '../styles/overlay.css';
import '../styles/memeStage.css';

suppressBrowserContextMenu();
makeWindowTransparent();

// the recording veil is the only text here; it follows the language picked in Settings at startup
loadConfig()
	.then((config) => applyLanguage(config.language))
	.catch(() => {});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<MemeStageApp />
	</React.StrictMode>,
);
