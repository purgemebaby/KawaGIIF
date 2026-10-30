/** Memeboard. Memes pair a visual and/or a sound from the library with an on-screen animation and a global hotkey.
 Keeps them in `memeboard.json`, keeps their hotkeys registered, and fires them: the sound goes to the audio thread,
 the visual to the `MEME-STAGE` overlay. A meme lasts as long as its sound (or the video's own), never more than
 `MAX_MEME_MS`, and is only fired when its estimated memory fits in what the system has free. */
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutEvent, ShortcutState};
use uuid::Uuid;

use crate::audio::{AudioState, Sound};
use crate::config;
use crate::error::{AppError, AppResult};
use crate::library::{LibraryState, MediaItem, MediaType};
use crate::window_manager;

/* Personal Note for me:
- A `Shortcut` is a modifiers + key pair. `Shortcut::id()` is a number made from both, so the shortcut handler can
  look the meme up from the event without comparing strings.
*/

pub const MAX_MEME_MS: u32 = 10_000;
pub const MAX_HOTKEYS: usize = 10;
const DEFAULT_STILL_MS: u32 = 3_000;
const MAX_NAME_CHARS: usize = 60;
const MAX_COOLDOWN_MS: u32 = 60_000;
const MAX_SPEED_JITTER: f32 = 0.5;
/** Share of the free RAM a fire may leave in use; the rest stays for everything else. */
const FREE_RAM_SHARE: f64 = 0.75;
const DEFAULT_STOP_HOTKEY: &str = "Ctrl+Alt+Backspace";
const APP_RELEASE_HOTKEY: &str = "Ctrl+Alt+Escape";

fn notify_memeboard_changed(app: &AppHandle) {
    let _ = app.emit("memeboard-changed", ());
}



/** Where a cross-screen meme comes in from. */
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Side { Left, Right, Top, Bottom }

/** One sample of a recorded path: `t` ms after the start, the position as a fraction (0..=1) of the monitor. */
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
pub struct PathPoint { pub t: u32, pub x: f32, pub y: f32 }

/** How the visual moves while the meme lasts. The stage turns each one into keyframes. */
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Animation {
    Static,
    /// Grows in and shrinks out, each in its own time.
    Pop {
        #[serde(default = "default_pop_in")]
        enter_ms: u32,
        #[serde(default = "default_pop_out")]
        exit_ms: u32,
    },
    /// Bounces off the screen edges like the old DVD screensaver, changing colour on each bounce if `colors`.
    DvdBounce {
        #[serde(default = "default_true")]
        colors: bool,
    },
    Bounce,
    /// Trembles in place; `intensity` 0..=1 scales how far.
    Shake {
        #[serde(default = "default_shake")]
        intensity: f32,
    },
    Cross { from: Side },
    Fall,
    Path { points: Vec<PathPoint> },
}

impl Default for Animation {
    fn default() -> Self { Self::Pop { enter_ms: default_pop_in(), exit_ms: default_pop_out() } }
}

const POP_MS: std::ops::RangeInclusive<u32> = 80..=1500;
fn default_pop_in() -> u32 { 280 }
fn default_pop_out() -> u32 { 220 }
fn default_true() -> bool { true }
fn default_shake() -> f32 { 0.25 }

/** Where the visual appears. `Fixed` is a fraction (0..=1) of the monitor. */
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug, Default)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Anchor {
    #[default]
    Cursor,
    Center,
    Random,
    Fixed { x: f32, y: f32 },
}

/** What a second press does while the meme still plays. */
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
#[serde(rename_all = "snake_case")]
pub enum Refire {
    /// The playing one stops and it starts over.
    #[default]
    Restart,
    /// Another copy plays on top (while the concurrency limit allows).
    Stack,
    /// Nothing happens until it ends.
    Ignore,
}

/** How a meme behaves when fired: how soon it may fire again, what a second press does, and how much each play
 varies its speed (sound pitch and visual together). */
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug, Default)]
pub struct Behaviour {
    #[serde(default)]
    pub cooldown_ms: u32,
    #[serde(default)]
    pub refire: Refire,
    /// Each play runs at a random speed within 1 ± this, 0..=MAX_SPEED_JITTER.
    #[serde(default)]
    pub speed_jitter: f32,
}
impl Behaviour {
    fn sanitized(mut self) -> Self {
        self.cooldown_ms = self.cooldown_ms.min(MAX_COOLDOWN_MS);
        self.speed_jitter = finite_or(self.speed_jitter, 0.0).clamp(0.0, MAX_SPEED_JITTER);
        self
    }

    /// A random speed for one play, from the bits of a fresh UUID (no rand crate needed for this).
    fn pick_speed(self) -> f32 {
        if self.speed_jitter <= 0.0 { return 1.0; }
        let unit = (Uuid::new_v4().as_u128() >> 64) as f64 / u64::MAX as f64;
        1.0 + self.speed_jitter * (unit as f32 * 2.0 - 1.0)
    }
}

/** A saved look and behaviour, applied to memes from the editor. */
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct Preset {
    pub id: Uuid,
    pub name: String,
    #[serde(default)]
    pub animation: Animation,
    #[serde(default)]
    pub anchor: Anchor,
    #[serde(default = "default_size")]
    pub size: f32,
    #[serde(default)]
    pub behaviour: Behaviour,
}

fn default_size() -> f32 { 0.3 }
fn default_volume() -> f32 { 1.0 }

