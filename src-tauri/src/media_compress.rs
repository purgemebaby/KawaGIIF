/* Shrinks oversized still imports (PNG/JPEG/WEBP): caps the longest side at 3840 px and re-encodes in place, keeping the new file only when it is at least 10 % smaller. */
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::{CompressionType, FilterType as PngFilter, PngEncoder};
use image::codecs::webp::WebPEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, ExtendedColorType, ImageDecoder, ImageEncoder, ImageReader};
use std::io::Read;
use std::path::{Path, PathBuf};

use crate::error::AppResult;
use crate::library::MediaType;



/// Files below this size are not worth a re-encode (1.5 MiB).
const MIN_BYTES: u64 = 3 * 512 * 1024;
/// Longest side a shrunk image keeps.
const MAX_SIDE: u32 = 3840;
/// JPEG re-encode quality.
const JPEG_QUALITY: u8 = 88;
/// The rewrite must save at least this many percent to replace the original.
const MIN_SAVING_PERCENT: u64 = 10;
/// The animation bit of a WEBP `VP8X` flags byte.
const VP8X_ANIMATION: u8 = 0x02;



/// Shrinks a still PNG/JPEG/WEBP in place when that saves space. Returns true if the file was rewritten.
pub fn shrink_still_image(path: &Path, media_type: MediaType) -> AppResult<bool> {
    match media_type {
        MediaType::Gif | MediaType::Mp4 | MediaType::Svg => return Ok(false),
        // re-encoding an animated WEBP would flatten it to its first frame
        MediaType::Webp if webp_is_animated(path) => return Ok(false),
        _ => {}
    }

    let original_len = std::fs::metadata(path)?.len();
    if original_len < MIN_BYTES { return Ok(false); }

    // a file that does not decode keeps its bytes
    let Some(img) = decode_upright(path) else { return Ok(false); };
    let img = cap_resolution(img);

    let tmp = temp_path(path);
    let shrunk = replace_when_smaller(&tmp, path, media_type, &img, original_len);
    // a successful rename took the temp file away already; every other way out deletes it here
    let _ = std::fs::remove_file(&tmp);
    shrunk
}

/** Encodes `img` to `tmp` and renames it over `path` when that is at least 10 % smaller than `original_len`. */
fn replace_when_smaller(tmp: &Path, path: &Path, media_type: MediaType,
    img: &DynamicImage, original_len: u64,
) -> AppResult<bool> {
    let file = std::fs::File::create(tmp)?;
    // an encode failure (a color the target format rejects, a full disk) keeps the original
    if encode_still(file, media_type, img).is_err() { return Ok(false); }

    if std::fs::metadata(tmp)?.len() * 100 > original_len * (100 - MIN_SAVING_PERCENT) { return Ok(false); }
    std::fs::rename(tmp, path)?;
    Ok(true)
}



/** Decodes `path` with its EXIF orientation applied: the re-encode drops the EXIF, so the pixels must already stand upright. */
fn decode_upright(path: &Path) -> Option<DynamicImage> {
    let mut decoder = ImageReader::open(path).ok()?.with_guessed_format().ok()?.into_decoder().ok()?;
    let orientation = decoder.orientation().ok()?;
    let mut img = DynamicImage::from_decoder(decoder).ok()?;
    img.apply_orientation(orientation);
    Some(img)
}

/** The image with its longest side capped at `MAX_SIDE`, aspect ratio kept. */
fn cap_resolution(img: DynamicImage) -> DynamicImage {
    if img.width().max(img.height()) <= MAX_SIDE { return img; }
    // resize fits inside the square box while keeping the aspect ratio
    img.resize(MAX_SIDE, MAX_SIDE, FilterType::Lanczos3)
}

/** `<name>.tmp` next to `path`, so the rename stays on the same volume. */
fn temp_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_owned();
    name.push(".tmp");
    path.with_file_name(name)
}

/** Encodes `img` into `out` in the format it was imported as, alpha channel included. */
fn encode_still(out: std::fs::File, media_type: MediaType, img: &DynamicImage) -> image::ImageResult<()> {
    let (w, h) = (img.width(), img.height());
    let color = ExtendedColorType::from(img.color());
    let bytes = img.as_bytes();
    match media_type {
        MediaType::Png => PngEncoder::new_with_quality(out, CompressionType::Best, PngFilter::Adaptive)
            .write_image(bytes, w, h, color),
        MediaType::Jpeg => JpegEncoder::new_with_quality(out, JPEG_QUALITY).write_image(bytes, w, h, color),
        MediaType::Webp => WebPEncoder::new_lossless(out).write_image(bytes, w, h, color),
        // the early match in shrink_still_image already sent these back untouched
        MediaType::Gif | MediaType::Mp4 | MediaType::Svg => Ok(()),
    }
}



