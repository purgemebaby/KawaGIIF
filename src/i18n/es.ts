import type { Strings } from './en';

/** Spanish (Spain) strings; same keys as `en`. */
export const es: Strings = {
	app: {
		name: 'KawaGIIF',
	},

	nav: {
		home: 'Inicio',
		storage: 'Biblioteca',
		editor: 'Editor',
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
	},

	home: {
		minimizeToTray: 'Ocultar como icono',
		panic: {
			description:
				'¿Cansado de las animaciones? Ciérralas todas con un clic (conservarás la configuración)',
			button: 'Quitar ventanas',
		},
	},

	storage: {
		title: 'Biblioteca',
		import: 'Importar archivos',
		empty: "Ningún archivo coincide con los filtros ┐('~`;)┌",
		emptyLibrary: 'Aún no hay nada aquí o(╥﹏╥)o',
		emptyHint:
			'Importa archivos multimedia para empezar a llenar tu escritorio.',
		emptyFilteredHint: 'Prueba con otra búsqueda o limpia los filtros.',
		search: 'Buscar por nombre…',
		types: {
			all: 'Todos',
			gif: 'GIF',
			mp4: 'MP4',
			jpeg: 'JPEG',
			png: 'PNG',
			webp: 'WEBP',
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
		reset: 'Restablecer',
		resetHint:
			'Restablece el tamaño, el ángulo, la velocidad y la opacidad a como estaba la animación al colocarla. Su posición no cambia.',
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
