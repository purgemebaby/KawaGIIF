export const t = {
	app: {
		name: 'KawaGIIF',
		tagline: 'Animations and GIFs always visible on your desktop.',
	},

	nav: {
		home: 'Home',
		storage: 'Library',
		editor: 'Editor',
		settings: 'Settings',
		backHome: 'Back to Home',
		title: 'Main navigation',
	},

	common: {
		loading: 'Loading…',
		cancel: 'Cancel',
		save: 'Save',
		discard: 'Discard',
		apply: 'Apply',
		delete: 'Delete',
	},

	home: {
		minimizeToTray: 'Minimize to tray',
		panic: {
			title: 'Kill all animations',
			description:
				'Desktop crowded with animations? Close them all in one click. Nothing is deleted: they come back when you reopen the editor or restart the app.',
			button: 'Kill all windows',
		},
	},

	storage: {
		title: 'Library',
		import: 'Import files',
		empty: 'No files match the filters.',
		emptyLibrary: 'Nothing here yet',
		emptyHint: 'Import GIFs, videos or images to start filling your desktop.',
		search: 'Search by name…',
		types: {
			all: 'All',
			gif: 'GIF',
			mp4: 'MP4',
			jpeg: 'JPEG',
			png: 'PNG',
			webp: 'WEBP',
		},
		sort: {
			label: 'Sort',
			nameAsc: 'Name A-Z',
			nameDesc: 'Name Z-A',
			dateNew: 'Newest first',
			dateOld: 'Oldest first',
		},
		largeImport: {
			title: 'Large file',
			fileEntry: (name: string, size: string) => `“${name}” (${size})`,
			body: (list: string, total: string) =>
				`You're about to import ${list}. Together they take ${total} on disk, and KawaGIIF keeps its own copy of each file. Continue?`,
			confirm: 'Import anyway',
		},
		select: {
			start: 'Select',
			all: 'Select all',
			done: 'Done',
			count: (n: number) => `${n} selected`,
			delete: (n: number) => `Delete (${n})`,
			toggle: (name: string) => `Select “${name}”`,
		},
		deleteConfirm: {
			title: (name: string, count: number) =>
				count === 1 ? `Delete “${name}”?` : `Delete ${count} files?`,
			body: (count: number) =>
				count === 1
					? 'KawaGIIF will remove it from your library and delete its own copy. Your original file stays where it is.'
					: 'KawaGIIF will remove them from your library and delete its own copies. Your original files stay where they are.',
			placed: (count: number) =>
				count === 1
					? "It's showing on your desktop right now and will disappear from there too."
					: 'Some of them are showing on your desktop right now and will disappear from there too.',
			keep: 'Keep',
			confirm: (count: number) =>
				count === 1 ? 'Delete' : `Delete ${count} files`,
		},
	},

	tags: {
		label: 'Tags',
		none: 'No tags',
		add: 'Add tag…',
		edit: 'Edit tags',
		remove: (tag: string) => `Remove tag ${tag}`,
		more: (n: number) => `+${n}`,
		manage: 'Tags',
		manageEmpty: 'There are no tags in the library yet.',
		search: 'Search tags…',
		noMatches: 'No tags match your search.',
		useAsFilter: 'Use as filter',
		filtering: 'Filtering',
		removeFilter: (tag: string) => `Stop filtering by “${tag}”`,
		clearFilters: 'Clear filters',
		usedBy: (n: number) => (n === 1 ? '1 file' : `${n} files`),
		rename: 'Rename',
		deleteTitle: (tag: string) => `Delete the tag “${tag}”?`,
		deleteBody: (n: number) =>
			`It will be removed from ${n === 1 ? '1 file' : `${n} files`}. The files themselves are not deleted.`,
	},

	editor: {
		undo: 'Undo',
		save: 'Save',
		panels: {
			storage: 'Storage',
			control: 'Control',
			edit: 'Edit',
			collapse: (title: string) => `Collapse ${title}`,
			expand: (title: string) => `Expand ${title}`,
		},
		sidebarEmpty: 'Import files from the Library first.',
		sidebarHint:
			'Click to place it in the middle of the monitor, or drag it onto the desktop',
		canvasHint: [
			'Click an animation in Storage to place it in the middle of the monitor, or drag it onto the desktop.',
			"Click an animation that's already placed to select and edit it.",
		],
		placedTitle: 'Placed',
		placedEmpty: "You haven't placed any animations yet.",
		removeItem: 'Remove from desktop',
		monitor: {
			targetLabel: 'New animations on',
			moveLabel: 'Move to',
			targetHint: 'New animations appear in the middle of this monitor.',
			moveHint: 'Moves the animation to the middle of the chosen monitor.',
			option: (n: number, width: number, height: number) =>
				`Monitor ${n} · ${width}×${height}`,
			primary: '(main)',
		},
		saveConfirm: {
			title: 'Apply the changes?',
			added: (n: number) => `${n} added`,
			moved: (n: number) => `${n} moved or resized`,
			removed: (n: number) => `${n} removed`,
			noChanges: 'There are no pending changes.',
		},
		undoConfirm: {
			title: 'Discard all changes?',
			body: 'The desktop will go back to how it was the last time you saved. Any changes made since then will be lost.',
			confirm: 'Discard changes',
		},
		exitGuard: {
			title: 'You have unsaved changes',
			body: 'If you leave the editor now, the desktop will go back to how it was the last time you saved.',
		},
	},

	properties: {
		empty: 'Select an animation on the desktop to edit its properties.',
		opacity: 'Opacity',
		speed: 'Speed',
		reset: 'Reset',
		resetHint:
			'Sets opacity and speed back to their defaults. Position and size stay the same.',
	},

	settings: {
		title: 'Settings',
		launchOnStartup: {
			label: 'Start with Windows',
			hint: 'Launch KawaGIIF automatically when the computer starts.',
		},
		startMinimized: {
			label: 'Start minimized to tray',
			hint: "Don't show the control panel at startup.",
		},
		poolSize: {
			label: 'Simultaneous animations',
			hint:
				'KawaGIIF reserves one window per animation at startup, used or not, ' +
				"because Windows doesn't allow creating transparent ones later. Unused ones " +
				'sleep but still cost about 20 MB each; raise it to place more. Between 1 and 20. ' +
				'Takes effect after restarting the app.',
		},
		confirmDelete: {
			label: 'Confirm before deleting files',
			hint: "Ask before removing a file from the library. Only KawaGIIF's copy is deleted, never your original. Files showing on the desktop always ask.",
		},
		font: {
			label: 'Interface font',
			hint: 'Font and text size of the whole app. The title and the loading screen keep their own font.',
			systemDefault: 'System default',
			search: 'Search fonts',
			noMatches: 'No fonts match',
			sizeLabel: 'Text size',
			preview: 'The quick brown fox jumps over the lazy dog 0123456789',
			sizes: {
				small: 'Small',
				default: 'Default',
				large: 'Large',
				larger: 'Larger',
			},
		},
		zoom: {
			label: 'Interface zoom',
			hint:
				'Make everything bigger or smaller. Shortcuts: Ctrl + plus, Ctrl + minus, Ctrl + 0 to reset, ' +
				'or Ctrl + mouse wheel.',
			zoomIn: 'Zoom in',
			zoomOut: 'Zoom out',
			reset: 'Reset',
		},
		navAnimations: {
			label: 'Navigation animations',
			hint: "Ring menu, sliding between sections and the editor's opening. Off: screens switch instantly.",
		},
		loadingIndicator: {
			label: 'Loading animation',
			hint: 'Replace the ball that walks along the loading bar with your own GIF, PNG or JPEG. Recommended: square, 68x68 px (shown at 34 px).',
			choose: 'Choose image…',
			reset: 'Reset to default',
			filter: 'Image',
			warning:
				'This image is large or not square. It will be scaled down to fit, so it may look small or blurry.',
		},
		ram: {
			label: 'Memory',
			system: 'System memory',
			app: (mb: number) => `KawaGIIF uses about ${mb} MB`,
			estimateNote:
				'Estimate: the web engine is split across several processes',
		},
	},
} as const;
