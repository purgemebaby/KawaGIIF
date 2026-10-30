/** Memeboard sound. One thread owns the output devices (a cpal stream can't leave the thread that opened it) and plays
 what it is sent: each sound on every chosen device, cut at the meme length. Output devices open on the first sound
 and again after the output setting changes or a device goes away. */
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::time::Duration;

use rodio::cpal::traits::{DeviceTrait, HostTrait};
use rodio::cpal::{Device, DeviceId};
use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player, Source};
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

use crate::config::{self, AudioOutput};
use crate::error::{AppError, AppResult};

/* Personal Note for me:
- std::sync::mpsc: a channel. `Sender`s can be cloned and shared, the one `Receiver` waits for what they send.
- A reply channel per `Play` lets the caller wait for the answer of a thread that is not its own.
*/



/** One sound to play: its file, its volume (0..=1), its speed (1 = as recorded) and where to cut it. */
pub struct Sound {
    pub path: PathBuf,
    pub volume: f32,
    pub speed: f32,
    pub max: Duration,
}

enum Command {
    Play(Uuid, Sound, Sender<Result<(), String>>),
    Stop(Uuid),
    StopAll,
    SetOutput(AudioOutput),
}

/** The sender of the audio thread, shared across commands. */
pub struct AudioState(Sender<Command>);
impl AudioState {
    /// Starts the audio thread on the output saved in the settings.
    pub fn start() -> Self {
        let (sender, commands) = mpsc::channel();
        let output = config::load().audio_output;
        let _ = std::thread::Builder::new()
            .name("kawagiif-audio".into())
            .spawn(move || run(commands, output));
        Self(sender)
    }

    /// Plays `sound` on every output, tagged `tag` so it can be stopped alone, and waits until it has started, so a
    /// missing device is reported.
    pub fn play(&self, tag: Uuid, sound: Sound) -> AppResult<()> {
        let (reply, answer) = mpsc::channel();
        self.0.send(Command::Play(tag, sound, reply)).map_err(|_| AppError::AudioStopped)?;
        answer.recv().map_err(|_| AppError::AudioStopped)?.map_err(AppError::Audio)
    }

    pub fn stop(&self, tag: Uuid) { let _ = self.0.send(Command::Stop(tag)); }

    pub fn stop_all(&self) { let _ = self.0.send(Command::StopAll); }

    fn set_output(&self, output: AudioOutput) { let _ = self.0.send(Command::SetOutput(output)); }
}



/** What the audio thread holds: the chosen output, its open devices and the sounds still playing. */
struct Engine {
    output: AudioOutput,
    sinks: Vec<MixerDeviceSink>,
    players: Vec<(Uuid, Player)>,
}
impl Engine {
    /// Opens the outputs when none are, then plays. A failure drops the outputs and tries once more from fresh ones,
    /// which recovers from a device that was unplugged and plugged back.
    fn play(&mut self, tag: Uuid, sound: &Sound) -> Result<(), String> {
        let first_try = self.play_once(tag, sound);
        if first_try.is_ok() { return first_try; }
        self.stop(tag);
        self.sinks.clear();
        self.play_once(tag, sound)
    }

    fn play_once(&mut self, tag: Uuid, sound: &Sound) -> Result<(), String> {
        if self.sinks.is_empty() { self.sinks = open_sinks(&self.output)?; }
        for sink in &self.sinks {
            // each device decodes on its own: a source can only feed one mixer
            let file = std::fs::File::open(&sound.path).map_err(|e| e.to_string())?;
            // repeats when the meme lasts longer than the file; the decoded copy is a few MB at most (≤ 10 s)
            let source = Decoder::try_from(file).map_err(|e| e.to_string())?
                .buffered()
                .repeat_infinite()
                .take_duration(sound.max);
            let player = Player::connect_new(sink.mixer());
            player.set_volume(sound.volume);
            player.set_speed(sound.speed);
            player.append(source);
            self.players.push((tag, player));
        }
        Ok(())
    }

