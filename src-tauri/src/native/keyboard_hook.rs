/* A low-level keyboard hook (WH_KEYBOARD_LL) for the memeboard's hotkeys.
RegisterHotKey can't tell a real Ctrl from the fake one AltGr sends, so `Ctrl+Alt+1` also caught AltGr+1 and stole the
character it types (`|` on a Spanish keyboard). The hook sees each key with its scan code and tracks the real modifiers
itself: AltGr alone passes through untouched, Ctrl+AltGr+1 matches. Keys are matched by physical position (scan code),
the same thing the frontend records as `KeyboardEvent.code`.
The callback only compares and sends: firing happens on the receiver's thread, so typing never waits on a meme.
*/

use std::cell::RefCell;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Mutex, OnceLock, PoisonError, RwLock};

use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, MapVirtualKeyW, MAPVK_VK_TO_VSC_EX, VK_CONTROL, VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_LWIN,
    VK_MENU, VK_RCONTROL, VK_RMENU, VK_RSHIFT, VK_RWIN, VK_SHIFT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetMessageW, SetWindowsHookExW, HC_ACTION, KBDLLHOOKSTRUCT, LLKHF_EXTENDED, MSG, WH_KEYBOARD_LL,
    WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
};



/** A key combination as the hook matches it: the key's scan code (0xE0 prefix as `0xE000`) and the real modifiers. */
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct KeyCombo { pub scan: u16, pub ctrl: bool, pub alt: bool, pub shift: bool }

/// The bit Windows sets on the scan code of the fake Left Ctrl it sends with AltGr (undocumented, but stable since XP).
const ALTGR_FAKE_CTRL: u32 = 0x200;
const EXTENDED: u16 = 0xE000;

struct Shared {
    combos: RwLock<HashSet<KeyCombo>>,
    paused: AtomicBool,
    sender: Mutex<Sender<KeyCombo>>,
}
static SHARED: OnceLock<Shared> = OnceLock::new();

/** Real modifier keys held, as seen by the hook (left and right apart). */
#[derive(Default)]
struct Held { lctrl: bool, rctrl: bool, lalt: bool, ralt: bool, lshift: bool, rshift: bool, win: bool }

thread_local! {
    static HELD: RefCell<Held> = RefCell::new(Held::default());
    // keys whose press was swallowed: their repeats and release are swallowed too
    static SWALLOWED: RefCell<HashSet<u16>> = RefCell::new(HashSet::new());
}

/**
 * Starts the hook on its own thread (an LL hook runs on the thread that installed it, which must pump messages).
 * Returns the receiver of the matched combos, or `None` if it was already started or can't be installed.
 */
pub fn start() -> Option<Receiver<KeyCombo>> {
    let (sender, receiver) = mpsc::channel();
    let shared = Shared { combos: RwLock::new(HashSet::new()), paused: AtomicBool::new(false), sender: Mutex::new(sender) };
    SHARED.set(shared).ok()?;
    std::thread::Builder::new().name("keyboard-hook".into()).spawn(|| {
        // SAFETY: installed and pumped on this thread for the app's lifetime; the callback only touches statics
        unsafe {
            if let Err(e) = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), None, 0) {
                eprintln!("[kawagiif] keyboard hook failed: {e}");
                return;
            }
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {}
        }
    }).ok()?;
    Some(receiver)
}

/** Replaces the combos the hook swallows and reports. */
pub fn set_combos(combos: HashSet<KeyCombo>) {
    if let Some(shared) = SHARED.get() {
        *shared.combos.write().unwrap_or_else(PoisonError::into_inner) = combos;
    }
}

/** While paused nothing is swallowed, so a shortcut field in the app can record a combo the hook would take. */
pub fn set_paused(paused: bool) {
    if let Some(shared) = SHARED.get() { shared.paused.store(paused, Ordering::Relaxed); }
}

/**
 * The scan code (set 1, `0xE000` for the 0xE0 prefix) of a key named as in `KeyboardEvent.code` ("Digit1", "KeyA",
 * "F13"…). Covers the keys a meme hotkey can use; `None` for any other.
 */
