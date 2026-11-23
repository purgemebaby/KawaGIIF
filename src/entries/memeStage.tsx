import React from 'react';
import ReactDOM from 'react-dom/client';
import MemeStageApp from '../windows/MemeStageApp';
import { makeWindowTransparent, suppressBrowserContextMenu } from './shared';
import '../styles/overlay.css';
import '../styles/memeStage.css';

suppressBrowserContextMenu();
makeWindowTransparent();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<MemeStageApp />
	</React.StrictMode>,
);
