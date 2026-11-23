/** Reads the real codec metadata of a file, beyond its magic bytes: an audio file must hold a track its codec can
 decode, and an MP4 must hold a video track. Returns the duration, size and audio facts the memeboard needs. */
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use symphonia::core::codecs::{
    CodecType, DecoderOptions, CODEC_TYPE_MP3, CODEC_TYPE_NULL, CODEC_TYPE_PCM_ALAW, CODEC_TYPE_PCM_F32LE,
    CODEC_TYPE_PCM_F64LE, CODEC_TYPE_PCM_MULAW, CODEC_TYPE_PCM_S16LE, CODEC_TYPE_PCM_S24LE, CODEC_TYPE_PCM_S32LE,
    CODEC_TYPE_PCM_U8, CODEC_TYPE_VORBIS,
};
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

/** The audio formats the library accepts, by container. */
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum AudioKind { Mp3, Wav, Ogg }
impl AudioKind {
    fn extension(self) -> &'static str {
        match self { Self::Mp3 => "mp3", Self::Wav => "wav", Self::Ogg => "ogg" }
    }
    /// Whether `codec` is what this container should carry: MP3 frames, PCM samples or Vorbis.
    fn accepts(self, codec: CodecType) -> bool {
        match self {
            Self::Mp3 => codec == CODEC_TYPE_MP3,
            Self::Ogg => codec == CODEC_TYPE_VORBIS,
            Self::Wav => WAV_CODECS.contains(&codec),
        }
    }
}

/** The sample formats a WAV file can hold: little-endian PCM, 8-bit unsigned, and the two telephony companders. */
const WAV_CODECS: [CodecType; 8] = [
    CODEC_TYPE_PCM_U8, CODEC_TYPE_PCM_S16LE, CODEC_TYPE_PCM_S24LE, CODEC_TYPE_PCM_S32LE,
    CODEC_TYPE_PCM_F32LE, CODEC_TYPE_PCM_F64LE, CODEC_TYPE_PCM_ALAW, CODEC_TYPE_PCM_MULAW,
];

/** What a probe learned about an audio file. */
#[derive(Debug, PartialEq)]
pub struct AudioInfo { pub duration_ms: u32 }

/** Probes `path` as `kind`: the container must parse, its default track must use the expected codec, and its first
 packet must decode. The duration comes from the frame count, or from summing every packet when the header lacks it
 (VBR MP3 without a Xing header). */
pub fn probe_audio(path: &Path, kind: AudioKind) -> Option<AudioInfo> {
    let source = MediaSourceStream::new(Box::new(File::open(path).ok()?), Default::default());
    let mut hint = Hint::new();
    hint.with_extension(kind.extension());
    let probed = symphonia::default::get_probe()
        .format(&hint, source, &FormatOptions::default(), &MetadataOptions::default()).ok()?;
    let mut format = probed.format;

    let track = format.default_track()?;
    let params = track.codec_params.clone();
    let track_id = track.id;
    if params.codec == CODEC_TYPE_NULL || !kind.accepts(params.codec) { return None; }
    let sample_rate = u64::from(params.sample_rate.filter(|rate| *rate > 0)?);

    let mut decoder = symphonia::default::get_codecs().make(&params, &DecoderOptions::default()).ok()?;
    let mut frames: u64 = 0;
    let mut decoded_one = false;
    while let Ok(packet) = format.next_packet() {
        if packet.track_id() != track_id { continue; }
        if !decoded_one {
            decoder.decode(&packet).ok()?;
            decoded_one = true;
            if params.n_frames.is_some() { break; }
        }
        frames += packet.dur;
    }
    if !decoded_one { return None; }

    let frames = params.n_frames.unwrap_or(frames);
    let duration_ms = u32::try_from(frames.saturating_mul(1000) / sample_rate).unwrap_or(u32::MAX);
    (duration_ms > 0).then_some(AudioInfo { duration_ms })
}



// MP4
const MAX_MOOV_BYTES: u64 = 64 * 1024 * 1024;

/** What the `moov` box of an MP4 says. */
#[derive(Debug, PartialEq)]
pub struct Mp4Info { pub duration_ms: u32, pub width: u32, pub height: u32, pub has_audio: bool }