pub fn scan_for_code(code: &str) -> Option<u16> {
    const LETTERS: &[(char, u16)] = &[
        ('Q', 0x10), ('W', 0x11), ('E', 0x12), ('R', 0x13), ('T', 0x14), ('Y', 0x15), ('U', 0x16), ('I', 0x17),
        ('O', 0x18), ('P', 0x19), ('A', 0x1E), ('S', 0x1F), ('D', 0x20), ('F', 0x21), ('G', 0x22), ('H', 0x23),
        ('J', 0x24), ('K', 0x25), ('L', 0x26), ('Z', 0x2C), ('X', 0x2D), ('C', 0x2E), ('V', 0x2F), ('B', 0x30),
        ('N', 0x31), ('M', 0x32),
    ];
    const NAMED: &[(&str, u16)] = &[
        ("Escape", 0x01), ("Minus", 0x0C), ("Equal", 0x0D), ("Backspace", 0x0E), ("Tab", 0x0F),
        ("BracketLeft", 0x1A), ("BracketRight", 0x1B), ("Enter", 0x1C), ("Semicolon", 0x27), ("Quote", 0x28),
        ("Backquote", 0x29), ("Backslash", 0x2B), ("Comma", 0x33), ("Period", 0x34), ("Slash", 0x35),
        ("NumpadMultiply", 0x37), ("Space", 0x39), ("Numpad7", 0x47), ("Numpad8", 0x48), ("Numpad9", 0x49),
        ("NumpadSubtract", 0x4A), ("Numpad4", 0x4B), ("Numpad5", 0x4C), ("Numpad6", 0x4D), ("NumpadAdd", 0x4E),
        ("Numpad1", 0x4F), ("Numpad2", 0x50), ("Numpad3", 0x51), ("Numpad0", 0x52), ("NumpadDecimal", 0x53),
        ("IntlBackslash", 0x56), ("F11", 0x57), ("F12", 0x58), ("F13", 0x64), ("F14", 0x65), ("F15", 0x66),
        ("F16", 0x67), ("F17", 0x68), ("F18", 0x69), ("F19", 0x6A), ("F20", 0x6B), ("F21", 0x6C), ("F22", 0x6D),
        ("F23", 0x6E), ("F24", 0x76),
        ("NumpadEnter", EXTENDED | 0x1C), ("NumpadDivide", EXTENDED | 0x35), ("Home", EXTENDED | 0x47),
        ("ArrowUp", EXTENDED | 0x48), ("PageUp", EXTENDED | 0x49), ("ArrowLeft", EXTENDED | 0x4B),
        ("ArrowRight", EXTENDED | 0x4D), ("End", EXTENDED | 0x4F), ("ArrowDown", EXTENDED | 0x50),
        ("PageDown", EXTENDED | 0x51), ("Insert", EXTENDED | 0x52), ("Delete", EXTENDED | 0x53),
    ];
    if let Some(letter) = code.strip_prefix("Key").and_then(|l| l.chars().next()).filter(|_| code.len() == 4) {
        return LETTERS.iter().find(|(c, _)| *c == letter).map(|(_, scan)| *scan);
    }
    if let Some(digit) = code.strip_prefix("Digit").and_then(|d| d.parse::<u16>().ok()).filter(|d| *d <= 9) {
        // Digit1..Digit9 are 0x02..0x0A, Digit0 follows them
        return Some(if digit == 0 { 0x0B } else { digit + 1 });
    }
    if let Some(n) = code.strip_prefix('F').and_then(|n| n.parse::<u16>().ok()).filter(|n| (1..=10).contains(n)) {
        return Some(0x3A + n);
    }
    NAMED.iter().find(|(name, _)| *name == code).map(|(_, scan)| *scan)
}

/** Whether a Ctrl key event comes from a real Ctrl key, not from AltGr. */
fn is_real_ctrl(vk: u16, scan: u32) -> bool {
    vk == VK_RCONTROL.0 || ((vk == VK_LCONTROL.0 || vk == VK_CONTROL.0) && scan & ALTGR_FAKE_CTRL == 0)
}

/** The scan code the hook compares, with the extended prefix. Injected keys (a Stream Deck) may come without one. */
fn scan_of(info: &KBDLLHOOKSTRUCT) -> u16 {
    let scan = if info.scanCode == 0 {
        // SAFETY: a pure lookup in the keyboard layout
        unsafe { MapVirtualKeyW(info.vkCode, MAPVK_VK_TO_VSC_EX) }
    } else {
        info.scanCode | if (info.flags & LLKHF_EXTENDED).0 != 0 { 0xE000 } else { 0 }
    };
    // MAPVK_VK_TO_VSC_EX writes the prefix as 0xE0xx
    if scan & 0xFF00 == 0xE000 { (scan as u16 & 0xFF) | EXTENDED } else { scan as u16 & 0xFF }
}

fn key_down(vk: u16) -> bool {
    // SAFETY: reads the async key state; no pointers involved
    unsafe { GetAsyncKeyState(i32::from(vk)) < 0 }
}

/**
 * Updates the held modifiers. Returns whether `vk` was a modifier key. A key sent by SendInput with a generic VK
 * (VK_CONTROL, VK_MENU, VK_SHIFT: what a Stream Deck or a script may send) counts as the left one.
 */
