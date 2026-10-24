import { useEffect, useState } from 'react';
import { invoke } from '../../lib/ipc';
import { t } from '../../i18n';
import './RamGauge.css';

interface SystemStats {
	total_ram_mb: number;
	used_ram_mb: number;
	available_ram_mb: number;
	app_ram_mb: number;
}

const REFRESH_MS = 3000;
const START_ANGLE = -210;
const SWEEP = 240;
const CX = 60; // center x
const CY = 50; // center y
const ARC_RADIUS = 45;
const NEEDLE_RADIUS = 35;
const HIGH_RATIO = 0.8;

function toGb(mb: number): string {
	return (mb / 1024).toFixed(1);
}

function polar(cx: number, cy: number, radius: number, angleDeg: number) {
	const rad = (angleDeg * Math.PI) / 180;
	return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }; //Cartesian
}

function arcPath(
	cx: number,
	cy: number,
	radius: number,
	fromDeg: number,
	toDeg: number,
) {
	const start = polar(cx, cy, radius, fromDeg);
	const end = polar(cx, cy, radius, toDeg);
	const largeArc = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
	return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function RamGauge() {
	// null, function
	const [stats, setStats] = useState<SystemStats | null>(null);

	useEffect(() => {
		let cancelled = false;
		// system_stats.rs
		const read = async () => {
			const next = await invoke<SystemStats>('get_system_stats');
			if (!cancelled) setStats(next);
		};
		read();
		const timer = window.setInterval(read, REFRESH_MS);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, []);

	if (!stats || stats.total_ram_mb === 0) {
		return <p className="empty-state">{t.common.loading}</p>;
	}

	const ratio = Math.min(stats.used_ram_mb / stats.total_ram_mb, 1);
	const needleAngle = START_ANGLE + SWEEP * ratio;
	const needle = polar(CX, CY, NEEDLE_RADIUS, needleAngle);

	return (
		<div className="ram-gauge">
			<svg
				viewBox="0 0 120 90"
				className="ram-gauge-dial"
				role="img"
				aria-label={t.settings.ram.label}
			>
				<path
					d={arcPath(CX, CY, ARC_RADIUS, START_ANGLE, START_ANGLE + SWEEP)}
					className="ram-gauge-track"
				/>
				<path
					d={arcPath(CX, CY, ARC_RADIUS, START_ANGLE, needleAngle)}
					className={
						ratio > HIGH_RATIO ? 'ram-gauge-fill is-high' : 'ram-gauge-fill'
					}
				/>
				<line
					x1={CX}
					y1={CY}
					x2={needle.x}
					y2={needle.y}
					className="ram-gauge-needle"
				/>
				<circle cx={CX} cy={CY} r="3.5" className="ram-gauge-hub" />
			</svg>

			<div className="ram-gauge-readout">
				<strong>
					{toGb(stats.used_ram_mb)} / {toGb(stats.total_ram_mb)} GB
				</strong>
				<small>{t.settings.ram.system}</small>
			</div>

			<p className="ram-gauge-app">{t.settings.ram.app(stats.app_ram_mb)}</p>
		</div>
	);
}

export default RamGauge;
