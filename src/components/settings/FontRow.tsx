import { useRef, useState } from 'react';
import { invoke } from '../../lib/ipc';
import { applyAppearance, fontStack } from '../../lib/appearance';
import { useDismiss } from '../../hooks/useDismiss';
import { t } from '../../i18n';
import SettingsRowText from './SettingsRowText';
import './FontRow.css';

interface FontRowProps {
	font: string | null;
	scale: number;
	onFontChange: (family: string | null) => void;
	onScaleChange: (scale: number) => void;
}

// Keep inside the backend's FONT_SCALE_MIN..=FONT_SCALE_MAX (commands.rs).
function FontRow({ font, scale, onFontChange, onScaleChange }: FontRowProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [fonts, setFonts] = useState<string[] | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);
	const text = t.settings.font;

	// built per render, so a language switch relabels them without a reload
	const scaleOptions = [
		{ value: 0.9, label: text.sizes.small },
		{ value: 1, label: text.sizes.default },
		{ value: 1.15, label: text.sizes.large },
		{ value: 1.3, label: text.sizes.larger },
	];

	const close = () => {
		setOpen(false);
		setQuery('');
	};
	useDismiss(rootRef, open, close);

	const toggle = () => {
		if (open) return close();
		setOpen(true);
		// The list is only asked for once, the first time the picker opens.
		if (fonts === null) {
			invoke<string[]>('list_system_fonts')
				.then(setFonts)
				.catch(() => setFonts([]));
		}
	};

	const chooseFont = (family: string | null) => {
		applyAppearance({ ui_font: family, font_scale: scale });
		onFontChange(family);
		close();
	};

	const chooseScale = (value: number) => {
		applyAppearance({ ui_font: font, font_scale: value });
		onScaleChange(value);
	};

	const needle = query.trim().toLowerCase();
	const visible = (fonts ?? []).filter((f) => f.toLowerCase().includes(needle));

	return (
		<div className="settings-row">
			<SettingsRowText text={text} />

			<div className="font-row-controls">
				<div className="font-picker" ref={rootRef}>
					<button
						type="button"
						className="kg-btn kg-btn--secondary kg-btn--sm font-picker-button"
						onClick={toggle}
						aria-haspopup="listbox"
						aria-expanded={open}
					>
						{font ?? text.systemDefault}
					</button>

					{open && (
						<div className="font-picker-popover">
							<input
								type="text"
								className="font-picker-search"
								placeholder={text.search}
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								autoFocus
							/>
							<div className="font-picker-list" role="listbox">
								{!needle && (
									<button
										type="button"
										role="option"
										aria-selected={font === null}
										className={
											font === null
												? 'font-picker-item selected'
												: 'font-picker-item'
										}
										onClick={() => chooseFont(null)}
									>
										{text.systemDefault}
									</button>
								)}
								{visible.map((family) => (
									<button
										key={family}
										type="button"
										role="option"
										aria-selected={family === font}
										className={
											family === font
												? 'font-picker-item selected'
												: 'font-picker-item'
										}
										style={{ fontFamily: fontStack(family) }}
										onClick={() => chooseFont(family)}
									>
										{family}
									</button>
								))}
								{fonts !== null && needle && visible.length === 0 && (
									<p className="font-picker-empty">{text.noMatches}</p>
								)}
							</div>
						</div>
					)}
				</div>

				<div
					className="font-size-group"
					role="radiogroup"
					aria-label={text.sizeLabel}
				>
					{scaleOptions.map((option) => (
						<button
							key={option.value}
							type="button"
							role="radio"
							aria-checked={option.value === scale}
							className={
								option.value === scale
									? 'font-size-option selected'
									: 'font-size-option'
							}
							onClick={() => chooseScale(option.value)}
						>
							{option.label}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}

export default FontRow;
