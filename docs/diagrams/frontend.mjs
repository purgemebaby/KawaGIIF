import { Scene } from './lib.mjs';

const BLUE = '#1971c2', GREEN = '#2f9e44', PURPLE = '#6741d9', GRAY = '#495057', RED = '#e03131', TEAL = '#0c8599', ORANGE = '#e8590c', PINK = '#c2255c';

export function frontend() {
	const s = new Scene();
	s.text(40, 12, 'KawaGiif frontend (src/): React draws and asks, Rust owns the state', { size: 28 });
	s.text(40, 52, 'Two window classes, one Vite entry each. Everything that crosses to Rust goes through lib/ipc.ts.', { size: 16, color: '#868e96' });

	// control window
	s.rect(40, 110, 1600, 790, { stroke: BLUE, dash: 'dashed', sw: 2 });
	s.text(60, 120, 'Control window  (1 window, label "control")', { size: 22, color: BLUE });
	const idx = s.box(70, 170, 330, { title: 'index.html', color: GRAY, bg: '#f1f3f5', items: ['<script src="/src/main.tsx">'] });
	const main = s.box(450, 170, 330, { title: 'main.tsx', color: GRAY, bg: '#f1f3f5', items: ['createRoot().render(<ControlApp/>)', 'suppressBrowserContextMenu()'] });
	const app = s.box(830, 170, 400, { title: 'ControlApp', sub: 'windows/ControlApp.tsx', color: PURPLE, bg: '#f3f0ff', items: [
		'RadialMenu + BrandBar, screen pan / editor burst', 'LoadingScreen, Modal (unsaved changes)', 'listens close-requested', 'asks has_unsaved_changes before leaving'] });
	const prov = s.box(1280, 170, 330, { title: 'LibraryProvider', sub: 'context/LibraryProvider.tsx', color: GREEN, bg: '#ebfbee', items: [
		'media, tags, refresh()', 'deleteMedia(id, force)', 'parseReferencedError', 'listens library-changed'] });
	s.arrow([[400, 220], [450, 220]], { sw: 2.5, from: idx, to: main });
	s.arrow([[780, 220], [830, 220]], { sw: 2.5, from: main, to: app });
	s.arrow([[1230, 240], [1280, 240]], { sw: 2.5, from: app, to: prov });
	s.text(1233, 205, 'wraps', { size: 14, color: '#495057' });

	const SY = 470, SW = 360;
	const home = s.box(70, SY, SW, { title: 'HomeScreen', color: TEAL, bg: '#e3fafc', items: [
		'KawaTitle + WaveText', 'KawaiiBackdrop', 'tiles (HOME_TILES) -> screens', 'Kill all animations button', '   -> kill_all_overlays'] });
	const stor = s.box(460, SY, SW, { title: 'StorageScreen', color: TEAL, bg: '#e3fafc', items: [
		'MediaFilterBar + SortMenu', 'MediaGrid + TagChips', 'TagManager (modal), TagPopover', 'import via dialog -> import_media', 'useDeleteShortcut'] });
	const edit = s.box(850, SY, SW, { title: 'EditorScreen', color: TEAL, bg: '#e3fafc', items: [
		'MediaSidebar (click = centre, drag = pickup)', 'PlacedItemsList', 'PropertiesPanel + Slider', 'Save / Discard modal', 'set_edit_mode(true) on mount'] });
	const sett = s.box(1240, SY, SW, { title: 'SettingsScreen', color: TEAL, bg: '#e3fafc', items: [
		'autostart / tray / confirm toggles', 'overlay pool size', 'RamGauge', '   <- get_system_stats'] });
	for (const sc of [home, stor, edit, sett]) s.arrow([[1030, 170 + app.h], [sc.cx, SY]], { sw: 2, from: app, to: sc });

	// overlay window
	s.rect(1700, 110, 580, 790, { stroke: PINK, dash: 'dashed', sw: 2 });
	s.text(1720, 120, 'Overlay windows  (x N pool slots OV-SLOT-n)', { size: 22, color: PINK });
	const oh = s.box(1740, 170, 500, { title: 'overlay.html', color: GRAY, bg: '#f1f3f5', items: ['<script src="/src/entries/overlay.tsx">'] });
	const oe = s.box(1740, 290, 500, { title: 'entries/overlay.tsx', color: GRAY, bg: '#f1f3f5', items: ['createRoot().render(<OverlayItemApp/>)'] });
	const oa = s.box(1740, 410, 500, { title: 'OverlayItemApp', sub: 'windows/OverlayItemApp.tsx', color: PURPLE, bg: '#f3f0ff', items: [
		'get_slot_info on mount / slot-assigned', 'listens slot-assigned / slot-released (self)', 'on slot-released -> overlay_idle', 'edit-mode / selection / opacity / rate events',
		'resize handle -> resize_overlay, arrows -> nudge', 'first load -> fit_overlay_to_media'] });
	const pl = s.box(1740, 700, 500, { title: 'Players', color: PINK, bg: '#fff0f6', items: [
		'<video>          mp4 / webm', 'GifCanvasPlayer  gifuct-js + canvas, rate', '<img>            webp / png / jpg'] });
	s.arrow([[1990, 250], [1990, 290]], { sw: 2.5, from: oh, to: oe });
	s.arrow([[1990, 370], [1990, 410]], { sw: 2.5, from: oe, to: oa });
	s.arrow([[1990, oa.b], [1990, 700]], { sw: 2.5, from: oa, to: pl });

	// shared
	s.text(40, 925, 'Shared by both window classes', { size: 22, color: GRAY });
	const ipc = s.box(40, 970, 760, { title: 'lib/ipc.ts', sub: 'the only door to Rust', color: ORANGE, bg: '#fff4e6', items: [
		'invoke<T>(cmd, args)  /  listen(event, cb)', 'browser-only mode: MOCK_RESPONSES when Tauri is absent', 'camelCase args: { mediaId }, { paths }, { instanceId }'] });
	const plc = s.box(1860, 970, 420, { title: 'lib/placed.ts', color: GRAY, bg: '#f1f3f5', items: ['loadPlacedMedia(instanceId)', '  = get_placed_media + list_media', 'shared by editor + overlay'] });
	const hk = s.box(840, 970, 980, { title: 'hooks/', color: GRAY, bg: '#f1f3f5', items: [
		'useTauriEvent(name, handler, "self" | "any")   subscribe + cleanup', 'useEditorSync   overlay moved / selection -> editor state',
		'useMediaUrl(mediaId)   get_media_path -> convertFileSrc -> asset://', 'useDeleteShortcut, useMediaSelection, useMonitors, useSwing (pickup)'] });
	s.arrow([[600, 900], [400, 970]], { sw: 2.5 });
	s.arrow([[1990, 900], [1990, 970]], { sw: 2.5, stroke: PINK });
	s.arrow([[840, 1050], [800, 1050]], { sw: 2, dash: 'dashed', from: hk, to: ipc });
	s.text(806, 1062, 'listen', { size: 14, color: '#495057' });

	// IPC band
	s.rect(40, 1190, 2240, 380, { stroke: ORANGE, bg: '#fff9db', fill: 'hachure', sw: 2.5, dash: 'solid' });
	s.text(70, 1200, 'Tauri IPC', { size: 30, color: ORANGE });
	const rust = s.box(40, 1600, 2240, { title: 'Rust backend  (src-tauri/src)', sub: '#[tauri::command] handlers, EditorState / LibraryState / SysState, emit / emit_to', color: PURPLE, bg: '#f3f0ff' });
	s.arrow([[250, ipc.b], [250, 1600]], { sw: 4, stroke: BLUE, from: ipc, to: rust });
	s.text(270, 1200, 'invoke: React -> Rust  (request / response)', { size: 20, color: BLUE });
	const inv = [
		"invoke('spawn_placed_media', { mediaId, at })", "invoke('import_media', { paths })", "invoke('delete_media', { ids, force })", "invoke('save_template') / 'discard_template_changes'",
		"invoke('set_edit_mode', { enabled })", "invoke('get_config') / 'set_launch_on_startup'", "invoke('list_media') / 'get_system_stats'", "invoke('overlay_idle') / 'resize_overlay'",
	];
	inv.forEach((t, i) => s.text(280, 1240 + i * 26, t, { size: 16, color: '#343a40' }));

	s.arrow([[1260, 1600], [1260, hk.b]], { sw: 4, stroke: GREEN });
	s.text(1290, 1200, 'events: Rust -> React  (emit = all windows, emit_to = one window)', { size: 20, color: GREEN });
	const ev = [
		['library-changed', 'all', 'LibraryProvider refresh'], ['placed-items-changed', 'all', 'PlacedItemsList, EditorScreen'], ['selection-changed', 'all', 'editor + overlays'],
		['overlay-geometry-changed', 'control', 'useEditorSync'], ['close-requested', 'control', 'ControlApp'], ['slot-assigned / slot-released', 'one overlay', 'OverlayItemApp'],
		['edit-mode-changed', 'one overlay', 'OverlayItemApp'], ['item-opacity / playback-rate-changed', 'one overlay', 'OverlayItemApp'],
	];
	ev.forEach(([n, t, l], i) => {
		s.text(1290, 1240 + i * 26, n, { size: 16, color: '#2b8a3e' });
		s.text(1650, 1240 + i * 26, '-> ' + t, { size: 16, color: '#343a40' });
		s.text(1830, 1240 + i * 26, l, { size: 16, color: '#868e96' });
	});
	return s;
}
