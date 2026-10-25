export const en = {
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
		dismiss: 'Dismiss',
	},

	errors: {
		generic: (detail: string) => `Something went wrong: ${detail}`,
		// Boot report; only the parts above zero are joined.
		overlaysSkipped: (missing: number, notPlaced: number, poolSize: number) => {
			const parts: string[] = [];
			if (missing > 0)
				parts.push(
					`${missing} saved animation${missing === 1 ? '' : 's'} skipped: file${missing === 1 ? '' : 's'} not found.`,
				);
			if (notPlaced > 0)
				parts.push(
					`${notPlaced} animation${notPlaced === 1 ? '' : 's'} didn't fit. Raise “Simultaneous animations” in Settings (now ${poolSize}).`,
				);
			return parts.join(' ');
		},
	},

	home: {
		minimizeToTray: 'Hide as icon',
		panic: {
			description:
				'Tired of the animations? Close them all in one click (you will keep the configuration)',
			button: 'Remove windows',
		},
	},

	update: {
		title: (version: string) => `New update (●´ω｀●) v${version}`,
		install: 'Update',
		installing: 'Updating…',
		dismiss: 'Dismiss',
	},

	storage: {
		title: 'Library',
		import: 'Import files',
		empty: "No files match the filters ┐('~`;)┌",
		emptyLibrary: 'Nothing here yet o(╥﹏╥)o',
		emptyHint: 'Import media to start filling your desktop.',
		emptyFilteredHint: 'Try another search, or clear the filters.',
		rejected: (names: string[]) =>
			`Not imported (the content does not match the extension): ${names.join(', ')}`,
		search: 'Search by name…',
		types: {
			all: 'All',
			gif: 'GIF',
			mp4: 'MP4',
			jpeg: 'JPEG',
			png: 'PNG',
			webp: 'WEBP',
			svg: 'SVG',
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
		replaceImport: {
			title: 'Replace files?',
			body: 'These files are already in your library. Replace them with the new version? Tags and placed animations are kept.',
			confirm: 'Replace',
			skip: 'Skip',
		},
		renameHint: 'Double-click to rename',
		renameLabel: 'File name',
		missingFile: 'File missing',
		missingFileHint:
			'This file was deleted from the media folder. Delete the entry or import the file again.',
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
		canvasHint: 'Drag an animation from Storage onto the desktop to place it.',
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
			startup: { title: 'Startup' },
			library: { title: 'Library' },
			appearance: { title: 'Appearance' },
			motion: { title: 'Motion' },
			performance: { title: 'Performance' },
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
		openFolder: {
			label: 'App folder',
			hint: 'Open the folder with your library, media and settings file.',
			button: 'Open folder',
		},
		language: {
			label: 'Language',
			hint: 'The window reloads to switch language.',
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
			hint: 'Screens switch instantly and the mascot holds still when this option is turned off.',
		},
		showMascot: {
			label: 'Show mascot',
			hint: 'The chibi in Home, Settings, the Editor and the empty Library.',
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

/** The shape every language fills in: same keys as `en`, plain strings instead of literals. */
type Widen<T> = T extends string
	? string
	: T extends (...args: infer A) => string
		? (...args: A) => string
		: { readonly [K in keyof T]: Widen<T[K]> };
export type Strings = Widen<typeof en>;
