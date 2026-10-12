import React from 'react';
import ReactDOM from 'react-dom/client';
import ControlApp from './windows/ControlApp';
import { suppressBrowserContextMenu } from './entries/shared';
import { invoke } from './lib/ipc';
import { applyAppearance, type Appearance } from './lib/appearance';
import './styles/index.css';

suppressBrowserContextMenu();
invoke<Appearance>('get_config')
	.then(applyAppearance)
	.catch(() => {});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<ControlApp />
	</React.StrictMode>,
);
