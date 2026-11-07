export const en = {
	app: {
		name: 'KawaGIIF',
	},

	nav: {
		home: 'Home',
		storage: 'Library',
		editor: 'Editor',
		memeboard: 'Memeboard',
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
		minimizeToTray: 'Minimize to tray',
		panic: {
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
		play: 'Play',
		pause: 'Pause',
		title: 'Library',
		import: 'Import files',
		empty: "No files match the filters ┐('~`;)┌",
		emptyLibrary: 'Nothing here yet o(╥﹏╥)o',
		emptyHint: 'Import media to start filling your desktop.',
		emptyFilteredHint: 'Try another search, or clear the filters.',
		rejected: (names: string[]) =>
			`Not imported (the content does not match the extension): ${names.join(', ')}`,
		tooLarge: (names: string[]) =>
			`Not imported (too big to show safely): ${names.join(', ')}`,
		dropSkipped: (names: string[]) =>
			`Not imported (not a GIF, video or image): ${names.join(', ')}`,
		dropHint: 'Drop to import',
		search: 'Search by name…',
		types: {
			all: 'All',
			gif: 'GIF',
			mp4: 'MP4',
			jpeg: 'JPEG',
			png: 'PNG',
			webp: 'WEBP',
			svg: 'SVG',
			mp3: 'MP3',
			wav: 'WAV',
			ogg: 'OGG',
		},
		tabs: {
			visual: 'Images & videos',
			audio: 'Audio',
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
		rotation: 'Rotation',
		reset: 'Reset',
		resetOne: (label: string) => `Reset ${label}`,
		resetHint:
			'Sets the size, angle, speed and opacity back to how the animation was placed. Its position stays the same.',
	},

	memeboard: {
		title: 'Memeboard',
		newMeme: 'New meme',
		defaultName: (n: number) => `Meme ${n}`,
		stopAll: 'Stop all',
		stopHint: (key: string) => `Stops every meme. Shortcut: ${key}`,
		empty: 'No memes yet (｡•́︿•̀｡)',
		emptyHint:
			'Pair an image, GIF or video with a sound, pick how it moves and give it a shortcut.',
		gameNote:
			'Visuals show over windowed and borderless games. Over exclusive fullscreen only the sound plays.',
		rejected: (reason: string) => `The meme didn't play: ${reason}`,
		tabs: {
			memes: 'Memes',
			podium: 'Podium',
		},
		card: {
			test: 'Play',
			edit: 'Edit',
			delete: 'Delete',
			noHotkey: 'No shortcut',
			conflict: 'Another app already uses this shortcut',
			onlySound: 'Sound only',
			deleteConfirm: {
				title: (name: string) => `Delete "${name}"?`,
				body: 'The meme goes, its image and sound stay in the library.',
				confirm: 'Delete meme',
			},
		},
		editor: {
			titleNew: 'New meme',
			titleEdit: 'Edit meme',
			media: 'What it shows and plays',
			name: 'Name',
			visual: 'Image, GIF or video',
			sound: 'Sound',
			none: 'None',
			videoSound: "Videos play their own sound, so this one isn't used.",
			animation: 'Animation',
			from: 'Comes in from',
			anchor: 'Appears at',
			options: 'Animation options',
			playback: 'Playback',
			monitor: 'Monitor',
			monitorName: (name: string, w: number, h: number) =>
				`${name} (${w}×${h})`,
			size: 'Size',
			motionSpeed: 'Animation speed',
			playbackSpeed: 'Playback speed',
			time: 'Time',
			timeInfo:
				'How long the meme lasts, 10 s at most. By default as long as its sound. A longer time repeats it.',
			volume: 'Volume',
			xAt: 'X',
			yAt: 'Y',
			positionAt: 'Position',
			randomAt: 'Random position',
			pxOf: (px: number, of: number) => `${px} px of ${of}`,
			hotkey: 'Shortcut',
			hotkeyPlaceholder: 'Click and press the keys',
			hotkeyListening: 'Press the keys…',
			hotkeyClear: 'Remove shortcut',
			hotkeyHint: 'Use Ctrl + AltGr (or Ctrl + Alt) with a key.',
			preview: 'Preview',
			save: 'Save meme',
			needsMedia: 'Pick an image or a sound first.',
		},
		behaviour: {
			cooldown: 'Meme cooldown',
			noWait: 'None',
			refire: 'If you press it while it plays',
			refires: {
				restart: 'Start over',
				stack: 'Add another on top',
				ignore: 'Ignore the press',
			},
			pitch: 'Random pitch on each play',
			pitchRange: 'Variation',
		},
		styles: {
			load: 'Load a saved style…',
			none: 'No saved styles yet',
			saveCurrent: 'Save style',
			name: 'Style name',
			save: 'Save',
			delete: 'Delete this style',
		},
		options: {
			popIn: 'Pop in time',
			popOut: 'Pop out time',
			intensity: 'Intensity',
			dvdColors: 'Change colour on each bounce',
			partyCount: 'Pop-ups',
			partyInfo:
				'Tiny pop-ups of all your saved memes, all over the screen. Its sound plays as usual.',
			corner: 'Corner',
			margin: 'Margin from the edges',
			comboStep: 'Flames grow every',
			comboHits: (n: number) => `${n} presses`,
			comboInfo:
				'How long the combo lasts after the last press. Each press within this time adds one, up to 99; without one, the flames die down and the meme fades out.',
		},
		infoLabel: 'More info',
		animations: {
			pop: 'Pop',
			static: 'Still',
			dvd_bounce: 'DVD bounce',
			bounce: 'Bounce',
			shake: 'Shake',
			cross: 'Cross the screen',
			fall: 'Fall',
			path: 'Recorded path',
			party: 'Party',
			combo: 'Combo',
		},
		corners: {
			top_left: 'Top left',
			top_right: 'Top right',
			bottom_left: 'Bottom left',
			bottom_right: 'Bottom right',
		},
		sides: {
			left: 'Left',
			right: 'Right',
			top: 'Top',
			bottom: 'Bottom',
			random: 'Random',
		},
		anchors: {
			cursor: 'Cursor',
			center: 'Centre',
			random: 'Random',
			fixed: 'Fixed spot',
		},
		refusals: {
			invalid: "That key can't be a shortcut.",
			needs_modifier:
				'Add more modifiers: letters and numbers need two of Ctrl, Alt and Shift.',
			reserved: 'Windows or other apps rely on that shortcut.',
			duplicate: 'Another meme or the Stop all shortcut already uses it.',
			limit: 'All 10 shortcuts are taken.',
		},
		path: {
			draw: 'Hold the click on the preview and move to draw the path.',
			clear: 'Delete path',
			points: (n: number) => `${n} points`,
			none: 'No path drawn yet.',
		},
		podium: {
			empty: 'Play a few memes and the most used ones climb here.',
			plays: (n: number) => (n === 1 ? '1 play' : `${n} plays`),
		},
		settings: {
			section: 'Memeboard',
			output: {
				label: 'Sound output',
				hint: 'Pick a virtual cable (VB-Cable) to send memes to a voice chat as your microphone. Both keeps them on your speakers too.',
				default: 'Default speakers',
				both: (name: string) => `Speakers + ${name}`,
			},
			volume: { label: 'Meme volume' },
			concurrent: {
				label: 'Memes at once',
				hint: 'Up to 10, if the memory allows it.',
			},
			stopHotkey: {
				label: 'Stop all shortcut',
				hint: 'Stops every sound and clears the screen.',
			},
		},
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