/** One meme. `size` is the visual's longer side as a fraction of the monitor's shorter one. */
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct Meme {
    pub id: Uuid,
    pub name: String,
    #[serde(default)]
    pub visual: Option<Uuid>,
    #[serde(default)]
    pub audio: Option<Uuid>,
    #[serde(default)]
    pub animation: Animation,
    #[serde(default)]
    pub anchor: Anchor,
    #[serde(default = "default_size")]
    pub size: f32,
    #[serde(default = "default_volume")]
    pub volume: f32,
    /// How long a meme without sound stays, in ms. Ignored when there is a sound.
    #[serde(default)]
    pub duration_ms: Option<u32>,
    /// Canonical form, e.g. `Ctrl+Alt+Digit1` (key names are `KeyboardEvent.code`).
    #[serde(default)]
    pub hotkey: Option<String>,
    #[serde(default)]
    pub behaviour: Behaviour,
    #[serde(default)]
    pub fire_count: u32,
}
impl Meme {
    /// Clamps every number into range and trims the name, so a hand-edited file or a bad call can't break the stage.
    fn sanitized(mut self) -> Self {
        self.name = self.name.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(MAX_NAME_CHARS).collect();
        self.size = finite_or(self.size, default_size()).clamp(0.05, 1.0);
        self.volume = finite_or(self.volume, default_volume()).clamp(0.0, 1.0);
        self.duration_ms = self.duration_ms.map(|ms| ms.clamp(100, MAX_MEME_MS));
        self.behaviour = self.behaviour.sanitized();
        if let Anchor::Fixed { x, y } = &mut self.anchor {
            *x = finite_or(*x, 0.5).clamp(0.0, 1.0);
            *y = finite_or(*y, 0.5).clamp(0.0, 1.0);
        }
        match &mut self.animation {
            Animation::Pop { enter_ms, exit_ms } => {
                *enter_ms = (*enter_ms).clamp(*POP_MS.start(), *POP_MS.end());
                *exit_ms = (*exit_ms).clamp(*POP_MS.start(), *POP_MS.end());
            }
            Animation::Shake { intensity } => *intensity = finite_or(*intensity, default_shake()).clamp(0.0, 1.0),
            _ => {}
        }
        if let Animation::Path { points } = &mut self.animation {
            points.retain(|p| p.t <= MAX_MEME_MS && p.x.is_finite() && p.y.is_finite());
            for p in points.iter_mut() {
                p.x = p.x.clamp(0.0, 1.0);
                p.y = p.y.clamp(0.0, 1.0);
            }
        }
        self
    }
}

fn finite_or(value: f32, fallback: f32) -> f32 { if value.is_finite() { value } else { fallback } }



// Hotkeys
/** Why a hotkey can't be used. The UI words each reason. */
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum HotkeyRefusal {
    /// Not `Mods+Code`, or an unknown key.
    Invalid,
    /// A letter, digit or symbol needs two of Ctrl/Alt/Shift; other keys need Ctrl or Alt. Only F13-F24 go bare.
    NeedsModifier,
    /// Windows or other apps rely on it (Alt+Tab, Ctrl+C, Win+…).
    Reserved,
    /// Another meme, or the stop hotkey, already has it.
    Duplicate,
    /// `MAX_HOTKEYS` memes already have one.
    Limit,
}

/** A parsed hotkey: which of Ctrl/Alt/Shift it holds and its key. */
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct Hotkey { ctrl: bool, alt: bool, shift: bool, code: Code }
impl Hotkey {
    /// Parses the canonical `Ctrl+Alt+Shift+Code` form; modifiers may come in any order and any case.
    fn parse(raw: &str) -> Result<Self, HotkeyRefusal> {
        let mut parts: Vec<&str> = raw.split('+').map(str::trim).collect();
        let key = parts.pop().filter(|k| !k.is_empty()).ok_or(HotkeyRefusal::Invalid)?;
        let (mut ctrl, mut alt, mut shift) = (false, false, false);
        for part in parts {
            match part.to_ascii_lowercase().as_str() {
                "ctrl" | "control" => ctrl = true,
                // AltGr reaches Windows as Ctrl+Alt
                "altgr" => { ctrl = true; alt = true; }
                "alt" => alt = true,
                "shift" => shift = true,
                "win" | "super" | "meta" | "cmd" => return Err(HotkeyRefusal::Reserved),
                _ => return Err(HotkeyRefusal::Invalid),
            }
        }
        let code = Code::from_str(key).map_err(|_| HotkeyRefusal::Invalid)?;
        if is_modifier_key(code) { return Err(HotkeyRefusal::Invalid); }
        Ok(Self { ctrl, alt, shift, code })
    }

    fn canonical(self) -> String {
        let mut out = String::new();
        if self.ctrl { out.push_str("Ctrl+"); }
        if self.alt { out.push_str("Alt+"); }
        if self.shift { out.push_str("Shift+"); }
        out.push_str(&self.code.to_string());
        out
    }

    fn shortcut(self) -> Shortcut {
        let mut mods = Modifiers::empty();
        if self.ctrl { mods |= Modifiers::CONTROL; }
        if self.alt { mods |= Modifiers::ALT; }
        if self.shift { mods |= Modifiers::SHIFT; }
        Shortcut::new((!mods.is_empty()).then_some(mods), self.code)
    }

    fn modifier_count(self) -> usize { usize::from(self.ctrl) + usize::from(self.alt) + usize::from(self.shift) }

    /// Checks the rules every hotkey must meet, whatever the other memes hold.
    fn check_rules(self) -> Result<(), HotkeyRefusal> {
        use Code::*;
        if self.code == PrintScreen || self.code == Pause { return Err(HotkeyRefusal::Reserved); }
        let only = |ctrl, alt, shift| self.ctrl == ctrl && self.alt == alt && self.shift == shift;
        let reserved = match self.code {
            Tab => self.alt || self.ctrl,
            Escape => only(true, false, false) || only(false, true, false) || only(true, false, true) || only(true, true, false),
            F4 => self.alt || only(true, false, false),
            Delete => self.ctrl && self.alt,
            Space => only(false, true, false),
            _ => false,
        };
        if reserved { return Err(HotkeyRefusal::Reserved); }
        if is_bare_key(self.code) { return Ok(()); }
        // a typing key with one modifier is some app's shortcut (Ctrl+C, Alt+F menus) or a capital letter
        let needed = if is_typing_key(self.code) { 2 } else { 1 };
        let has_ctrl_or_alt = self.ctrl || self.alt;
        if self.modifier_count() < needed || !has_ctrl_or_alt { return Err(HotkeyRefusal::NeedsModifier); }
        Ok(())
    }
}

