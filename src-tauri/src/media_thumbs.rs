/* Library thumbnails: one small still WEBP per item (the first frame of a GIF or an animated WEBP), so the Library and
the pickers never decode the originals at full size. Rust makes them for images; MP4 posters come from the frontend
(`save_video_thumb`), which has the video decoder. Each is named after its media file (`thumbs/<stored stem>.webp`), so
a re-import, which stores a new file, gets a new URL and never shows a cached stale thumbnail. */
use image::codecs::webp::WebPEncoder;
use image::{DynamicImage, ExtendedColorType, ImageEncoder, ImageFormat, RgbaImage};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request};
use tauri::State;
use uuid::Uuid;

use crate::config;
use crate::error::{AppError, AppResult};
use crate::library::{LibraryState, MediaType};
use crate::media_compress;



/// Longest side of a thumbnail: twice a ~160 css px tile, for HiDPI screens.
pub const THUMB_SIDE: u32 = 320;
/// A poster bigger than this is not a small WEBP thumbnail.
const MAX_POSTER_BYTES: usize = 512 * 1024;
/// The header `save_video_thumb` reads the media id from.
const MEDIA_ID_HEADER: &str = "media-id";

pub fn thumbs_dir() -> PathBuf { config::data_dir().join("thumbs") }

/** The thumbnail of a media file, named after the file's stem. */
fn thumb_path(stored_file_name: &str) -> PathBuf {
    let stem = Path::new(stored_file_name).file_stem().unwrap_or_default().to_string_lossy();
    thumbs_dir().join(format!("{stem}.webp"))
}

/** Whether Rust makes this type's thumbnail itself: the raster images (SVG stays vector, MP4 is the frontend's). */
fn made_here(media_type: MediaType) -> bool {
    matches!(media_type, MediaType::Png | MediaType::Jpeg | MediaType::Webp | MediaType::Gif)
}

/** Writes the thumbnail of one media file. Types Rust doesn't thumbnail are skipped. */
pub fn make_thumb(media: &Path, stored_file_name: &str, media_type: MediaType) -> AppResult<()> {
    if !made_here(media_type) { return Ok(()); }
    let img = match media_type {
        MediaType::Gif => gif_first_frame(media).map(DynamicImage::ImageRgba8),
        _ => media_compress::decode_upright(media),
    }.ok_or(AppError::BadThumbnail)?;
    let small = if img.width().max(img.height()) > THUMB_SIDE { img.thumbnail(THUMB_SIDE, THUMB_SIDE) } else { img };
    config::write_atomic(&thumb_path(stored_file_name), &encode(&small.into_rgba8())?)
}

fn encode(img: &RgbaImage) -> AppResult<Vec<u8>> {
    let mut out = Vec::new();
    WebPEncoder::new_lossless(&mut out)
        .write_image(img.as_raw(), img.width(), img.height(), ExtendedColorType::Rgba8)
        .map_err(|_| AppError::BadThumbnail)?;
    Ok(out)
}

/** The GIF's first frame laid at its offset on a transparent canvas the size of the GIF's screen. */
fn gif_first_frame(path: &Path) -> Option<RgbaImage> {
    let file = std::fs::File::open(path).ok()?;
    let mut options = gif::DecodeOptions::new();
    options.set_color_output(gif::ColorOutput::RGBA);
    let mut decoder = options.read_info(std::io::BufReader::new(file)).ok()?;
    let (width, height) = (u32::from(decoder.width()), u32::from(decoder.height()));
    let frame = decoder.read_next_frame().ok()??;
    let (frame_w, frame_h) = (u32::from(frame.width), u32::from(frame.height));
    let pixels = RgbaImage::from_raw(frame_w, frame_h, frame.buffer.to_vec())?;
    let mut canvas = RgbaImage::new(width.max(1), height.max(1));
    image::imageops::overlay(&mut canvas, &pixels, i64::from(frame.left), i64::from(frame.top));
    Some(canvas)
}

/** Deletes a media file's thumbnail, if it has one. */
pub fn remove_thumb(stored_file_name: &str) {
    let _ = std::fs::remove_file(thumb_path(stored_file_name));
}

/**
 * Makes the missing thumbnails of `items` (stored file name, type), one at a time, so at most one original is decoded
 * at once. Blocks: call it off the main thread. With `prune`, thumbnails of files no longer in the library go too.
 */
pub fn make_missing(media_dir: &Path, items: &[(String, MediaType)], prune: bool) {
    for (name, media_type) in items {
        if !made_here(*media_type) || thumb_path(name).is_file() { continue; }
        let _ = make_thumb(&media_dir.join(name), name, *media_type);
    }
    if prune { prune_orphans(items); }
}