/** Whether `path` is an animated WEBP: a `VP8X` chunk with the animation flag, or an `ANIM` chunk. */
fn webp_is_animated(path: &Path) -> bool {
    // the markers sit in the first chunks, so the file head is enough
    let mut head = [0u8; 4096];
    let n = std::fs::File::open(path).and_then(|mut file| file.read(&mut head)).unwrap_or(0);
    riff_is_animated(&head[..n])
}

/** Walks the RIFF chunks of a WEBP looking for its animation markers. */
fn riff_is_animated(bytes: &[u8]) -> bool {
    if bytes.get(8..12) != Some(b"WEBP") { return false; }

    let mut off = 12; // past "RIFF<size>WEBP"
    while off + 8 <= bytes.len() {
        let tag = &bytes[off..off + 4];
        let size = u32::from_le_bytes(bytes[off + 4..off + 8].try_into().unwrap()) as usize;
        let animated = tag == b"ANIM"
            || (tag == b"VP8X" && bytes.get(off + 8).is_some_and(|flags| flags & VP8X_ANIMATION != 0));
        if animated { return true; }
        // chunk payloads are padded to an even size
        let Some(next) = (off + 8 + size).checked_add(size & 1) else { break };
        off = next;
    }
    false
}



#[cfg(test)]
mod tests {
    use super::*;

    use image::{Rgba, RgbaImage};



    /** A diagonal RGBA gradient: noise-free, so a compressed re-encode has something to beat. */
    fn gradient(w: u32, h: u32) -> RgbaImage {
        image::ImageBuffer::from_fn(w, h, |x, y| {
            Rgba([
                (x * 255 / (w - 1)) as u8,
                (y * 255 / (h - 1)) as u8,
                ((x + y) * 255 / (w + h - 2)) as u8,
                255,
            ])
        })
    }

    /** Writes `img` as an uncompressed PNG, a valid but wasteful file. */
    fn write_png(path: &Path, img: &RgbaImage) {
        let file = std::fs::File::create(path).unwrap();
        PngEncoder::new_with_quality(file, CompressionType::Uncompressed, PngFilter::NoFilter)
            .write_image(img.as_raw(), img.width(), img.height(), ExtendedColorType::Rgba8)
            .unwrap();
    }

    #[test]
    fn oversized_png_is_resized_and_shrunk() {
        let path = std::env::temp_dir().join("kg_media_compress_oversized.png");
        write_png(&path, &gradient(5000, 3000));

        let before = std::fs::metadata(&path).unwrap().len();
        let shrunk = shrink_still_image(&path, MediaType::Png).unwrap();
        let after = std::fs::metadata(&path).unwrap().len();
        let width = image::image_dimensions(&path).unwrap().0;
        let tmp_left = temp_path(&path).exists();
        let _ = std::fs::remove_file(&path);

        assert!(before > MIN_BYTES);
        assert!(shrunk);
        assert!(width <= MAX_SIDE);
        assert!(after < before);
        assert!(!tmp_left);
    }

    #[test]
    fn small_png_is_left_alone() {
        let path = std::env::temp_dir().join("kg_media_compress_small.png");
        write_png(&path, &gradient(100, 100));

        let before = std::fs::metadata(&path).unwrap().len();
        let shrunk = shrink_still_image(&path, MediaType::Png).unwrap();
        let after = std::fs::metadata(&path).unwrap().len();
        let tmp_left = temp_path(&path).exists();
        let _ = std::fs::remove_file(&path);

        assert!(!shrunk);
        assert_eq!(before, after);
        assert!(!tmp_left);
    }

    #[test]
    fn webp_animation_markers_are_detected() {
        // a VP8X payload is a flags byte (0x02 = animation), three reserved bytes and the canvas size
        let animated_vp8x = [0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let still_vp8x = [0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // alpha bit only
        let anim = [0u8; 6];

        assert!(riff_is_animated(&webp(&[(b"VP8X", &animated_vp8x)])));
        assert!(riff_is_animated(&webp(&[(b"VP8X", &still_vp8x), (b"ANIM", &anim)])));
        assert!(!riff_is_animated(&webp(&[(b"VP8X", &still_vp8x)])));
        assert!(!riff_is_animated(&webp(&[(b"VP8 ", &[0; 20])])));
    }

    /** "RIFF<size>WEBP" plus the given chunks, each payload padded to an even size. */
    fn webp(chunks: &[(&[u8], &[u8])]) -> Vec<u8> {
        let mut body = b"WEBP".to_vec();
        for (tag, payload) in chunks {
            body.extend_from_slice(tag);
            body.extend_from_slice(&(payload.len() as u32).to_le_bytes());
            body.extend_from_slice(payload);
            if payload.len() & 1 == 1 { body.push(0); }
        }
        let mut out = b"RIFF".to_vec();
        out.extend_from_slice(&(body.len() as u32).to_le_bytes());
        out.extend_from_slice(&body);
        out
    }
}