fn is_modifier_key(code: Code) -> bool {
    use Code::*;
    matches!(code, ControlLeft | ControlRight | AltLeft | AltRight | ShiftLeft | ShiftRight | MetaLeft | MetaRight | CapsLock | NumLock | ScrollLock | Fn)
}

/** F13-F24: no keyboard types with them and no app expects them, so they may go without modifiers. */
fn is_bare_key(code: Code) -> bool {
    use Code::*;
    matches!(code, F13 | F14 | F15 | F16 | F17 | F18 | F19 | F20 | F21 | F22 | F23 | F24)
}

/** Keys that type a character: letters, digits, symbols and the numpad. */
fn is_typing_key(code: Code) -> bool {
    let name = code.to_string();
    name.starts_with("Key") || name.starts_with("Digit") || name.starts_with("Numpad")
        || matches!(code, Code::Backquote | Code::Minus | Code::Equal | Code::BracketLeft | Code::BracketRight
            | Code::Backslash | Code::Semicolon | Code::Quote | Code::Comma | Code::Period | Code::Slash
            | Code::IntlBackslash | Code::Space)
}

/** The default hotkey of slot n (0-based): Ctrl+AltGr+1 … Ctrl+AltGr+0. */
fn default_hotkey(slot: usize) -> Option<String> {
    const DIGITS: [&str; MAX_HOTKEYS] = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0"];
    DIGITS.get(slot).map(|digit| format!("Ctrl+Alt+{digit}"))
}



/** The on-disk memeboard, saved as `memeboard.json`. */
#[derive(Serialize, Deserialize)]
pub struct MemeboardIndex {
    #[serde(default)]
    memes: Vec<Meme>,
    #[serde(default = "default_stop_hotkey")]
    stop_hotkey: String,
    #[serde(default)]
    presets: Vec<Preset>,
}
fn default_stop_hotkey() -> String { DEFAULT_STOP_HOTKEY.to_owned() }
impl Default for MemeboardIndex {
    fn default() -> Self { Self { memes: Vec::new(), stop_hotkey: default_stop_hotkey(), presets: Vec::new() } }
}
impl MemeboardIndex {
    fn path() -> PathBuf { config::data_dir().join("memeboard.json") }

    fn load() -> Self {
        let mut index: Self = config::read_or_quarantine(&Self::path(), |s| serde_json::from_str(s).ok());
        index.memes = std::mem::take(&mut index.memes).into_iter().map(Meme::sanitized).collect();
        index
    }

    fn save(&self) -> AppResult<()> { config::write_atomic(&Self::path(), &serde_json::to_vec_pretty(self)?) }

    fn find(&self, id: &Uuid) -> Option<&Meme> { self.memes.iter().find(|m| m.id == *id) }

    fn hotkey_count_except(&self, id: &Uuid) -> usize {
        self.memes.iter().filter(|m| m.id != *id && m.hotkey.is_some()).count()
    }

    /// Validates `raw` for meme `id` (a nil id for the stop hotkey) and returns its canonical form.
    fn validate_hotkey(&self, raw: &str, id: &Uuid) -> Result<String, HotkeyRefusal> {
        let hotkey = Hotkey::parse(raw)?;
        hotkey.check_rules()?;
        let canonical = hotkey.canonical();
        let taken_by_meme = self.memes.iter()
            .filter(|m| m.id != *id)
            .filter_map(|m| m.hotkey.as_deref())
            .any(|other| Hotkey::parse(other).is_ok_and(|h| h == hotkey));
        let taken_by_stop = !id.is_nil() && Hotkey::parse(&self.stop_hotkey).is_ok_and(|h| h == hotkey);
        let taken_by_app = Hotkey::parse(APP_RELEASE_HOTKEY).is_ok_and(|h| h == hotkey);
        if taken_by_meme || taken_by_stop || taken_by_app { return Err(HotkeyRefusal::Duplicate); }
        if !id.is_nil() && self.hotkey_count_except(id) >= MAX_HOTKEYS { return Err(HotkeyRefusal::Limit); }
        Ok(canonical)
    }

    /// The first default hotkey nobody uses yet, if the cap leaves room.
    fn free_default_hotkey(&self) -> Option<String> {
        (0..MAX_HOTKEYS).filter_map(default_hotkey).find(|key| self.validate_hotkey(key, &Uuid::new_v4()).is_ok())
    }
}



/** A meme on screen: what it costs and when it ends. */
struct Showing { instance: Uuid, meme: Uuid, bytes: u64, until: Instant }

/** The memeboard, the registered shortcuts (by `Shortcut::id`) and what is on screen. */
pub struct MemeboardState(Mutex<Inner>);
struct Inner {
    index: MemeboardIndex,
    registered: HashMap<u32, Shortcut>,
    by_shortcut: HashMap<u32, Uuid>,
    stop_shortcut: Option<u32>,
    conflicts: HashSet<Uuid>,
    stop_conflict: bool,
    showing: Vec<Showing>,
    last_fired: HashMap<Uuid, Instant>,
}
impl Default for MemeboardState {
    fn default() -> Self {
        Self(Mutex::new(Inner {
            index: MemeboardIndex::load(),
            registered: HashMap::new(),
            by_shortcut: HashMap::new(),
            stop_shortcut: None,
            conflicts: HashSet::new(),
            stop_conflict: false,
            showing: Vec::new(),
            last_fired: HashMap::new(),
        }))
    }
}
impl MemeboardState {
    fn lock(&self) -> MutexGuard<'_, Inner> { self.0.lock().unwrap_or_else(PoisonError::into_inner) }
}

/**
 * Unregisters every meme shortcut and registers the current ones again. A shortcut another app already holds fails
 * to register: that meme is flagged as a conflict instead of failing silently.
 */