/** Deletes the thumbnails whose media file is no longer in the library (a crash between a delete and its cleanup). */
fn prune_orphans(items: &[(String, MediaType)]) {
    let kept: HashSet<PathBuf> = items.iter().map(|(name, _)| thumb_path(name)).collect();
    let Ok(entries) = std::fs::read_dir(thumbs_dir()) else { return; };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|e| e == "webp") && !kept.contains(&path) {
            let _ = std::fs::remove_file(path);
        }
    }
}

/** A poster from the frontend must be a WEBP no bigger than a thumbnail. */
fn check_poster(bytes: &[u8]) -> AppResult<()> {
    if bytes.is_empty() || bytes.len() > MAX_POSTER_BYTES { return Err(AppError::BadThumbnail); }
    let img = image::load_from_memory_with_format(bytes, ImageFormat::WebP).map_err(|_| AppError::BadThumbnail)?;
    if img.width().max(img.height()) > THUMB_SIDE { return Err(AppError::BadThumbnail); }
    Ok(())
}



// Commands
#[derive(serde::Serialize)]
pub struct MediaDirs {
    media: String,
    thumbs: String,
}

/// The media and thumbnail folders, so the frontend builds file URLs without one call per tile.
#[tauri::command]
pub fn get_media_dirs() -> MediaDirs {
    MediaDirs {
        media: crate::library::media_dir().to_string_lossy().into_owned(),
        thumbs: thumbs_dir().to_string_lossy().into_owned(),
    }
}

/// Stores the poster the frontend drew from an MP4's first second. Raw body: the WEBP bytes; header `media-id`.
#[tauri::command]
pub fn save_video_thumb(request: Request, library: State<LibraryState>) -> AppResult<()> {
    let InvokeBody::Raw(bytes) = request.body() else { return Err(AppError::BadThumbnail); };
    let id: Uuid = request.headers().get(MEDIA_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok())
        .ok_or(AppError::BadThumbnail)?;
    let stored_file_name = {
        let index = library.lock();
        let item = index.find(&id).ok_or(AppError::MediaNotFound(id))?;
        if item.media_type != MediaType::Mp4 { return Err(AppError::BadThumbnail); }
        item.stored_file_name.clone()
    };
    check_poster(bytes)?;
    config::write_atomic(&thumb_path(&stored_file_name), bytes)
}



#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    /** Writes a 40x30 GIF whose only frame is a 10x10 red square at (20, 5). */
    fn write_offset_gif(path: &Path) {
        let file = std::fs::File::create(path).unwrap();
        let mut encoder = gif::Encoder::new(file, 40, 30, &[255, 0, 0, 0, 0, 0]).unwrap();
        let mut frame = gif::Frame::default();
        (frame.left, frame.top, frame.width, frame.height) = (20, 5, 10, 10);
        frame.buffer = vec![0u8; 100].into();
        encoder.write_frame(&frame).unwrap();
    }

    #[test]
    fn gif_first_frame_sits_at_its_offset() {
        let path = std::env::temp_dir().join("kg_thumb_offset.gif");
        write_offset_gif(&path);
        let canvas = gif_first_frame(&path);
        let _ = std::fs::remove_file(&path);

        let canvas = canvas.unwrap();
        assert_eq!(canvas.dimensions(), (40, 30));
        assert_eq!(canvas.get_pixel(25, 10), &Rgba([255, 0, 0, 255]));
        assert_eq!(canvas.get_pixel(2, 2)[3], 0);
    }

    #[test]
    fn big_image_thumbnail_fits_the_side() {
        let img = DynamicImage::ImageRgba8(RgbaImage::new(1600, 900));
        let small = img.thumbnail(THUMB_SIDE, THUMB_SIDE);
        assert_eq!(small.width().max(small.height()), THUMB_SIDE);
        assert!(encode(&small.into_rgba8()).is_ok());
    }

    #[test]
    fn posters_must_be_small_webps() {
        let ok = encode(&RgbaImage::new(320, 180)).unwrap();
        assert!(check_poster(&ok).is_ok());

        let too_big = encode(&RgbaImage::new(640, 360)).unwrap();
        assert!(check_poster(&too_big).is_err());
        assert!(check_poster(b"not an image").is_err());
        assert!(check_poster(&[]).is_err());
        assert!(check_poster(&vec![0u8; MAX_POSTER_BYTES + 1]).is_err());
    }

    #[test]
    fn thumbnails_are_named_after_the_stored_file() {
        let path = thumb_path("1b2c.gif");
        assert_eq!(path.file_name().unwrap(), "1b2c.webp");
        assert!(path.starts_with(thumbs_dir()));
    }
}