/** Reads the `moov` box of an MP4 (wherever it sits) and returns its duration, the size of its video track and
 whether it carries a sound track. `None` when there is no `moov` or no video track. */
pub fn probe_mp4(path: &Path) -> Option<Mp4Info> {
    let mut file = File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    let moov = find_top_level_box(&mut file, len, *b"moov")?;
    parse_moov(&moov)
}

/** Walks the top-level boxes of `file` and returns the body of the first one named `name`. */
fn find_top_level_box(file: &mut File, len: u64, name: [u8; 4]) -> Option<Vec<u8>> {
    let mut pos = 0u64;
    while pos + 8 <= len {
        file.seek(SeekFrom::Start(pos)).ok()?;
        let mut header = [0u8; 16];
        file.read_exact(&mut header[..8]).ok()?;
        let mut size = u64::from(u32::from_be_bytes(header[..4].try_into().ok()?));
        let mut header_len = 8;
        if size == 1 {
            file.read_exact(&mut header[8..]).ok()?;
            size = u64::from_be_bytes(header[8..].try_into().ok()?);
            header_len = 16;
        } else if size == 0 {
            size = len - pos;
        }
        if size < header_len || pos + size > len { return None; }
        if header[4..8] == name {
            let body_len = size - header_len;
            if body_len > MAX_MOOV_BYTES { return None; }
            let mut body = vec![0u8; usize::try_from(body_len).ok()?];
            file.read_exact(&mut body).ok()?;
            return Some(body);
        }
        pos += size;
    }
    None
}

/** Iterates the child boxes of `data` as `(name, body)`, stopping at the first malformed one. */
fn children(data: &[u8]) -> impl Iterator<Item = ([u8; 4], &[u8])> {
    let mut pos = 0usize;
    std::iter::from_fn(move || {
        let header = data.get(pos..pos + 8)?;
        let size = u32::from_be_bytes(header[..4].try_into().ok()?) as usize;
        let name: [u8; 4] = header[4..8].try_into().ok()?;
        if size < 8 { return None; }
        let body = data.get(pos + 8..pos + size)?;
        pos += size;
        Some((name, body))
    })
}

fn child<'a>(data: &'a [u8], name: &[u8; 4]) -> Option<&'a [u8]> {
    children(data).find(|(n, _)| n == name).map(|(_, body)| body)
}

fn be_u32(data: &[u8], at: usize) -> Option<u32> { Some(u32::from_be_bytes(data.get(at..at + 4)?.try_into().ok()?)) }
fn be_u64(data: &[u8], at: usize) -> Option<u64> { Some(u64::from_be_bytes(data.get(at..at + 8)?.try_into().ok()?)) }

/** Movie duration in ms from `mvhd`, whose field widths depend on its version byte. */
fn mvhd_duration_ms(mvhd: &[u8]) -> Option<u32> {
    let (timescale, duration) = match mvhd.first()? {
        1 => (be_u32(mvhd, 20)?, be_u64(mvhd, 24)?),
        _ => (be_u32(mvhd, 12)?, u64::from(be_u32(mvhd, 16)?)),
    };
    if timescale == 0 { return None; }
    u32::try_from(duration.saturating_mul(1000) / u64::from(timescale)).ok()
}

fn parse_moov(moov: &[u8]) -> Option<Mp4Info> {
    let duration_ms = mvhd_duration_ms(child(moov, b"mvhd")?)?;
    let mut video: Option<(u32, u32)> = None;
    let mut has_audio = false;
    for (_, trak) in children(moov).filter(|(name, _)| name == b"trak") {
        let Some(handler) = child(trak, b"mdia").and_then(|mdia| child(mdia, b"hdlr")).and_then(|h| h.get(8..12)) else { continue; };
        match handler {
            b"soun" => has_audio = true,
            b"vide" if video.is_none() => {
                // tkhd ends with width and height as 16.16 fixed point
                let tkhd = child(trak, b"tkhd")?;
                let end = tkhd.len().checked_sub(8)?;
                video = Some((be_u32(tkhd, end)? >> 16, be_u32(tkhd, end + 4)? >> 16));
            }
            _ => {}
        }
    }
    let (width, height) = video?;
    Some(Mp4Info { duration_ms, width, height, has_audio })
}



#[cfg(test)]
mod tests {
    use super::*;