pub fn sync_hotkeys(app: &AppHandle) {
    let state = app.state::<MemeboardState>();
    let mut inner = state.lock();
    let shortcuts = app.global_shortcut();
    for shortcut in inner.registered.drain().map(|(_, s)| s) { let _ = shortcuts.unregister(shortcut); }
    inner.by_shortcut.clear();
    inner.conflicts.clear();

    let wanted: Vec<(Uuid, Option<Hotkey>)> = inner.index.memes.iter()
        .filter_map(|m| Some((m.id, m.hotkey.as_deref().map(Hotkey::parse)?.ok())))
        .collect();
    for (id, hotkey) in wanted {
        let Some(hotkey) = hotkey else { continue; };
        let shortcut = hotkey.shortcut();
        if shortcuts.register(shortcut).is_ok() {
            inner.registered.insert(shortcut.id(), shortcut);
            inner.by_shortcut.insert(shortcut.id(), id);
        } else {
            inner.conflicts.insert(id);
        }
    }

    inner.stop_shortcut = None;
    inner.stop_conflict = false;
    if let Ok(stop) = Hotkey::parse(&inner.index.stop_hotkey).map(Hotkey::shortcut) {
        if shortcuts.register(stop).is_ok() {
            inner.registered.insert(stop.id(), stop);
            inner.stop_shortcut = Some(stop.id());
        } else {
            inner.stop_conflict = true;
        }
    }
    drop(inner);
    notify_memeboard_changed(app);
}

/** The meme named by `--fire-meme <id|name>` (or `--fire-meme=<id|name>`) in `args`; names ignore case. */
fn meme_from_args(index: &MemeboardIndex, args: &[String]) -> Option<Uuid> {
    let wanted = args.iter().enumerate().find_map(|(i, arg)| {
        if arg == "--fire-meme" { return args.get(i + 1).cloned(); }
        arg.strip_prefix("--fire-meme=").map(str::to_owned)
    })?;
    let wanted = wanted.trim();
    if let Ok(id) = Uuid::parse_str(wanted) {
        if index.find(&id).is_some() { return Some(id); }
    }
    index.memes.iter().find(|m| m.name.eq_ignore_ascii_case(wanted)).map(|m| m.id)
}

/**
 * Fires the meme a command line names (a Stream Deck button running `KawaGIIF.exe --fire-meme "name"`). A second
 * launch hands its arguments to the running app through the single-instance plugin. Returns whether the arguments
 * asked for a meme, so the caller doesn't bring the control window up for it.
 */
pub fn fire_from_args(app: &AppHandle, args: &[String]) -> bool {
    let asked = args.iter().any(|a| a == "--fire-meme" || a.starts_with("--fire-meme="));
    if !asked { return false; }
    let found = meme_from_args(&app.state::<MemeboardState>().lock().index, args);
    match found {
        Some(id) => {
            let handle = app.clone();
            std::thread::spawn(move || {
                if let Err(error) = fire(&handle, id) { let _ = handle.emit("meme-rejected", error.to_string()); }
            });
        }
        None => { let _ = app.emit("meme-rejected", "no meme has that name"); }
    }
    true
}

/** The global shortcut handler's share: fires the meme of a pressed shortcut, or stops everything. */
pub fn on_shortcut(app: &AppHandle, shortcut: &Shortcut, event: &ShortcutEvent) {
    if event.state != ShortcutState::Pressed { return; }
    let (meme, is_stop) = {
        let state = app.state::<MemeboardState>();
        let inner = state.lock();
        (inner.by_shortcut.get(&shortcut.id()).copied(), inner.stop_shortcut == Some(shortcut.id()))
    };
    if is_stop { stop_all(app); return; }
    let Some(id) = meme else { return; };
    let handle = app.clone();
    // off the shortcut thread: firing reads files and waits for the audio thread
    std::thread::spawn(move || {
        if let Err(error) = fire(&handle, id) {
            let _ = handle.emit("meme-rejected", error.to_string());
        }
    });
}



