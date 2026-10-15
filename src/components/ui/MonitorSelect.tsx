import { monitorLabel, type MonitorInfo } from '../../lib/monitors';
import { t } from '../../i18n/en';

interface MonitorSelectProps {
	monitors: MonitorInfo[];
	value: number;
	hint: string;
	onChange: (index: number) => void;
}

// Hidden with a single monitor: there is nothing to choose.
function MonitorSelect({
	monitors,
	value,
	hint,
	onChange,
}: MonitorSelectProps) {
	if (monitors.length < 2) return null;

	return (
		<label className="monitor-select" title={hint}>
			<span className="monitor-select-label">{t.editor.monitor.label}</span>
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