    /// One MP4 box: big-endian size, name, body.
    fn bx(name: &[u8; 4], body: &[u8]) -> Vec<u8> {
        [&(body.len() as u32 + 8).to_be_bytes()[..], name, body].concat()
    }
    fn mvhd_v0(timescale: u32, duration: u32) -> Vec<u8> {
        [&[0u8; 12][..], &timescale.to_be_bytes(), &duration.to_be_bytes(), &[0u8; 80]].concat()
    }
    fn hdlr(handler: &[u8; 4]) -> Vec<u8> { [&[0u8; 8][..], handler, &[0u8; 12]].concat() }
    fn tkhd(width: u32, height: u32) -> Vec<u8> {
        [&[0u8; 76][..], &(width << 16).to_be_bytes(), &(height << 16).to_be_bytes()].concat()
    }
    fn build_moov(with_sound: bool) -> Vec<u8> {
        let video = bx(b"trak", &[bx(b"tkhd", &tkhd(640, 360)), bx(b"mdia", &bx(b"hdlr", &hdlr(b"vide")))].concat());
        let sound = bx(b"trak", &bx(b"mdia", &bx(b"hdlr", &hdlr(b"soun"))));
        let mut moov = [bx(b"mvhd", &mvhd_v0(1000, 2500)), video].concat();
        if with_sound { moov.extend(sound); }
        moov
    }
    /// A mono 16-bit PCM WAV of `frames` silent samples.
    fn pcm_wav(rate: u32, frames: u32) -> Vec<u8> {
        let data_len = frames * 2;
        let fmt = [&1u16.to_le_bytes()[..], &1u16.to_le_bytes(), &rate.to_le_bytes(), &(rate * 2).to_le_bytes(),
            &2u16.to_le_bytes(), &16u16.to_le_bytes()].concat();
        [&b"RIFF"[..], &(36 + data_len).to_le_bytes(), b"WAVE", b"fmt ", &16u32.to_le_bytes(), &fmt,
            b"data", &data_len.to_le_bytes(), &vec![0u8; data_len as usize]].concat()
    }

    #[test]
    fn mp4_with_video_and_sound_tracks() {
        let moov = build_moov(true);
        assert_eq!(parse_moov(&moov), Some(Mp4Info { duration_ms: 2500, width: 640, height: 360, has_audio: true }));
    }

    #[test]
    fn mp4_without_video_track_is_refused() {
        let mvhd = bx(b"mvhd", &mvhd_v0(1000, 2500));
        let trak = bx(b"trak", &bx(b"mdia", &bx(b"hdlr", &hdlr(b"soun"))));
        assert_eq!(parse_moov(&[mvhd, trak].concat()), None);
    }

    #[test]
    fn mp4_file_with_moov_after_mdat() {
        let path = std::env::temp_dir().join("kg_probe_moov_last.mp4");
        let file = [bx(b"ftyp", b"isom\0\0\0\0"), bx(b"mdat", &[0u8; 64]), bx(b"moov", &build_moov(false))].concat();
        std::fs::write(&path, file).unwrap();
        let info = probe_mp4(&path);
        let _ = std::fs::remove_file(&path);
        assert_eq!(info.map(|i| (i.duration_ms, i.has_audio)), Some((2500, false)));
    }

    #[test]
    fn wav_with_pcm_samples_reports_its_duration() {
        let path = std::env::temp_dir().join("kg_probe_half_second.wav");
        std::fs::write(&path, pcm_wav(8000, 4000)).unwrap();
        let info = probe_audio(&path, AudioKind::Wav);
        let as_mp3 = probe_audio(&path, AudioKind::Mp3);
        let _ = std::fs::remove_file(&path);
        assert_eq!(info, Some(AudioInfo { duration_ms: 500 }));
        assert_eq!(as_mp3, None);
    }

    #[test]
    fn id3_header_over_junk_is_not_an_mp3() {
        let path = std::env::temp_dir().join("kg_probe_fake.mp3");
        let mut bytes = b"ID3\x04\x00\x00\x00\x00\x00\x00".to_vec();
        bytes.extend(std::iter::repeat_n(0x00u8, 4096));
        std::fs::write(&path, bytes).unwrap();
        let info = probe_audio(&path, AudioKind::Mp3);
        let _ = std::fs::remove_file(&path);
        assert_eq!(info, None);
    }
}