// Firing
/** What the stage needs to draw a visual. */
#[derive(Serialize, Clone)]
pub struct StageVisual {
    pub path: String,
    pub media_type: MediaType,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

/** The `meme-fire` payload. `cursor` is a fraction (0..=1) of the stage, which covers the cursor's monitor. The
 stage always plays videos muted: their sound comes from the audio thread. */
#[derive(Serialize, Clone)]
pub struct StageFire {
    pub instance: Uuid,
    pub meme: Meme,
    pub visual: Option<StageVisual>,
    pub duration_ms: u32,
    /// Playback speed of the visual, matching the sound's (1 = as recorded).
    pub speed: f32,
    pub cursor: (f64, f64),
}

fn media_path(item: &MediaItem) -> PathBuf { crate::library::media_dir().join(&item.stored_file_name) }

/** How long a meme lasts: the video's length when the visual is an MP4 with sound, else its sound's, else its own
 duration (or one loop of a GIF, or `DEFAULT_STILL_MS`). Never more than `MAX_MEME_MS`. */
fn meme_duration(meme: &Meme, visual: Option<&MediaItem>, audio: Option<&MediaItem>) -> u32 {
    let video_sound = visual.filter(|v| v.media_type == MediaType::Mp4 && v.info.has_audio == Some(true));
    let ms = if let Some(video) = video_sound {
        video.info.duration_ms
    } else if let Some(sound) = audio {
        sound.info.duration_ms
    } else {
        meme.duration_ms.or_else(|| visual.and_then(|v| v.info.duration_ms).filter(|ms| *ms > 0))
    };
    ms.unwrap_or(DEFAULT_STILL_MS).clamp(100, MAX_MEME_MS)
}

/** Rough RAM a meme needs while it plays: decoded frames for visuals, decoded samples for sound. Items imported
 before their size was read count as a 1080p frame. */
fn estimated_bytes(visual: Option<&MediaItem>, audio: Option<&MediaItem>, duration_ms: u32, outputs: u64) -> u64 {
    const FALLBACK_FRAME: u64 = 1920 * 1080 * 4;
    const VIDEO_BUFFERED_FRAMES: u64 = 8;
    const PCM_BYTES_PER_MS: u64 = 48 * 2 * 4; // 48 kHz, stereo, f32
    let frame = |item: &MediaItem| match (item.info.width, item.info.height) {
        (Some(w), Some(h)) => u64::from(w) * u64::from(h) * 4,
        _ => FALLBACK_FRAME,
    };
    let visual_bytes = visual.map_or(0, |item| match item.media_type {
        MediaType::Gif => frame(item).saturating_mul(u64::from(item.info.frame_count.unwrap_or(1).max(1))),
        MediaType::Mp4 => frame(item).saturating_mul(VIDEO_BUFFERED_FRAMES),
        _ => frame(item),
    });
    let audio_bytes = audio.map_or(0, |_| PCM_BYTES_PER_MS * u64::from(duration_ms) * outputs.max(1));
    visual_bytes.saturating_add(audio_bytes)
}

/**
 * Which memes on screen (indices into `showing`, oldest first) must go for meme `id` to fire, or `None` when it must
 * not fire at all (`Refire::Ignore` while it still plays). `Restart` drops its own copies; then, with a limit of 1
 * everything goes, else the oldest go until the new one fits under `max`.
 */
fn make_room(showing: &[Showing], id: Uuid, refire: Refire, max: usize) -> Option<Vec<usize>> {
    let playing = |s: &Showing| s.meme == id;
    if refire == Refire::Ignore && showing.iter().any(playing) { return None; }
    let mut evict: Vec<usize> = if refire == Refire::Restart || max <= 1 {
        showing.iter().enumerate().filter(|(_, s)| max <= 1 || playing(s)).map(|(i, _)| i).collect()
    } else {
        Vec::new()
    };
    let mut left = showing.len() - evict.len();
    for index in 0..showing.len() {
        if left < max { break; }
        if !evict.contains(&index) {
            evict.push(index);
            left -= 1;
        }
    }
    evict.sort_unstable();
    Some(evict)
}

fn fits_in_memory(needed: u64, already_showing: u64, available: u64) -> bool {
    let budget = (available as f64 * FREE_RAM_SHARE) as u64;
    needed.saturating_add(already_showing) <= budget
}

fn available_memory() -> u64 {
    let mut system = sysinfo::System::new();
    system.refresh_memory();
    system.available_memory()
}

/**
 * Fires meme `id`: checks its media and the memory it needs, makes room when the concurrency limit is reached (the
 * oldest meme goes; with a limit of 1 the current one is replaced), then starts the sound and shows the visual.
 */
pub fn fire(app: &AppHandle, id: Uuid) -> AppResult<()> {
    let meme = app.state::<MemeboardState>().lock().index.find(&id).cloned().ok_or(AppError::MemeNotFound(id))?;
    let (visual, audio) = {
        let library = app.state::<LibraryState>();
        let index = library.lock();
        let pick = |media: Option<Uuid>| media.and_then(|m| index.find(&m).filter(|_| index.has_file(&m)).cloned());
        (pick(meme.visual), pick(meme.audio))
    };
    let visual = visual.filter(|v| !v.media_type.is_audio());
    let audio = audio.filter(|a| a.media_type.is_audio());
    if visual.is_none() && audio.is_none() { return Err(AppError::MemeEmpty); }
    // an MP4 with sound plays its own track (decoded by the audio thread, so it follows the output setting) instead of the meme's
    let video_sound = visual.as_ref().filter(|v| v.media_type == MediaType::Mp4 && v.info.has_audio == Some(true));
    let sound_file = video_sound.or(audio.as_ref().filter(|_| visual.as_ref().is_none_or(|v| v.media_type != MediaType::Mp4)));

    let settings = config::load();
    let duration_ms = meme_duration(&meme, visual.as_ref(), audio.as_ref());
    let outputs = if matches!(settings.audio_output, config::AudioOutput::DefaultPlusDevice(_)) { 2 } else { 1 };
    let bytes = estimated_bytes(visual.as_ref(), sound_file, duration_ms, outputs);
    let max_concurrent = settings.meme_max_concurrent.clamp(1, config::MAX_MEME_CONCURRENCY) as usize;

    let instance = Uuid::new_v4();
    let speed = meme.behaviour.pick_speed();
    // the sound is cut at `duration_ms` of its own time, which a faster play gets through sooner
    let shown_ms = (duration_ms as f32 / speed).round() as u32;
    let evicted: Vec<Uuid> = {
        let state = app.state::<MemeboardState>();
        let mut inner = state.lock();
        let now = Instant::now();
        let cooldown = Duration::from_millis(u64::from(meme.behaviour.cooldown_ms));
        if inner.last_fired.get(&id).is_some_and(|at| now.duration_since(*at) < cooldown) { return Ok(()); }
        inner.showing.retain(|s| s.until > now);
        let Some(evict) = make_room(&inner.showing, id, meme.behaviour.refire, max_concurrent) else { return Ok(()); };
        // nothing changes unless the new meme also fits in memory
        let kept_bytes: u64 = inner.showing.iter().enumerate()
            .filter(|(i, _)| !evict.contains(i))
            .map(|(_, s)| s.bytes)
            .sum();
        if !fits_in_memory(bytes, kept_bytes, available_memory()) { return Err(AppError::MemeTooHeavy); }
        let mut evicted = Vec::with_capacity(evict.len());
        for index in evict.into_iter().rev() { evicted.push(inner.showing.remove(index).instance); }
        let until = now + Duration::from_millis(u64::from(shown_ms));
        inner.showing.push(Showing { instance, meme: id, bytes, until });
        inner.last_fired.insert(id, now);
        if let Some(stored) = inner.index.memes.iter_mut().find(|m| m.id == id) { stored.fire_count += 1; }
        let _ = inner.index.save();
        evicted
    };

    let sound = app.state::<AudioState>();
    for old in &evicted { sound.stop(*old); }
    if let Some(file) = sound_file {
        let volume = meme.volume * settings.meme_volume;
        sound.play(instance, Sound { path: media_path(file), volume, speed, max: Duration::from_millis(u64::from(duration_ms)) })?;
    }

    for old in &evicted { let _ = app.emit_to(window_manager::MEME_STAGE_LABEL, "meme-end", old); }
    if let Some(visual) = &visual {
        let cursor = window_manager::show_meme_stage(app)?;
        let payload = StageFire {
            instance,
            visual: Some(StageVisual {
                path: media_path(visual).to_string_lossy().into_owned(),
                media_type: visual.media_type,
                width: visual.info.width,
                height: visual.info.height,
            }),
            meme,
            duration_ms: shown_ms,
            speed,
            cursor,
        };
        let _ = app.emit_to(window_manager::MEME_STAGE_LABEL, "meme-fire", payload);
    }
    notify_memeboard_changed(app);
    Ok(())
}

/** Stops every sound and clears the stage. */
pub fn stop_all(app: &AppHandle) {
    app.state::<AudioState>().stop_all();
    app.state::<MemeboardState>().lock().showing.clear();
    let _ = app.emit_to(window_manager::MEME_STAGE_LABEL, "meme-clear", ());
    window_manager::hide_meme_stage(app);
}



/** A meme as the UI lists it: whether its hotkey failed to register. */
#[derive(Serialize)]
pub struct MemeView {
    #[serde(flatten)]
    pub meme: Meme,
    pub hotkey_conflict: bool,
}

#[derive(Serialize)]
pub struct MemeboardView {
    pub memes: Vec<MemeView>,
    pub stop_hotkey: String,
    pub stop_conflict: bool,
    pub presets: Vec<Preset>,
    pub max_hotkeys: usize,
    pub max_meme_ms: u32,
}

// Memeboard Commands
#[tauri::command]
pub fn list_memes(state: State<MemeboardState>) -> MemeboardView {
    let inner = state.lock();
    MemeboardView {
        memes: inner.index.memes.iter()
            .map(|meme| MemeView { hotkey_conflict: inner.conflicts.contains(&meme.id), meme: meme.clone() })
            .collect(),
        stop_hotkey: inner.index.stop_hotkey.clone(),
        stop_conflict: inner.stop_conflict,
        presets: inner.index.presets.clone(),
        max_hotkeys: MAX_HOTKEYS,
        max_meme_ms: MAX_MEME_MS,
    }
}

/// A new meme with the first free default hotkey (none once `MAX_HOTKEYS` are taken). Not saved until `save_meme`.
#[tauri::command]
pub fn new_meme(state: State<MemeboardState>, name: String) -> Meme {
    let inner = state.lock();
    Meme {
        id: Uuid::new_v4(),
        name,
        visual: None,
        audio: None,
        animation: Animation::default(),
        anchor: Anchor::default(),
        size: default_size(),
        volume: default_volume(),
        duration_ms: None,
        hotkey: inner.index.free_default_hotkey(),
        behaviour: Behaviour::default(),
        fire_count: 0,
    }.sanitized()
}

/// Checks a hotkey for a meme (or, with no meme, for the stop hotkey) without saving. `None` means usable.
#[tauri::command]
pub fn check_hotkey(state: State<MemeboardState>, hotkey: String, meme_id: Option<Uuid>) -> Option<HotkeyRefusal> {
    state.lock().index.validate_hotkey(&hotkey, &meme_id.unwrap_or(Uuid::nil())).err()
}

/// Adds or replaces a meme. Its hotkey must pass `check_hotkey`; its media must be in the library. Returns it as saved.
#[tauri::command]
pub fn save_meme(app: AppHandle, state: State<MemeboardState>, library: State<LibraryState>, meme: Meme) -> AppResult<Meme> {
    let mut meme = meme.sanitized();
    if meme.name.is_empty() { return Err(AppError::EmptyName); }
    {
        let index = library.lock();
        for media in [meme.visual, meme.audio].into_iter().flatten() {
            if index.find(&media).is_none() { return Err(AppError::MediaNotFound(media)); }
        }
    }
    {
        let mut inner = state.lock();
        meme.hotkey = match meme.hotkey.as_deref() {
            Some(raw) => Some(inner.index.validate_hotkey(raw, &meme.id).map_err(AppError::HotkeyRefused)?),
            None => None,
        };
        // the counter is the backend's: a stale copy from the UI must not reset it
        match inner.index.memes.iter_mut().find(|m| m.id == meme.id) {
            Some(stored) => {
                meme.fire_count = stored.fire_count;
                *stored = meme.clone();
            }
            None => inner.index.memes.push(meme.clone()),
        }
        inner.index.save()?;
    }
    sync_hotkeys(&app);
    Ok(meme)
}

#[tauri::command]
pub fn delete_meme(app: AppHandle, state: State<MemeboardState>, id: Uuid) -> AppResult<()> {
    {
        let mut inner = state.lock();
        inner.index.memes.retain(|m| m.id != id);
        inner.index.save()?;
    }
    sync_hotkeys(&app);
    Ok(())
}

#[tauri::command]
pub fn set_stop_hotkey(app: AppHandle, state: State<MemeboardState>, hotkey: String) -> AppResult<String> {
    let canonical = {
        let mut inner = state.lock();
        let canonical = inner.index.validate_hotkey(&hotkey, &Uuid::nil()).map_err(AppError::HotkeyRefused)?;
        inner.index.stop_hotkey = canonical.clone();
        inner.index.save()?;
        canonical
    };
    sync_hotkeys(&app);
    Ok(canonical)
}

/// Adds or replaces a preset (a saved look and behaviour). Returns it as saved.
#[tauri::command]
pub fn save_preset(app: AppHandle, state: State<MemeboardState>, preset: Preset) -> AppResult<Preset> {
    let mut preset = preset;
    if preset.id.is_nil() { preset.id = Uuid::new_v4(); }
    preset.name = preset.name.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(MAX_NAME_CHARS).collect();
    if preset.name.is_empty() { return Err(AppError::EmptyName); }
    // the same clamps as a meme's
    preset.size = finite_or(preset.size, default_size()).clamp(0.05, 1.0);
    preset.behaviour = preset.behaviour.sanitized();
    {
        let mut inner = state.lock();
        match inner.index.presets.iter_mut().find(|p| p.id == preset.id) {
            Some(stored) => *stored = preset.clone(),
            None => inner.index.presets.push(preset.clone()),
        }
        inner.index.save()?;
    }
    notify_memeboard_changed(&app);
    Ok(preset)
}

#[tauri::command]
pub fn delete_preset(app: AppHandle, state: State<MemeboardState>, id: Uuid) -> AppResult<()> {
    {
        let mut inner = state.lock();
        inner.index.presets.retain(|p| p.id != id);
        inner.index.save()?;
    }
    notify_memeboard_changed(&app);
    Ok(())
}

/// Fires a meme from the UI's test button.
#[tauri::command]
pub fn fire_meme(app: AppHandle, id: Uuid) -> AppResult<()> { fire(&app, id) }

#[tauri::command]
pub fn stop_all_memes(app: AppHandle) { stop_all(&app); }

/// Saves how many memes may play at once.
#[tauri::command]
pub fn set_meme_max_concurrent(count: u32) -> AppResult<()> {
    config::update(|c| c.meme_max_concurrent = count.clamp(1, config::MAX_MEME_CONCURRENCY))
}

/// The stage reports it has nothing left to show, so its window can hide.
#[tauri::command]
pub fn meme_stage_idle(app: AppHandle, state: State<MemeboardState>) {
    let now = Instant::now();
    let mut inner = state.lock();
    inner.showing.retain(|s| s.until > now);
    let idle = inner.showing.is_empty();
    drop(inner);
    if idle { window_manager::hide_meme_stage(&app); }
}



#[cfg(test)]
mod tests {
    use super::*;

