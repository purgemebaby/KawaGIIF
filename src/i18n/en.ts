export const t = {
	app: {
		name: 'KawaGIIF',
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
		minimizeToTray: 'Hide as icon',
		panic: {
			title: 'Kill all animations',
			description:
				'Tired of the animations? Close them all in one click (you will keep the configuration)',
			button: 'Remove windows',
		},
	},

	storage: {
		title: 'Library',
		import: 'Import files',
		empty: "No files match the filters ┐('~`;)┌",
		emptyLibrary: 'Nothing here yet o(╥﹏╥)o',
		emptyHint: 'Import media to start filling your desktop.',
		emptyFilteredHint: 'Try another search, or clear the filters.',
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
			tags: (n: number) => `Tags (${n})`,
			toggle: (name: string) => `Select “${name}”`,
		},
		deleteConfirm: {
			title: (name: string, count: number) =>
				count === 1 ? `Delete “${name}”?` : `Delete ${count} files?`,
			body: (count: number) =>
				count === 1
					? 'KawaGIIF will remove it from your library and delete only its own copy.'
					: 'KawaGIIF will remove them from your library and delete only its own copies.',
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
		add: 'Add a tag',
		edit: 'Edit tags',
		remove: (tag: string) => `Remove tag ${tag}`,
		manage: 'Tags',
		manageEmpty: 'There are no tags in the library yet.',
		search: 'Search tags…',
		noMatches: "No tags match your search ┐('~`;)┌",
		useAsFilter: 'Use as filter',
		filtering: 'Filtering',
		removeFilter: (tag: string) => `Stop filtering by “${tag}”`,
		clearFilters: 'Clear filters',
		usedBy: (n: number) => (n === 1 ? '1 file' : `${n} files`),
		rename: 'Rename',
		deleteTitle: (tag: string) => `Delete the tag “${tag}”?`,
		deleteBody: (n: number) =>
			`It will be removed from ${n === 1 ? '1 file' : `${n} files`}. The files themselves are not deleted.`,
		bulk: {
			placeholder: 'Filter or create a tag',
			hint: 'Click a tag to add it to every selected file, or remove it from all.',
		},
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
			resizeStorage: 'Drag to resize Storage',
		},
		sidebarEmpty: 'Import files on the Library first (≧◡≦).',
		sidebarHint: 'Drag it onto the desktop to place it',
		sidebarNoMatches: 'No files match the search.',
		canvasHint: [
			'Drag an animation from Storage onto the desktop to place it.',
		],
		placedTitle: 'Placed',
		placedEmpty: "You haven't placed any animations yet.",
		removeItem: 'Remove from desktop',
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
			'Sets the size, angle, speed and opacity back to how the animation was placed. Its position stays the same.',
	},

	settings: {
		title: 'Settings',
		sections: {
			startup: {
				title: 'Startup',
				description: 'How KawaGIIF launches with your computer.',
			},
			library: {
				title: 'Library',
				description: 'How your media files are handled.',
			},
			appearance: {
				title: 'Appearance',
				description: 'Font, text size and zoom of the interface.',
			},
			motion: {
				title: 'Motion',
				description: 'Animations and the loading screen.',
			},
			performance: {
				title: 'Performance',
				description: 'How many animations you can place at once.',
			},
		},
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
				'KawaGIIF reserves 1 window per animation at startup. ' +
				'You can raise it to place more (between 1-20). ' +
				'Takes effect after restarting the app.',
		},
		confirmDelete: {
			label: 'Confirm before deleting files',
			hint: "Ask before removing a file from library. Only KawaGIIF's copy is deleted, never your original.",
		},
		font: {
			label: 'Interface font',
			hint: 'Font and text size of the whole app. The title and the loading screen keep their own font.',
			systemDefault: 'System default',
			search: 'Search fonts',
			noMatches: 'No fonts match',
			sizeLabel: 'Text size',
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
				'Make everything bigger or smaller. ' +
				'Shortcuts: Ctrl + plus, Ctrl + minus, Ctrl + 0 to reset, ' +
				'or Ctrl + mouse wheel.',
			zoomIn: 'Zoom in',
			zoomOut: 'Zoom out',
			reset: 'Reset',
		},
		navAnimations: {
			label: 'Navigation animations',
			hint: 'Screens switch instantly when this option is turned off.',
		},
		loadingIndicator: {
			label: 'Loading animation',
			hint: 'Replace the default asset that walks along the loading bar with your own GIF, PNG or JPEG. Recommended: square, 68x68 px.',
			choose: 'Choose image…',
			reset: 'Reset to default',
			filter: 'Image',
			warning:
				'This image is large or not square. It will be scaled down to fit, so it may look small or blurry.',
		},
		ram: {
			label: 'Memory',
			system: 'System memory',
			app: (mb: number) => `KawaGIIF uses about ${mb} MB (estimated)`,
		},
	},
} as const;
