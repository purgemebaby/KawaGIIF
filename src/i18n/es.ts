import type { Strings } from './en';

/** Spanish (Spain) strings, with the same keys as `en`. */
export const es: Strings = {
	app: {
		name: 'KawaGIIF',
	},

	nav: {
		home: 'Inicio',
		storage: 'Biblioteca',
		editor: 'Editor',
		memeboard: 'Memeboard',
		settings: 'Ajustes',
		backHome: 'Volver al inicio',
		title: 'Navegación principal',
	},

	common: {
		loading: 'Cargando…',
		cancel: 'Cancelar',
		save: 'Guardar',
		discard: 'Descartar',
		apply: 'Aplicar',
		delete: 'Eliminar',
		dismiss: 'Descartar',
	},

	errors: {
		generic: (detail: string) => `Algo salió mal: ${detail}`,
		overlaysSkipped: (missing: number, notPlaced: number, poolSize: number) => {
			const parts: string[] = [];
			if (missing > 0)
				parts.push(
					`${missing} animación${missing === 1 ? '' : 'es'} guardada${missing === 1 ? '' : 's'} omitida${missing === 1 ? '' : 's'}: archivo${missing === 1 ? '' : 's'} no encontrado${missing === 1 ? '' : 's'}.`,
				);
			if (notPlaced > 0)
				parts.push(
					`${notPlaced} animación${notPlaced === 1 ? '' : 'es'} no ${notPlaced === 1 ? 'cupo' : 'cupieron'}. Sube “Animaciones simultáneas” en Ajustes (ahora ${poolSize}).`,
				);
			return parts.join(' ');
		},
	},

	home: {
		minimizeToTray: 'Minimizar a la bandeja',
		panic: {
			button: 'Quitar ventanas',
		},
	},

	update: {
		title: (version: string) => `Nueva versión (●´ω｀●) v${version}`,
		install: 'Actualizar',
		installing: 'Actualizando…',
		dismiss: 'Cerrar',
	},

	storage: {
		play: 'Reproducir',
		pause: 'Pausa',
		title: 'Biblioteca',
		import: 'Importar archivos',
		empty: "Ningún archivo coincide con los filtros ┐('~`;)┌",
		emptyLibrary: 'Aún no hay nada aquí o(╥﹏╥)o',
		emptyHint:
			'Importa archivos multimedia para empezar a llenar tu escritorio.',
		emptyFilteredHint: 'Prueba con otra búsqueda o limpia los filtros.',
		rejected: (names: string[]) =>
			`No se importó (el contenido no coincide con la extensión): ${names.join(', ')}`,
		tooLarge: (names: string[]) =>
			`No se importó (demasiado grande para mostrarse sin riesgo): ${names.join(', ')}`,
		dropSkipped: (names: string[]) =>
			`No se importó (no es un GIF, vídeo ni imagen): ${names.join(', ')}`,
		dropHint: 'Suelta para importar',
		search: 'Buscar por nombre…',
		types: {
			all: 'Todos',
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
			visual: 'Imágenes y vídeos',
			audio: 'Audios',
		},
		sort: {
			label: 'Ordenar',
			nameAsc: 'Nombre A-Z',
			nameDesc: 'Nombre Z-A',
			dateNew: 'Más recientes primero',
			dateOld: 'Más antiguos primero',
		},
		largeImport: {
			title: 'Archivo grande',
			fileEntry: (name: string, size: string) => `“${name}” (${size})`,
			body: (list: string, total: string) =>
				`Vas a importar ${list}. En conjunto ocupan ${total} en el disco, y KawaGIIF guarda su propia copia de cada archivo. ¿Continuar?`,
			confirm: 'Importar igualmente',
		},
		replaceImport: {
			title: '¿Reemplazar archivos?',
			body: 'Estos archivos ya están en tu biblioteca. ¿Quieres reemplazarlos por la nueva versión? Las etiquetas y las animaciones colocadas se conservan.',
			confirm: 'Reemplazar',
			skip: 'Omitir',
		},
		renameHint: 'Doble clic para renombrar',
		renameLabel: 'Nombre del archivo',
		missingFile: 'Archivo no encontrado',
		missingFileHint:
			'Este archivo se eliminó de la carpeta de medios. Elimina la entrada o importa el archivo de nuevo.',
		select: {
			start: 'Seleccionar',
			all: 'Seleccionar todo',
			done: 'Listo',
			count: (n: number) => `${n} seleccionado${n === 1 ? '' : 's'}`,
			delete: (n: number) => `Eliminar (${n})`,
			tags: (n: number) => `Etiquetas (${n})`,
			toggle: (name: string) => `Seleccionar “${name}”`,
		},
		deleteConfirm: {
			title: (name: string, count: number) =>
				count === 1 ? `¿Eliminar “${name}”?` : `¿Eliminar ${count} archivos?`,
			body: (count: number) =>
				count === 1
					? 'KawaGIIF lo quitará de tu biblioteca y eliminará solo su propia copia.'
					: 'KawaGIIF los quitará de tu biblioteca y eliminará solo sus propias copias.',
			placed: (count: number) =>
				count === 1
					? 'Se está mostrando en tu escritorio ahora mismo y también desaparecerá de allí.'
					: 'Algunas se están mostrando en tu escritorio ahora mismo y también desaparecerán de allí.',
			keep: 'Conservar',
			confirm: (count: number) =>
				count === 1 ? 'Eliminar' : `Eliminar ${count} archivos`,
		},
	},

	tags: {
		label: 'Etiquetas',
		none: 'Sin etiquetas',
		add: 'Añadir una etiqueta',
		edit: 'Editar etiquetas',
		remove: (tag: string) => `Quitar la etiqueta ${tag}`,
		manage: 'Etiquetas',
		manageEmpty: 'Todavía no hay etiquetas en la biblioteca.',
		search: 'Buscar etiquetas…',
		noMatches: "Ninguna etiqueta coincide con tu búsqueda ┐('~`;)┌",
		useAsFilter: 'Usar como filtro',
		filtering: 'Filtrando',
		removeFilter: (tag: string) => `Dejar de filtrar por “${tag}”`,
		clearFilters: 'Limpiar filtros',
		usedBy: (n: number) => (n === 1 ? '1 archivo' : `${n} archivos`),
		rename: 'Renombrar',
		deleteTitle: (tag: string) => `¿Eliminar la etiqueta “${tag}”?`,
		deleteBody: (n: number) =>
			`Se quitará de ${n === 1 ? '1 archivo' : `${n} archivos`}. Los archivos en sí no se eliminan.`,
		bulk: {
			placeholder: 'Filtra o crea una etiqueta',
			hint: 'Haz clic en una etiqueta para añadirla a todos los archivos seleccionados, o para quitarla de todos.',
		},
	},

	editor: {
		undo: 'Deshacer',
		save: 'Guardar',
		panels: {
			storage: 'Almacenamiento',
			control: 'Control',
			edit: 'Edición',
			collapse: (title: string) => `Plegar ${title}`,
			expand: (title: string) => `Desplegar ${title}`,
			resizeStorage: 'Arrastra para cambiar el tamaño de Almacenamiento',
		},
		sidebarEmpty: 'Primero importa archivos en la Biblioteca (≧◡≦).',
		sidebarHint: 'Arrástralo al escritorio para colocarlo',
		sidebarNoMatches: 'Ningún archivo coincide con la búsqueda.',
		canvasHint:
			'Arrastra una animación desde Almacenamiento al escritorio para colocarla.',
		placedTitle: 'Colocadas',
		placedEmpty: 'Todavía no has colocado ninguna animación.',
		removeItem: 'Quitar del escritorio',
		saveConfirm: {
			title: '¿Aplicar los cambios?',
			added: (n: number) => (n === 1 ? '1 añadida' : `${n} añadidas`),
			moved: (n: number) =>
				n === 1
					? '1 movida o redimensionada'
					: `${n} movidas o redimensionadas`,
			removed: (n: number) => (n === 1 ? '1 quitada' : `${n} quitadas`),
			noChanges: 'No hay cambios pendientes.',
		},
		undoConfirm: {
			title: '¿Descartar todos los cambios?',
			body: 'El escritorio volverá a como estaba la última vez que guardaste. Los cambios hechos desde entonces se perderán.',
			confirm: 'Descartar cambios',
		},
		exitGuard: {
			title: 'Tienes cambios sin guardar',
			body: 'Si sales del editor ahora, el escritorio volverá a como estaba la última vez que guardaste.',
		},
	},

	properties: {
		empty:
			'Selecciona una animación del escritorio para editar sus propiedades.',
		opacity: 'Opacidad',
		speed: 'Velocidad',
		rotation: 'Rotación',
		reset: 'Restablecer',
		resetOne: (label: string) => `Restablecer ${label.toLowerCase()}`,
		resetHint:
			'Restablece el tamaño, el ángulo, la velocidad y la opacidad a como estaba la animación al colocarla. Su posición no cambia.',
	},

	memeboard: {
		title: 'Memeboard',
		newMeme: 'Nuevo meme',
		defaultName: (n: number) => `Meme ${n}`,
		stopAll: 'Parar todo',
		stopHint: (key: string) => `Para todos los memes. Atajo: ${key}`,
		empty: 'Aún no hay memes (｡•́︿•̀｡)',
		emptyHint:
			'Junta una imagen, GIF o vídeo con un sonido, elige cómo se mueve y dale un atajo.',
		gameNote:
			'Lo visual se ve sobre juegos en ventana o sin bordes. En pantalla completa exclusiva solo suena el audio.',
		rejected: (reason: string) => `El meme no se reprodujo: ${reason}`,
		tabs: {
			memes: 'Memes',
			podium: 'Podio',
		},
		card: {
			test: 'Reproducir',
			edit: 'Editar',
			delete: 'Borrar',
			noHotkey: 'Sin atajo',
			conflict: 'Otra app ya usa este atajo',
			onlySound: 'Solo sonido',
			deleteConfirm: {
				title: (name: string) => `¿Borrar «${name}»?`,
				body: 'Se borra el meme; su imagen y su sonido siguen en la biblioteca.',
				confirm: 'Borrar meme',
			},
		},
		editor: {
			titleNew: 'Nuevo meme',
			titleEdit: 'Editar meme',
			media: 'Qué muestra y qué suena',
			name: 'Nombre',
			visual: 'Imagen, GIF o vídeo',
			sound: 'Sonido',
			none: 'Ninguno',
			videoSound: 'Los vídeos usan su propio sonido, así que este no se usa.',
			animation: 'Animación',
			from: 'Entra por',
			anchor: 'Aparece en',
			options: 'Opciones de la animación',
			playback: 'Reproducción',
			monitor: 'Monitor',
			monitorName: (name: string, w: number, h: number) =>
				`${name} (${w}×${h})`,
			size: 'Tamaño',
			motionSpeed: 'Velocidad de la animación',
			playbackSpeed: 'Velocidad de reproducción',
			time: 'Tiempo',
			timeInfo:
				'Cuánto dura el meme, 10 s como máximo. Por defecto lo que dure su sonido. Un tiempo mayor lo repite.',
			volume: 'Volumen',
			heightAt: 'Altura',
			widthAt: 'Posición',
			pxOf: (px: number, of: number) => `${px} px de ${of}`,
			hotkey: 'Atajo',
			hotkeyPlaceholder: 'Haz clic y pulsa las teclas',
			hotkeyListening: 'Pulsa las teclas…',
			hotkeyClear: 'Quitar atajo',
			hotkeyHint: 'Usa Ctrl + AltGr (o Ctrl + Alt) con una tecla.',
			preview: 'Vista previa',
			save: 'Guardar meme',
			needsMedia: 'Elige antes una imagen o un sonido.',
		},
		behaviour: {
			cooldown: 'Cooldown del meme',
			noWait: 'Ninguno',
			refire: 'Si lo pulsas mientras suena',
			refires: {
				restart: 'Empieza de nuevo',
				stack: 'Suma otro encima',
				ignore: 'Ignora la pulsación',
			},
			pitch: 'Variar el tono en cada uso',
			pitches: {
				off: 'No',
				low: 'Un poco',
				high: 'Mucho',
			},
		},
		styles: {
			load: 'Cargar un estilo guardado…',
			none: 'Aún no hay estilos guardados',
			saveCurrent: 'Guardar estilo',
			name: 'Nombre del estilo',
			save: 'Guardar',
			delete: 'Borrar este estilo',
		},
		options: {
			popIn: 'Tiempo de entrada',
			popOut: 'Tiempo de salida',
			intensity: 'Intensidad',
			dvdColors: 'Cambiar de color en cada rebote',
		},
		infoLabel: 'Más información',
		animations: {
			pop: 'Aparecer de golpe',
			static: 'Estático',
			dvd_bounce: 'Rebote DVD',
			bounce: 'Rebotar',
			shake: 'Temblar',
			cross: 'Cruzar la pantalla',
			fall: 'Caer',
			path: 'Trayectoria grabada',
		},
		sides: {
			left: 'Izquierda',
			right: 'Derecha',
			top: 'Arriba',
			bottom: 'Abajo',
		},
		anchors: {
			cursor: 'Cursor',
			center: 'Centro',
			random: 'Aleatorio',
			fixed: 'Punto fijo',
		},
		refusals: {
			invalid: 'Esa tecla no puede ser un atajo.',
			needs_modifier:
				'Añade más modificadores: letras y números necesitan dos de Ctrl, Alt y Shift.',
			reserved: 'Windows u otras apps usan ese atajo.',
			duplicate: 'Otro meme o el atajo de Parar todo ya lo usa.',
			limit: 'Los 10 atajos están ocupados.',
		},
		path: {
			draw: 'Mantén el clic en la vista previa y muévete para dibujar la trayectoria.',
			clear: 'Borrar trayectoria',
			points: (n: number) => `${n} puntos`,
			none: 'Aún no hay trayectoria dibujada.',
		},
		podium: {
			empty: 'Reproduce unos memes y los más usados subirán aquí.',
			plays: (n: number) => (n === 1 ? '1 vez' : `${n} veces`),
		},
		settings: {
			section: 'Memeboard',
			output: {
				label: 'Salida de sonido',
				hint: 'Elige un cable virtual (VB-Cable) para mandar los memes a un chat de voz como tu micrófono. Ambos los mantiene también en tus altavoces.',
				default: 'Altavoces por defecto',
				both: (name: string) => `Altavoces + ${name}`,
			},
			volume: { label: 'Volumen de los memes' },
			concurrent: {
				label: 'Memes a la vez',
				hint: 'Hasta 10, si la memoria lo permite.',
			},
			stopHotkey: {
				label: 'Atajo de Parar todo',
				hint: 'Para todos los sonidos y limpia la pantalla.',
			},
		},
	},

	settings: {
		title: 'Ajustes',
		sections: {
			startup: { title: 'Arranque' },
			library: { title: 'Biblioteca' },
			appearance: { title: 'Apariencia' },
			motion: { title: 'Movimiento' },
			performance: { title: 'Rendimiento' },
		},
		launchOnStartup: {
			label: 'Iniciar con Windows',
			hint: 'Inicia KawaGIIF automáticamente al encender el equipo.',
		},
		startMinimized: {
			label: 'Iniciar minimizado en la bandeja del sistema',
			hint: 'No muestra el panel de control al iniciar.',
		},
		poolSize: {
			label: 'Animaciones simultáneas',
			hint:
				'KawaGIIF reserva 1 ventana por animación al iniciarse. ' +
				'Puedes aumentarlo para colocar más (entre 1 y 20). ' +
				'Surte efecto al reiniciar la app.',
		},
		confirmDelete: {
			label: 'Confirmar antes de eliminar archivos',
			hint: 'Pregunta antes de quitar un archivo de la biblioteca. Solo se elimina la copia de KawaGIIF, nunca tu original.',
		},
		openFolder: {
			label: 'Carpeta de la app',
			hint: 'Abre la carpeta con tu biblioteca, tus archivos y el archivo de ajustes.',
			button: 'Abrir carpeta',
		},
		language: {
			label: 'Idioma',
			hint: 'La ventana se recarga para cambiar de idioma.',
		},
		font: {
			label: 'Fuente de la interfaz',
			hint: 'Fuente y tamaño de texto de toda la app. El título y la pantalla de carga mantienen su propia fuente.',
			systemDefault: 'Predeterminada del sistema',
			search: 'Buscar fuentes',
			noMatches: 'Ninguna fuente coincide',
			sizeLabel: 'Tamaño del texto',
			sizes: {
				small: 'Pequeño',
				default: 'Predeterminado',
				large: 'Grande',
				larger: 'Muy grande',
			},
		},
		zoom: {
			label: 'Zoom de la interfaz',
			hint:
				'Hace todo más grande o más pequeño. ' +
				'Atajos: Ctrl + más, Ctrl + menos, Ctrl + 0 para restablecer, ' +
				'o Ctrl + rueda del ratón.',
			zoomIn: 'Acercar',
			zoomOut: 'Alejar',
			reset: 'Restablecer',
		},
		navAnimations: {
			label: 'Animaciones de navegación',
			hint: 'Las pantallas cambian al instante y la mascota se queda quieta cuando esta opción está desactivada.',
		},
		showMascot: {
			label: 'Mostrar mascota',
			hint: 'La chibi de Inicio, Ajustes, el Editor y la Biblioteca vacía.',
		},
		loadingIndicator: {
			label: 'Animación de carga',
			hint: 'Sustituye el recurso predeterminado que camina junto a la barra de carga por tu propio GIF, PNG o JPEG. Recomendado: cuadrado, 68x68 px.',
			choose: 'Elegir imagen…',
			reset: 'Restablecer imagen predeterminada',
			filter: 'Imagen',
			warning:
				'Esta imagen es grande o no es cuadrada. Se reducirá para que quepa, así que puede verse pequeña o borrosa.',
		},
		ram: {
			label: 'Memoria',
			system: 'Memoria del sistema',
			app: (mb: number) => `KawaGIIF usa unos ${mb} MB (estimado)`,
		},
	},
};
