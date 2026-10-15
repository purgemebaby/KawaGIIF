import { Scene } from './lib.mjs';

const BLUE = '#1971c2', GREEN = '#2f9e44', PURPLE = '#6741d9', GRAY = '#495057', RED = '#e03131', TEAL = '#0c8599', ORANGE = '#e8590c';

export function backend() {
	const s = new Scene();
	const A = 60, B = 700, C = 1340, W = 500;

	s.text(60, 12, 'KawaGiif backend (src-tauri/src): Rust owns the state, the windows and the disk', { size: 28 });
	s.text(60, 52, 'Each module only calls the ones below it (one exception: window_manager calls back into template on drag/resize).', { size: 16, color: '#868e96' });

	const tray = s.box(A, 120, W, { title: 'tray.rs', sub: 'entry point: tray icon + menu', color: TEAL, bg: '#e3fafc', items: [
		'setup()  icon + menu', 'menu: Open panel / Kill all / Quit', 'Quit -> app.exit(0)', 'left click toggles control window'] });
	const lib = s.box(B, 120, W, { title: 'lib.rs', sub: 'wiring: run() / setup() / exit', color: PURPLE, bg: '#f3f0ff', items: [
		'.manage(EditorState, LibraryState, SysState)', 'plugins: dialog, autostart, global-shortcut', 'generate_handler![ every command ]', 'setup(): control win, pool, tray, keeper',
		'handle_control_close: X -> close-requested', 'handle_exit: discard edits, hide overlays', 'release_all_click_through (Ctrl+Alt+Esc)'] });
	const cmd = s.box(C, 120, W, { title: 'commands.rs', sub: 'entry point: small commands', color: TEAL, bg: '#e3fafc', items: [
		'hide_control_window', 'resize_overlay(width, height)', 'get_config', 'set_launch_on_startup (autostart)', 'set_start_minimized_to_tray',
		'set_confirm_media_delete', 'set_overlay_pool_size (on restart)',
		'set/reset/get_loading_indicator', 'list_system_fonts / set_ui_font / set_font_scale'] });

	const libr = s.box(A, 560, W, { title: 'library.rs', sub: 'domain + state: the catalogue', color: GREEN, bg: '#ebfbee', items: [
		'LibraryState( Mutex<LibraryIndex> )', 'MediaItem { id, tags, ... }', 'import_media(paths: Vec<PathBuf>)', 'delete_media(ids, force): batch, only our copies',
		'tags: list_all_tags / rename_tag / delete_tag', 'get_media_path, notify_library_changed'] });
	const tpl = s.box(B, 560, W, { title: 'template.rs', sub: 'domain + state: the brain', color: GREEN, bg: '#ebfbee', items: [
		'EditorState( Mutex<Editor> )', 'Editor { working, saved, selected,', '          edit_mode, slots }', 'spawn_placed_media(at) / move_overlay_to_monitor',
		'place_item_in_slot (alloc_slot / free_slot)', 'save_template / discard_template_changes', 'update_slot_geometry (called on drag)', 'purge_media_references, load_saved_template_on_boot', 'show_saved_overlays (after the loading screen)'] });
	const wm = s.box(C, 560, W, { title: 'window_manager.rs', sub: 'window ops: the stage hand', color: BLUE, bg: '#e7f5ff', items: [
		'create_control_window (sized to monitor) / pool', 'pool OV-SLOT-0..N  (pool_size())', 'show_slot / hide_slot / raise_slot', 'set_slot_dormant (free slot sleeps)',
		'set_overlay_click_through, clamp_to_work_area', 'reapply_overlay_style (focus, show, 2 s)', 'spawn_topmost_keeper (thread)', 'watch_overlay_events -> template'] });

	const cfg = s.box(A, 1060, W, { title: 'config.rs', sub: 'foundation: settings + atomic writes', color: GRAY, bg: '#f1f3f5', items: [
		'data_dir()  OnceLock, %LOCALAPPDATA%', 'AppConfig  <-  load() / update(|c| ..)', 'write_atomic(path, bytes): .tmp + rename'] });
	const err = s.box(B, 1060, W, { title: 'error.rs', sub: 'foundation: one error type', color: GRAY, bg: '#f1f3f5', items: [
		'AppError  (#[from] io, serde_json, tauri)', 'AppResult<T> = Result<T, AppError>', 'MediaReferenced(n) -> "REFERENCED:n"', 'PoolFull, MediaNotFound(id) ...'] });
	const sys = s.box(B, 1340, W, { title: 'system_stats.rs', sub: 'foundation: RAM meter', color: GRAY, bg: '#f1f3f5', items: [
		'SysState( Mutex<sysinfo::System> )', 'get_system_stats -> SystemStats'] });
	const nat = s.box(C, 1060, W, { title: 'native/windows.rs', sub: 'OS: raw Win32, unsafe (HWND)', color: RED, bg: '#fff5f5', items: [
		'force_layered       WS_EX_LAYERED back', 'force_clearbg       no white flash', 'force_work_area     WHOLE monitor rect *', 'force_hide_taskb    TOOLWINDOW, no APPWINDOW',
		'force_borderless    strip frame bits', 'top_everything      re-stack topmost', 'disable_dwm_focus_border', 'guard_non_client   subclass: no caption paint', 'list_font_families  GDI font enumeration', 'set_webview_dormant TrySuspend + low mem'] });
	s.text(C, 1420, '* on purpose: includes the taskbar area.', { size: 14, color: RED });

	const disk = s.box(A, 1340, W, { title: 'Disk: %LOCALAPPDATA%\\KawaGiif', color: '#862e9c', bg: '#f8f0fc', items: [
		'config.toml', 'template.json   (only the saved copy)', 'library_index.json', 'media/   (imported files)',
		'loading-indicator-<uuid>.<ext>'] });

	const a = (pts, o = {}) => s.arrow(pts, { sw: 2.5, ...o });
	const lab = (x, y, t, o = {}) => s.text(x, y, t, { size: 14, color: '#495057', ...o });
	a([[B, 190], [A + W, 190]], { from: lib, to: tray }); lab(A + W + 8, 160, 'tray::setup');
	a([[B + 250, lib.b], [B + 250, tpl.y]], { from: lib, to: tpl }); lab(B + 262, 440, 'load_saved_template_on_boot');
	a([[B + W, 300], [C + 100, wm.y]], { from: lib, to: wm }); lab(B + W + 8, 400, 'create_*');
	a([[C + 330, cmd.b], [C + 330, wm.y]], { from: cmd, to: wm }); lab(C + 340, 460, 'resize_overlay');
	a([[A + 200, tray.b], [B + 100, tpl.y]], { from: tray, to: tpl }); lab(A + 330, 470, 'kill_all_overlays');
	a([[A + W, 700], [B, 700]], { from: libr, to: tpl }); lab(A + W + 4, 662, 'delete_media'); lab(A + W - 6, 712, 'purge_media_refs');
	a([[B + W, 640], [C, 640]], { from: tpl, to: wm }); lab(B + W + 8, 602, 'show_slot');
	a([[C, 760], [B + W, 760]], { stroke: ORANGE, dash: 'dashed', from: wm, to: tpl }); lab(B + W + 4, 772, 'update_slot_\ngeometry', { color: ORANGE });
	a([[C + 250, wm.b], [C + 250, nat.y]], { from: wm, to: nat }); lab(C + 262, 1000, 'reapply_overlay_style');
	a([[A + 250, libr.b], [A + 250, cfg.y]], { from: libr, to: cfg }); lab(A + 262, 990, 'write_atomic');
	a([[B + 80, tpl.b], [A + W - 80, cfg.y]], { from: tpl, to: cfg }); lab(B - 90, 1010, 'write_atomic');
	a([[A + 250, cfg.b], [A + 250, disk.y]], { from: cfg, to: disk }); lab(A + 262, 1290, 'write');
	a([[B + 250, tpl.b], [B + 250, err.y]], { stroke: '#adb5bd', dash: 'dashed' }); lab(B + 262, 1010, 'AppResult everywhere', { color: '#868e96' });

	const N = 1960;
	s.text(N, 120, 'Three key ideas', { size: 26, color: '#e67700' });
	s.note(N, 170, 560, '1. Overlay pool + slots', [
		'A transparent window created AFTER boot', 'is born without WS_EX_LAYERED.', 'So setup() pre-creates N hidden windows',
		'OV-SLOT-0..N; placing = alloc_slot + show_slot.', 'slots: Vec<Option<Uuid>>  [a, -, c, -]', 'Free slot: slot-released -> overlay_idle ->',
		'set_slot_dormant (WebView2 suspended,', 'low memory); show_slot wakes it.'], { bg: '#fff3bf', color: '#e67700' });
	s.note(N, 570, 560, '2. The lock rule', [
		'NEVER hold the EditorState lock while', 'calling window_manager.', 'set_position/set_size/show fire Moved/Resized',
		'synchronously -> update_slot_geometry -> lock()', 'Mutex is not re-entrant = deadlock.', 'Lock in a small block, copy out, drop,', 'THEN touch windows.',
		'Also: editor lock and library lock never', 'held at the same time.'], { bg: '#ffe3e3', color: RED });
	s.note(N, 1030, 560, '3. Working vs saved template', [
		'Editor keeps two copies of Template:', 'working = what the editor changes now', 'saved   = what is on disk (template.json)',
		'is_dirty = working != saved', 'Save: write working, saved = working', 'Discard: working = saved + respawn overlays'], { bg: '#d3f9d8', color: GREEN });

	return s;
}