    fn index_with(hotkeys: &[&str]) -> MemeboardIndex {
        let mut index = MemeboardIndex::default();
        for (n, key) in hotkeys.iter().enumerate() {
            let mut meme = Meme {
                id: Uuid::new_v4(), name: format!("m{n}"), visual: None, audio: None, animation: Animation::default(),
                anchor: Anchor::Cursor, size: 0.3, volume: 1.0, duration_ms: None, hotkey: None,
                behaviour: Behaviour::default(), fire_count: 0,
            };
            meme.hotkey = Some((*key).to_owned());
            index.memes.push(meme);
        }
        index
    }

    fn check(raw: &str) -> Result<String, HotkeyRefusal> { MemeboardIndex::default().validate_hotkey(raw, &Uuid::new_v4()) }

    #[test]
    fn canonical_form_orders_modifiers_and_maps_altgr() {
        assert_eq!(check("alt+ctrl+Digit1"), Ok("Ctrl+Alt+Digit1".into()));
        assert_eq!(check("AltGr+Digit5"), Ok("Ctrl+Alt+Digit5".into()));
        assert_eq!(check("F13"), Ok("F13".into()));
    }

    #[test]
    fn reserved_and_weak_hotkeys_are_refused() {
        assert_eq!(check("Win+KeyD"), Err(HotkeyRefusal::Reserved));
        assert_eq!(check("Alt+Tab"), Err(HotkeyRefusal::Reserved));
        assert_eq!(check("Alt+F4"), Err(HotkeyRefusal::Reserved));
        assert_eq!(check("Ctrl+Alt+Delete"), Err(HotkeyRefusal::Reserved));
        assert_eq!(check("Ctrl+Shift+Escape"), Err(HotkeyRefusal::Reserved));
        assert_eq!(check("Ctrl+Alt+PrintScreen"), Err(HotkeyRefusal::Reserved));
        assert_eq!(check("Ctrl+KeyC"), Err(HotkeyRefusal::NeedsModifier));
        assert_eq!(check("Shift+KeyA"), Err(HotkeyRefusal::NeedsModifier));
        assert_eq!(check("Shift+Shift+KeyA"), Err(HotkeyRefusal::NeedsModifier));
        assert_eq!(check("KeyA"), Err(HotkeyRefusal::NeedsModifier));
        assert_eq!(check("Ctrl+Alt+Escape"), Err(HotkeyRefusal::Reserved));
        assert_eq!(check("Ctrl+Nope"), Err(HotkeyRefusal::Invalid));
        assert_eq!(check("Ctrl+Alt+ControlLeft"), Err(HotkeyRefusal::Invalid));
        assert!(check("Ctrl+F9").is_ok());
        assert!(check("Ctrl+Shift+KeyM").is_ok());
    }

