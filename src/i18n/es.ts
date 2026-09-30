/**
 * Todos los textos visibles de la interfaz, en castellano.
 *
 * Están centralizados aquí y no repartidos por los componentes para que
 * cambiar el copy sea tocar un archivo en vez de diez — que es exactamente
 * lo que costó el barrido de rioplatense a castellano.
 */
export const t = {
  app: {
    name: "KawaGIIF",
    tagline: "Animaciones y GIFs siempre visibles sobre tu escritorio.",
  },

  nav: {
    home: "Inicio",
    storage: "Biblioteca",
    editor: "Editor",
    settings: "Ajustes",
    open: "Abrir el menú",
    close: "Cerrar el menú",
    title: "Navegación principal",
  },

  common: {
    loading: "Cargando…",
    cancel: "Cancelar",
    save: "Guardar",
    discard: "Descartar",
    apply: "Aplicar",
    delete: "Eliminar",
    remove: "Quitar",
    close: "Cerrar",
    confirm: "Confirmar",
  },

  home: {
    title: "Inicio",
    minimizeToTray: "Minimizar a la bandeja",
    tiles: {
      home: "Vuelve a la pantalla de inicio.",
      storage: "Importa y organiza tu biblioteca de archivos.",
      editor: "Coloca y ajusta animaciones en el escritorio.",
      settings: "Autoarranque, bandeja del sistema, memoria.",
    },
    panic: {
      title: "Matar todas las animaciones",
      description:
        "¿Se te ha llenado el escritorio de animaciones? Ciérralas todas de un clic. No se borra nada: al reabrir el editor o reiniciar la app vuelven a aparecer.",
      button: "Matar todas las ventanas",
    },
  },

  storage: {
    title: "Biblioteca",
    import: "Importar archivos",
    empty: "Ningún archivo coincide con los filtros.",
    emptyLibrary: "Aquí no hay nada todavía",
    emptyHint: "Importa GIFs, vídeos o imágenes para empezar a llenar el escritorio.",
    search: "Buscar por nombre…",
    types: {
      all: "Todos",
      gif: "GIF",
      mp4: "MP4",
      jpeg: "JPEG",
      png: "PNG",
      webp: "WEBP",
    },
    sort: {
      label: "Ordenar",
      nameAsc: "Nombre A-Z",
      nameDesc: "Nombre Z-A",
      dateNew: "Más recientes primero",
      dateOld: "Más antiguos primero",
    },
    largeImport: {
      title: "Archivo grande",
      body: (list: string, total: string) =>
        `Vas a importar ${list}. En total ocupan ${total} en disco, y KawaGIIF guarda una copia propia de cada archivo. ¿Seguir?`,
      confirm: "Importar igualmente",
    },
    deleteConfirm: {
      title: "¿Eliminar este archivo?",
      body: (name: string) =>
        `Se eliminará «${name}» de la biblioteca y se borrará su archivo del disco. Esta acción no se puede deshacer.`,
      placedBody: (name: string, count: number) =>
        count === 1
          ? `«${name}» está colocada en el escritorio. Si la eliminas, también desaparecerá de ahí.`
          : `«${name}» está colocada en ${count} sitios del escritorio. Si la eliminas, también desaparecerá de todos ellos.`,
      confirm: "Eliminar de todos modos",
    },
  },

  tags: {
    label: "Etiquetas",
    none: "Sin etiquetas",
    add: "Añadir etiqueta…",
    edit: "Editar etiquetas",
    remove: (tag: string) => `Quitar la etiqueta ${tag}`,
    more: (n: number) => `+${n}`,
    manage: "Etiquetas",
    manageEmpty: "Todavía no hay ninguna etiqueta en la biblioteca.",
    search: "Buscar etiqueta…",
    noMatches: "Ninguna etiqueta coincide con la búsqueda.",
    useAsFilter: "Usar como filtro",
    filtering: "Filtrando",
    removeFilter: (tag: string) => `Dejar de filtrar por «${tag}»`,
    clearFilters: "Quitar filtros",
    usedBy: (n: number) => (n === 1 ? "1 archivo" : `${n} archivos`),
    rename: "Renombrar",
    deleteTitle: (tag: string) => `¿Eliminar la etiqueta «${tag}»?`,
    deleteBody: (n: number) =>
      `Se quitará de ${n === 1 ? "1 archivo" : `${n} archivos`}. Los archivos en sí no se borran.`,
  },

  editor: {
    title: "Editor",
    undo: "Deshacer",
    save: "Guardar",
    sidebarTitle: "Archivos",
    sidebarEmpty: "Importa archivos desde la Biblioteca primero.",
    sidebarHint: "Arrastra al escritorio para colocarlo",
    canvasHint: [
      "Arrastra una animación de la lista hacia el escritorio para colocarla.",
      "Haz clic sobre una animación ya colocada para seleccionarla y editarla.",
    ],
    placedTitle: "Colocadas",
    placedEmpty: "Todavía no has colocado ninguna animación.",
    removeItem: "Quitar del escritorio",
    saveConfirm: {
      title: "¿Aplicar los cambios?",
      added: (n: number) => `${n} ${n === 1 ? "añadida" : "añadidas"}`,
      moved: (n: number) => `${n} ${n === 1 ? "movida o redimensionada" : "movidas o redimensionadas"}`,
      removed: (n: number) => `${n} ${n === 1 ? "quitada" : "quitadas"}`,
      noChanges: "No hay ningún cambio pendiente.",
    },
    undoConfirm: {
      title: "¿Descartar todos los cambios?",
      body: "El escritorio volverá a como estaba la última vez que guardaste. Los cambios que hayas hecho desde entonces se perderán.",
      confirm: "Descartar cambios",
    },
    exitGuard: {
      title: "Tienes cambios sin guardar",
      body: "Si sales del editor ahora, el escritorio volverá a como estaba la última vez que guardaste.",
    },
  },

  properties: {
    title: "Propiedades",
    empty: "Selecciona una animación en el escritorio para editar sus propiedades.",
    opacity: "Opacidad",
    speed: "Velocidad",
    reset: "Restablecer",
    resetHint: "Devuelve opacidad y velocidad a sus valores por defecto. No cambia la posición ni el tamaño.",
  },

  settings: {
    title: "Ajustes",
    launchOnStartup: {
      label: "Iniciar con Windows",
      hint: "Arranca KawaGIIF automáticamente al encender el ordenador.",
    },
    startMinimized: {
      label: "Empezar minimizado en la bandeja",
      hint: "No mostrar el panel de control al arrancar.",
    },
    poolSize: {
      label: "Animaciones simultáneas",
      hint:
        "KawaGIIF reserva una ventana por animación al arrancar, ocupadas o no, " +
        "porque Windows no permite crearlas transparentes más tarde. Es lo que " +
        "más memoria consume: bájalo si vas justo, súbelo si quieres colocar más. " +
        "Se aplica al reiniciar la app.",
    },
    confirmDelete: {
      label: "Confirmar antes de eliminar archivos",
      hint: "Pregunta antes de borrar un archivo de la biblioteca. Borrar es irreversible.",
    },
    ram: {
      label: "Memoria",
      system: "Memoria del sistema",
      app: (mb: number) => `KawaGIIF usa unos ${mb} MB`,
      estimateNote: "Estimado: el motor web se reparte en varios procesos",
    },
  },
} as const;
