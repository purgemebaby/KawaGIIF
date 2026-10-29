/** Recorded meme paths. After a 3-2-1 countdown the stage covers the cursor's monitor with a veil and the cursor is
 sampled at ~60 Hz until a click, Escape or `MAX_MEME_MS`. The samples are then thinned with Visvalingam-Whyatt and
 stored as fractions of the monitor, so the path replays on any screen size. */
use serde::Serialize;
use std::cmp::Ordering;
use std::collections::BinaryHeap;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use crate::error::{AppError, AppResult};
use crate::memeboard::{self, PathPoint, MAX_MEME_MS};
use crate::window_manager;

const SAMPLE_EVERY: Duration = Duration::from_millis(16);
const COUNTDOWN_FROM: u32 = 3;
/** A click this soon after the start is the one that pressed Record still being released. */
const CLICK_GRACE: Duration = Duration::from_millis(250);
/** Triangles smaller than this (px²) are jitter, not shape: about a 9 px bump over a 9 px base. Lower and a hand's
 tremor over a long stroke survives, since a triangle grows with its base. */
const MIN_AREA_PX2: f64 = 40.0;
const MAX_POINTS: usize = 240;

/** What the stage shows while a path is recorded. */
#[derive(Serialize, Clone)]
#[serde(tag = "phase", content = "n", rename_all = "snake_case")]
enum RecordPhase { Countdown(u32), Recording, Done }

fn announce(app: &AppHandle, phase: RecordPhase) {
    let _ = app.emit_to(window_manager::MEME_STAGE_LABEL, "path-recording", phase);
}



/** One point waiting to be removed: the area of its triangle with its current neighbours. `stamp` goes stale when
 a neighbour is removed and the area is recomputed. */
struct Candidate { area: f64, index: usize, stamp: u32 }
impl PartialEq for Candidate {
    fn eq(&self, other: &Self) -> bool { self.cmp(other) == Ordering::Equal }
}
impl Eq for Candidate {}
impl PartialOrd for Candidate {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> { Some(self.cmp(other)) }
}
impl Ord for Candidate {
    // reversed: `BinaryHeap` is a max-heap and the smallest triangle must come out first
    fn cmp(&self, other: &Self) -> Ordering {
        other.area.total_cmp(&self.area).then_with(|| other.index.cmp(&self.index))
    }
}

/**
 * Visvalingam-Whyatt: repeatedly removes the interior point whose triangle with its two neighbours has the smallest
 * area, until every triangle left is at least `min_area` and at most `max_points` remain. A neighbour's new area never
 * drops below the one just removed (the "effective area"), so removal order stays monotonic. The ends always stay.
 * Points are compared in px (`width` x `height`), so a fraction-based path is not thinned more along its short axis.
 * O(n log n): a min-heap of candidates plus prev/next links in place of a list.
 */
pub fn simplify(points: Vec<PathPoint>, width: f64, height: f64, min_area: f64, max_points: usize) -> Vec<PathPoint> {
    let n = points.len();
    if n <= 2 { return points; }
    let xy: Vec<(f64, f64)> = points.iter().map(|p| (f64::from(p.x) * width, f64::from(p.y) * height)).collect();
    let triangle = |a: usize, b: usize, c: usize| {
        let ((ax, ay), (bx, by), (cx, cy)) = (xy[a], xy[b], xy[c]);
        ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)).abs() / 2.0
    };

    let mut prev: Vec<usize> = (0..n).map(|i| i.saturating_sub(1)).collect();
    let mut next: Vec<usize> = (0..n).map(|i| (i + 1).min(n - 1)).collect();
    let mut alive = vec![true; n];
    let mut stamp = vec![0u32; n];
    let mut remaining = n;
    let mut heap: BinaryHeap<Candidate> = (1..n - 1)
        .map(|index| Candidate { area: triangle(index - 1, index, index + 1), index, stamp: 0 })
        .collect();

    while let Some(candidate) = heap.pop() {
        let index = candidate.index;
        if !alive[index] || candidate.stamp != stamp[index] { continue; }
        if candidate.area >= min_area && remaining <= max_points { break; }
        alive[index] = false;
        remaining -= 1;
        let (before, after) = (prev[index], next[index]);
        next[before] = after;
        prev[after] = before;
        for neighbour in [before, after] {
            // the ends have no triangle
            if neighbour == 0 || neighbour == n - 1 { continue; }
            stamp[neighbour] += 1;
            let area = triangle(prev[neighbour], neighbour, next[neighbour]).max(candidate.area);
            heap.push(Candidate { area, index: neighbour, stamp: stamp[neighbour] });
        }
    }
    points.into_iter().zip(alive).filter_map(|(point, keep)| keep.then_some(point)).collect()
}