    #[test]
    fn duplicates_and_the_cap_are_refused() {
        let index = index_with(&["Ctrl+Alt+Digit1"]);
        assert_eq!(index.validate_hotkey("AltGr+Digit1", &Uuid::new_v4()), Err(HotkeyRefusal::Duplicate));
        // the meme keeping its own hotkey is no duplicate
        assert!(index.validate_hotkey("Ctrl+Alt+Digit1", &index.memes[0].id).is_ok());
        assert_eq!(index.validate_hotkey(DEFAULT_STOP_HOTKEY, &Uuid::new_v4()), Err(HotkeyRefusal::Duplicate));

        let keys: Vec<String> = (0..MAX_HOTKEYS).filter_map(default_hotkey).collect();
        let full = index_with(&keys.iter().map(String::as_str).collect::<Vec<_>>());
        assert_eq!(full.validate_hotkey("Ctrl+Shift+KeyQ", &Uuid::new_v4()), Err(HotkeyRefusal::Limit));
        assert!(full.validate_hotkey("Ctrl+Shift+KeyQ", &full.memes[3].id).is_ok());
        assert_eq!(full.free_default_hotkey(), None);
    }

    #[test]
    fn command_line_names_a_meme_by_id_or_name() {
        let index = index_with(&["F13", "F14"]);
        let id = index.memes[1].id;
        let args = |list: &[&str]| list.iter().map(|s| (*s).to_owned()).collect::<Vec<_>>();
        assert_eq!(meme_from_args(&index, &args(&["kawagiif.exe", "--fire-meme", "M1"])), Some(id));
        assert_eq!(meme_from_args(&index, &args(&["kawagiif.exe", &format!("--fire-meme={id}")])), Some(id));
        assert_eq!(meme_from_args(&index, &args(&["kawagiif.exe", "--fire-meme", "nope"])), None);
        assert_eq!(meme_from_args(&index, &args(&["kawagiif.exe"])), None);
    }

