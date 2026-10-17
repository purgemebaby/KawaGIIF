import { monitorLabel, type MonitorInfo } from '../../lib/monitors';

interface MonitorSelectProps {
	monitors: MonitorInfo[];
	value: number;
	label: string;
	hint: string;
	onChange: (index: number) => void;
}

// Hidden with a single monitor: there is nothing to choose.
function MonitorSelect({
	monitors,
	value,
	label,
	hint,
	onChange,
}: MonitorSelectProps) {
	if (monitors.length < 2) return null;

	return (
		<label className="monitor-select" title={hint}>
			<span className="monitor-select-label">{label}</span>
			<select
				className="kg-select"
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
			>
				{monitors.map((monitor) => (
					<option key={monitor.index} value={monitor.index}>
						{monitorLabel(monitor)}
					</option>
				))}
			</select>
		</label>
	);
}

export default MonitorSelect;