    fn stop(&mut self, tag: Uuid) {
        self.players.retain(|(t, player)| {
            if *t == tag { player.stop(); }
            *t != tag
        });
    }

    fn stop_all(&mut self) {
        for (_, player) in self.players.drain(..) { player.stop(); }
    }
}

/** Without a sound for this long the devices are closed: an open WASAPI stream keeps the audio engine (and its
 memory) busy, and shows the app in the volume mixer. The next sound opens them again. */
const IDLE_CLOSE: Duration = Duration::from_secs(20);

fn run(commands: Receiver<Command>, output: AudioOutput) {
    let mut engine = Engine { output, sinks: Vec::new(), players: Vec::new() };
    loop {
        let command = match commands.recv_timeout(IDLE_CLOSE) {
            Ok(command) => command,
            Err(RecvTimeoutError::Timeout) => {
                engine.players.retain(|(_, player)| !player.empty());
                if engine.players.is_empty() { engine.sinks.clear(); }
                continue;
            }
            Err(RecvTimeoutError::Disconnected) => break,
        };
        engine.players.retain(|(_, player)| !player.empty());
        match command {
            Command::Play(tag, sound, reply) => { let _ = reply.send(engine.play(tag, &sound)); }
            Command::Stop(tag) => engine.stop(tag),
            Command::StopAll => engine.stop_all(),
            Command::SetOutput(output) => {
                engine.stop_all();
                engine.sinks.clear();
                engine.output = output;
            }
        }
    }
}

fn open_default() -> Result<MixerDeviceSink, String> {
    let mut sink = DeviceSinkBuilder::open_default_sink().map_err(|e| e.to_string())?;
    sink.log_on_drop(false);
    Ok(sink)
}

fn open_device(device: Device) -> Result<MixerDeviceSink, String> {
    let mut sink = DeviceSinkBuilder::from_device(device)
        .and_then(|builder| builder.open_sink_or_fallback())
        .map_err(|e| e.to_string())?;
    sink.log_on_drop(false);
    Ok(sink)
}

fn find_device(id: &str) -> Result<Device, String> {
    let id: DeviceId = id.parse().map_err(|_| format!("bad audio device id {id}"))?;
    rodio::cpal::default_host().device_by_id(&id).ok_or_else(|| "the chosen audio device is not connected".to_owned())
}

fn open_sinks(output: &AudioOutput) -> Result<Vec<MixerDeviceSink>, String> {
    match output {
        AudioOutput::Default => Ok(vec![open_default()?]),
        AudioOutput::Device(id) => Ok(vec![open_device(find_device(id)?)?]),
        AudioOutput::DefaultPlusDevice(id) => Ok(vec![open_default()?, open_device(find_device(id)?)?]),
    }
}



/** An output device as the settings list it. */
#[derive(Serialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

// Audio Commands
/// Every output device of the system, the default one flagged. Virtual cables show up here too.
#[tauri::command]
pub fn list_audio_outputs() -> AppResult<Vec<AudioDevice>> {
    let host = rodio::cpal::default_host();
    let default_id = host.default_output_device().and_then(|device| device.id().ok());
    let devices = host.output_devices().map_err(|e| AppError::Audio(e.to_string()))?;
    Ok(devices
        .filter_map(|device| {
            let id = device.id().ok()?;
            let name = device.description().ok()?.name().to_owned();
            Some(AudioDevice { is_default: default_id.as_ref() == Some(&id), id: id.to_string(), name })
        })
        .collect())
}

/// Saves where memeboard sounds go and reopens the outputs on the next sound.
#[tauri::command]
pub fn set_audio_output(audio: State<AudioState>, output: AudioOutput) -> AppResult<()> {
    config::update(|c| c.audio_output = output.clone())?;
    audio.set_output(output);
    Ok(())
}

/// Saves the master volume of memeboard sounds, clamped to 0..=1.
#[tauri::command]
pub fn set_meme_volume(volume: f32) -> AppResult<()> {
    let volume = if volume.is_finite() { volume.clamp(0.0, 1.0) } else { 1.0 };
    config::update(|c| c.meme_volume = volume)
}