    #[test]
    fn animations_saved_without_options_load_with_defaults() {
        let load = |json: &str| serde_json::from_str::<Animation>(json).unwrap();
        assert_eq!(load(r#"{"kind":"shake"}"#), Animation::Shake { intensity: 0.25 });
        assert_eq!(load(r#"{"kind":"pop"}"#), Animation::Pop { enter_ms: 280, exit_ms: 220 });
        assert_eq!(load(r#"{"kind":"dvd_bounce"}"#), Animation::DvdBounce { colors: true });
        let meme = Meme { animation: Animation::Pop { enter_ms: 5, exit_ms: 99_999 }, ..index_with(&["F13"]).memes.remove(0) };
        assert_eq!(meme.sanitized().animation, Animation::Pop { enter_ms: 80, exit_ms: 1500 });
    }

    #[test]
    fn default_hotkeys_fill_the_free_digits() {
        let index = index_with(&["Ctrl+Alt+Digit1", "Ctrl+Alt+Digit2"]);
        assert_eq!(index.free_default_hotkey(), Some("Ctrl+Alt+Digit3".into()));
    }

    fn item(media_type: MediaType, duration_ms: Option<u32>, has_audio: Option<bool>) -> MediaItem {
        serde_json::from_value(serde_json::json!({
            "id": Uuid::new_v4(), "stored_file_name": "x", "original_file_name": "x",
            "media_type": media_type, "imported_at_unix": 0, "duration_ms": duration_ms, "has_audio": has_audio,
            "width": 100, "height": 100, "frame_count": 10,
        })).unwrap()
    }

    #[test]
    fn duration_follows_the_sound_and_stops_at_ten_seconds() {
        let meme = index_with(&["F13"]).memes.remove(0);
        let gif = item(MediaType::Gif, Some(800), None);
        let short = item(MediaType::Mp3, Some(3_000), Some(true));
        let long = item(MediaType::Wav, Some(20_000), Some(true));
        let video = item(MediaType::Mp4, Some(4_500), Some(true));
        let silent_video = item(MediaType::Mp4, Some(4_500), Some(false));
        assert_eq!(meme_duration(&meme, Some(&gif), Some(&short)), 3_000);
        assert_eq!(meme_duration(&meme, Some(&gif), Some(&long)), MAX_MEME_MS);
        assert_eq!(meme_duration(&meme, Some(&video), Some(&short)), 4_500);
        assert_eq!(meme_duration(&meme, Some(&silent_video), Some(&short)), 3_000);
        assert_eq!(meme_duration(&meme, Some(&gif), None), 800);
        let still = item(MediaType::Png, None, None);
        assert_eq!(meme_duration(&meme, Some(&still), None), DEFAULT_STILL_MS);
        let timed = Meme { duration_ms: Some(60_000), ..meme }.sanitized();
        assert_eq!(meme_duration(&timed, Some(&still), None), MAX_MEME_MS);
    }

    fn showing(memes: &[Uuid]) -> Vec<Showing> {
        memes.iter().map(|&meme| Showing { instance: Uuid::new_v4(), meme, bytes: 0, until: Instant::now() }).collect()
    }

    #[test]
    fn room_is_made_by_refire_mode_and_limit() {
        let (a, b, c) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
        let screen = showing(&[a, b, a]);
        assert_eq!(make_room(&screen, a, Refire::Ignore, 5), None);
        assert_eq!(make_room(&screen, c, Refire::Ignore, 5), Some(vec![]));
        assert_eq!(make_room(&screen, a, Refire::Restart, 5), Some(vec![0, 2]));
        assert_eq!(make_room(&screen, a, Refire::Stack, 5), Some(vec![]));
        // over the limit the oldest go
        assert_eq!(make_room(&screen, c, Refire::Stack, 3), Some(vec![0]));
        assert_eq!(make_room(&screen, c, Refire::Stack, 1), Some(vec![0, 1, 2]));
        assert_eq!(make_room(&screen, b, Refire::Restart, 2), Some(vec![0, 1]));
    }

    #[test]
    fn speed_jitter_stays_in_range() {
        let behaviour = Behaviour { speed_jitter: 0.25, ..Behaviour::default() };
        assert!((0..200).map(|_| behaviour.pick_speed()).all(|s| (0.75..=1.25).contains(&s)));
        assert_eq!(Behaviour::default().pick_speed(), 1.0);
        assert_eq!(Behaviour { speed_jitter: 9.0, cooldown_ms: 999_999, ..Behaviour::default() }.sanitized(),
            Behaviour { speed_jitter: MAX_SPEED_JITTER, cooldown_ms: MAX_COOLDOWN_MS, refire: Refire::Restart });
    }

    #[test]
    fn a_fire_that_does_not_fit_in_free_memory_is_refused() {
        let gif = item(MediaType::Gif, Some(800), None); // 100x100x4x10 = 400 KB
        let bytes = estimated_bytes(Some(&gif), None, 800, 1);
        assert_eq!(bytes, 400_000);
        assert!(fits_in_memory(bytes, 0, 1_000_000));
        assert!(!fits_in_memory(bytes, 400_000, 1_000_000));
        assert!(!fits_in_memory(bytes, 0, 500_000));
    }
}
