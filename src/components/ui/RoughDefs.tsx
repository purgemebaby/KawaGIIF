// Hidden SVG defs: the rough-displacement filter and the diagonal hatch shared by buttons, the switch and the RAM gauge.
function RoughDefs() {
	return (
		<svg
			width="0"
			height="0"
			aria-hidden="true"
			style={{ position: 'absolute' }}
		>
			<defs>
				<filter id="kg-rough" x="-5%" y="-5%" width="110%" height="110%">
					<feTurbulence
						type="fractalNoise"
						baseFrequency="0.035"
						numOctaves="2"
						seed="7"
						result="n"
					/>
					<feDisplacementMap
						in="SourceGraphic"
						in2="n"
						scale="2.2"
						xChannelSelector="R"
						yChannelSelector="G"
					/>
				</filter>
				{/* the same wobble for SVG strokes: a fixed region, since a path's box leaves out its stroke width and would clip the ends */}
				<filter
					id="kg-rough-wide"
					filterUnits="userSpaceOnUse"
					x="-20"
					y="-20"
					width="160"
					height="130"
				>
					<feTurbulence
						type="fractalNoise"
						baseFrequency="0.05"
						numOctaves="2"
						seed="7"
						result="n"
					/>
					<feDisplacementMap
						in="SourceGraphic"
						in2="n"
						scale="2"
						xChannelSelector="R"
						yChannelSelector="G"
					/>
				</filter>
				<pattern
					id="kg-hatch"
					width="5"
					height="5"
					patternUnits="userSpaceOnUse"
					patternTransform="rotate(45)"
				>
					<line
						x1="0"
						y1="0"
						x2="0"
						y2="5"
						stroke="currentColor"
						strokeWidth="1.6"
						strokeLinecap="round"
					/>
				</pattern>
			</defs>
		</svg>
	);
}

export default RoughDefs;