fn track_modifier(held: &mut Held, vk: u16, scan: u32, down: bool) -> bool {
    match vk {
        v if v == VK_LCONTROL.0 || v == VK_CONTROL.0 => { if is_real_ctrl(vk, scan) { held.lctrl = down; } }
        v if v == VK_RCONTROL.0 => held.rctrl = down,
        v if v == VK_LMENU.0 || v == VK_MENU.0 => held.lalt = down,
        v if v == VK_RMENU.0 => held.ralt = down,
        v if v == VK_LSHIFT.0 || v == VK_SHIFT.0 => held.lshift = down,
        v if v == VK_RSHIFT.0 => held.rshift = down,
        v if v == VK_LWIN.0 || v == VK_RWIN.0 => held.win = down,
        _ => return false,
    }
    true
}

/** Decides what to do with one key event. Returns true to swallow it. */
fn on_key(info: &KBDLLHOOKSTRUCT, down: bool) -> bool {
    let vk = info.vkCode as u16;
    let is_modifier = HELD.with_borrow_mut(|held| track_modifier(held, vk, info.scanCode, down));
    if is_modifier { return false; }
    let Some(shared) = SHARED.get() else { return false; };
    let scan = scan_of(info);

    if !down { return SWALLOWED.with_borrow_mut(|keys| keys.remove(&scan)); }
    if SWALLOWED.with_borrow(|keys| keys.contains(&scan)) { return true; } // a repeat of a swallowed press
    if shared.paused.load(Ordering::Relaxed) { return false; }

    // a release the hook missed (the secure desktop, a lock screen) must not leave a modifier stuck
    let combo = HELD.with_borrow(|held| KeyCombo {
        scan,
        ctrl: (held.lctrl || held.rctrl) && key_down(VK_CONTROL.0),
        alt: (held.lalt || held.ralt) && key_down(VK_MENU.0),
        shift: (held.lshift || held.rshift) && key_down(VK_SHIFT.0),
    });
    if HELD.with_borrow(|held| held.win) { return false; }
    let matched = shared.combos.read().unwrap_or_else(PoisonError::into_inner).contains(&combo);
    if !matched { return false; }
    let _ = shared.sender.lock().unwrap_or_else(PoisonError::into_inner).send(combo);
    SWALLOWED.with_borrow_mut(|keys| keys.insert(scan));
    true
}

unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        // SAFETY: for WH_KEYBOARD_LL with HC_ACTION, lparam points to a KBDLLHOOKSTRUCT valid for this call
        let info = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
        let message = wparam.0 as u32;
        let down = message == WM_KEYDOWN || message == WM_SYSKEYDOWN;
        let up = message == WM_KEYUP || message == WM_SYSKEYUP;
        if (down || up) && on_key(info, down) { return LRESULT(1); }
    }
    // SAFETY: passes the event on unchanged, as every hook must
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}



#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn altgr_fake_ctrl_is_not_a_real_ctrl() {
        assert!(is_real_ctrl(VK_LCONTROL.0, 0x1D));
        assert!(is_real_ctrl(VK_RCONTROL.0, 0x1D));
        assert!(!is_real_ctrl(VK_LCONTROL.0, 0x21D));
    }

    #[test]
    fn codes_map_to_their_scan_codes() {
        assert_eq!(scan_for_code("Digit1"), Some(0x02));
        assert_eq!(scan_for_code("Digit0"), Some(0x0B));
        assert_eq!(scan_for_code("KeyA"), Some(0x1E));
        assert_eq!(scan_for_code("KeyM"), Some(0x32));
        assert_eq!(scan_for_code("F1"), Some(0x3B));
        assert_eq!(scan_for_code("F10"), Some(0x44));
        assert_eq!(scan_for_code("F13"), Some(0x64));
        assert_eq!(scan_for_code("ArrowLeft"), Some(0xE04B));
        assert_eq!(scan_for_code("Backspace"), Some(0x0E));
        assert_eq!(scan_for_code("KeyAB"), None);
        assert_eq!(scan_for_code("MediaPlayPause"), None);
    }

    #[test]
    fn modifiers_are_tracked_left_and_right() {
        let mut held = Held::default();
        assert!(track_modifier(&mut held, VK_LCONTROL.0, 0x21D, true));
        assert!(!held.lctrl, "the fake Ctrl from AltGr is ignored");
        track_modifier(&mut held, VK_RMENU.0, 0x38, true);
        assert!(held.ralt);
        track_modifier(&mut held, VK_LCONTROL.0, 0x1D, true);
        assert!(held.lctrl);
        assert!(!track_modifier(&mut held, 0x31, 0x02, true), "a digit is not a modifier");

        // SendInput with generic VKs (a script, a Stream Deck)
        let mut sent = Held::default();
        track_modifier(&mut sent, VK_CONTROL.0, 0, true);
        track_modifier(&mut sent, VK_MENU.0, 0, true);
        assert!(sent.lctrl && sent.lalt);
    }
}
