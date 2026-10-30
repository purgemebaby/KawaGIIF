/** Recorded meme paths. The user draws the path with the mouse on the editor's preview; the samples arrive here and
 are thinned with Visvalingam-Whyatt, kept as fractions of the monitor so the path replays on any screen size. */
use std::cmp::Ordering;
use std::collections::BinaryHeap;

use crate::memeboard::{PathPoint, MAX_MEME_MS};

/** Triangles smaller than this (px²) are jitter, not shape: about a 9 px bump over a 9 px base. Lower and a hand's
 tremor over a long stroke survives, since a triangle grows with its base. */
const MIN_AREA_PX2: f64 = 40.0;
const MAX_POINTS: usize = 240;
/** A drawn path never has more samples than this (10 s at the 60 Hz a pointer reports). */
const MAX_SAMPLES: usize = 1200;



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



/// Thins a path drawn on a `width` x `height` px preview. Samples past `MAX_MEME_MS` or outside 0..=1 are dropped first.
#[tauri::command]
pub fn simplify_meme_path(points: Vec<PathPoint>, width: f64, height: f64) -> Vec<PathPoint> {
    let points: Vec<PathPoint> = points.into_iter()
        .filter(|p| p.t <= MAX_MEME_MS && (0.0..=1.0).contains(&p.x) && (0.0..=1.0).contains(&p.y))
        .take(MAX_SAMPLES)
        .collect();
    simplify(points, width.max(1.0), height.max(1.0), MIN_AREA_PX2, MAX_POINTS)
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