/** Runs the countdown and the recording on this (blocking) thread. Escape during the countdown cancels: no points. */
fn record(app: &AppHandle) -> AppResult<Vec<PathPoint>> {
    memeboard::stop_all(app);
    window_manager::show_meme_stage(app)?;
    let (origin, size) = window_manager::meme_stage_rect(app).ok_or(AppError::MissingStageWindow)?;
    let (ox, oy) = (f64::from(origin.x), f64::from(origin.y));
    let (w, h) = (f64::from(size.width.max(1)), f64::from(size.height.max(1)));
    window_manager::set_meme_stage_interactive(app, true);

    let finish = |app: &AppHandle| {
        window_manager::set_meme_stage_interactive(app, false);
        announce(app, RecordPhase::Done);
        window_manager::hide_meme_stage(app);
    };

    for n in (1..=COUNTDOWN_FROM).rev() {
        announce(app, RecordPhase::Countdown(n));
        let until = Instant::now() + Duration::from_secs(1);
        while Instant::now() < until {
            if window_manager::escape_down() {
                finish(app);
                return Ok(Vec::new());
            }
            std::thread::sleep(SAMPLE_EVERY);
        }
    }

    announce(app, RecordPhase::Recording);
    let start = Instant::now();
    let limit = Duration::from_millis(u64::from(MAX_MEME_MS));
    let mut points = Vec::new();
    loop {
        let elapsed = start.elapsed();
        let clicked = elapsed > CLICK_GRACE && window_manager::primary_button_down();
        if elapsed >= limit || clicked || window_manager::escape_down() { break; }
        if let Ok(cursor) = app.cursor_position() {
            points.push(PathPoint {
                t: u32::try_from(elapsed.as_millis()).unwrap_or(MAX_MEME_MS),
                x: ((cursor.x - ox) / w).clamp(0.0, 1.0) as f32,
                y: ((cursor.y - oy) / h).clamp(0.0, 1.0) as f32,
            });
        }
        std::thread::sleep(SAMPLE_EVERY);
    }
    finish(app);
    Ok(simplify(points, w, h, MIN_AREA_PX2, MAX_POINTS))
}

/// Records a path for a meme. Resolves with the thinned points, or none when cancelled with Escape.
#[tauri::command]
pub async fn record_meme_path(app: AppHandle) -> AppResult<Vec<PathPoint>> {
    tauri::async_runtime::spawn_blocking(move || record(&app)).await.map_err(|_| AppError::RecordingFailed)?
}



#[cfg(test)]
mod tests {
    use super::*;

    fn pts(coords: &[(f32, f32)]) -> Vec<PathPoint> {
        coords.iter().enumerate().map(|(i, &(x, y))| PathPoint { t: i as u32 * 16, x, y }).collect()
    }

    #[test]
    fn a_straight_line_keeps_only_its_ends() {
        let line = pts(&(0..50).map(|i| (i as f32 / 49.0, 0.5)).collect::<Vec<_>>());
        let out = simplify(line, 1000.0, 1000.0, MIN_AREA_PX2, MAX_POINTS);
        assert_eq!(out.len(), 2);
        assert_eq!((out[0].t, out[1].t), (0, 49 * 16));
    }

    #[test]
    fn a_corner_survives_the_jitter_around_it() {
        // an L with a 0.1 px wobble on every sample
        let mut coords: Vec<(f32, f32)> = (0..20).map(|i| (i as f32 / 40.0, if i % 2 == 0 { 0.0 } else { 0.0001 })).collect();
        coords.extend((0..20).map(|i| (0.5, i as f32 / 40.0)));
        let out = simplify(pts(&coords), 1000.0, 1000.0, MIN_AREA_PX2, MAX_POINTS);
        assert!(out.len() <= 4, "kept {} points", out.len());
        assert!(out.iter().any(|p| (p.x - 0.5).abs() < 0.03 && p.y < 0.03), "the corner was dropped");
    }

    #[test]
    fn the_point_budget_is_respected() {
        let zigzag = pts(&(0..400).map(|i| (i as f32 / 400.0, if i % 2 == 0 { 0.0 } else { 0.2 })).collect::<Vec<_>>());
        let out = simplify(zigzag, 1000.0, 1000.0, MIN_AREA_PX2, 50);
        assert_eq!(out.len(), 50);
        assert!(out.windows(2).all(|w| w[0].t < w[1].t));
    }
}
