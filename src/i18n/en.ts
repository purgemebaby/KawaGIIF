export const t = {
  app: {
    name: "KawaGIIF",
    tagline: "Animations and GIFs always visible on your desktop.",
  },

  nav: {
    home: "Home",
    storage: "Library",
    editor: "Editor",
    settings: "Settings",
    open: "Open the menu",
    close: "Close the menu",
    title: "Main navigation",
  },

  common: {
    loading: "Loading…",
    cancel: "Cancel",
    save: "Save",
    discard: "Discard",
    apply: "Apply",
    delete: "Delete",
  },

  home: {
    minimizeToTray: "Minimize to tray",
    tiles: {
      home: "Go back to the home screen.",
      storage: "Import and organize your media library.",
      editor: "Place and adjust animations on the desktop.",
      settings: "Startup, system tray, memory.",
    },
    panic: {
      title: "Kill all animations",
      description:
        "Desktop crowded with animations? Close them all in one click. Nothing is deleted: they come back when you reopen the editor or restart the app.",
      button: "Kill all windows",
    },
  },

  storage: {
    title: "Library",
    import: "Import files",
    empty: "No files match the filters.",
    emptyLibrary: "Nothing here yet",
    emptyHint: "Import GIFs, videos or images to start filling your desktop.",
    search: "Search by name…",
    types: {
      all: "All",
      gif: "GIF",
      mp4: "MP4",
      jpeg: "JPEG",
      png: "PNG",
      webp: "WEBP",
    },
    sort: {
      label: "Sort",
      nameAsc: "Name A-Z",
      nameDesc: "Name Z-A",
      dateNew: "Newest first",
      dateOld: "Oldest first",
    },
    largeImport: {
      title: "Large file",
      fileEntry: (name: string, size: string) => `“${name}” (${size})`,
      body: (list: string, total: string) =>
        `You're about to import ${list}. Together they take ${total} on disk, and KawaGIIF keeps its own copy of each file. Continue?`,
      confirm: "Import anyway",
    },
    deleteConfirm: {
      title: "Delete this file?",
      body: (name: string) =>
        `“${name}” will be removed from the library and its file deleted from disk. This can't be undone.`,
      placedBody: (name: string, count: number) =>
        count === 1
          ? `“${name}” is placed on the desktop. If you delete it, it will disappear from there too.`
          : `“${name}” is placed in ${count} spots on the desktop. If you delete it, it will disappear from all of them.`,
      confirm: "Delete anyway",
    },
  },

  tags: {
    label: "Tags",
    none: "No tags",
    add: "Add tag…",
    edit: "Edit tags",
    remove: (tag: string) => `Remove tag ${tag}`,
    more: (n: number) => `+${n}`,
    manage: "Tags",
    manageEmpty: "There are no tags in the library yet.",
    search: "Search tags…",
    noMatches: "No tags match your search.",
    useAsFilter: "Use as filter",
    filtering: "Filtering",
    removeFilter: (tag: string) => `Stop filtering by “${tag}”`,
    clearFilters: "Clear filters",
    usedBy: (n: number) => (n === 1 ? "1 file" : `${n} files`),
    rename: "Rename",
    deleteTitle: (tag: string) => `Delete the tag “${tag}”?`,
    deleteBody: (n: number) =>
      `It will be removed from ${n === 1 ? "1 file" : `${n} files`}. The files themselves are not deleted.`,
  },

  editor: {
    title: "Editor",
    undo: "Undo",
    save: "Save",
    sidebarTitle: "Files",
    sidebarEmpty: "Import files from the Library first.",
    sidebarHint: "Drag onto the desktop to place it",
    canvasHint: [
      "Drag an animation from the list onto the desktop to place it.",
      "Click an animation that's already placed to select and edit it.",
    ],
    placedTitle: "Placed",
    placedEmpty: "You haven't placed any animations yet.",
    removeItem: "Remove from desktop",
    saveConfirm: {
      title: "Apply the changes?",
      added: (n: number) => `${n} added`,
      moved: (n: number) => `${n} moved or resized`,
      removed: (n: number) => `${n} removed`,
      noChanges: "There are no pending changes.",
    },
    undoConfirm: {
      title: "Discard all changes?",
      body: "The desktop will go back to how it was the last time you saved. Any changes made since then will be lost.",
      confirm: "Discard changes",
    },
    exitGuard: {
      title: "You have unsaved changes",
      body: "If you leave the editor now, the desktop will go back to how it was the last time you saved.",
    },
  },

  properties: {
    title: "Properties",
    empty: "Select an animation on the desktop to edit its properties.",
    opacity: "Opacity",
    speed: "Speed",
    reset: "Reset",
    resetHint: "Sets opacity and speed back to their defaults. Position and size stay the same.",
  },

  settings: {
    title: "Settings",
    launchOnStartup: {
      label: "Start with Windows",
      hint: "Launch KawaGIIF automatically when the computer starts.",
    },
    startMinimized: {
      label: "Start minimized to tray",
      hint: "Don't show the control panel at startup.",
    },
    poolSize: {
      label: "Simultaneous animations",
      hint:
        "KawaGIIF reserves one window per animation at startup, used or not, " +
        "because Windows doesn't allow creating transparent ones later. It's what " +
        "uses the most memory: lower it if you're short on RAM, raise it to place more. " +
        "Takes effect after restarting the app.",
    },
    confirmDelete: {
      label: "Confirm before deleting files",
      hint: "Ask before removing a file from the library. Deleting can't be undone.",
    },
    ram: {
      label: "Memory",
      system: "System memory",
      app: (mb: number) => `KawaGIIF uses about ${mb} MB`,
      estimateNote: "Estimate: the web engine is split across several processes",
    },
  },
} as const;
