import { t } from "../../i18n/en";
import WaveText from "./WaveText";
import "./KawaTitle.css";

interface Props {
  size?: string;
  animated?: boolean;
}

function KawaTitle({ size = "72px", animated = true }: Props) {
  const text = t.app.name;
  const content = animated ? <WaveText>{text}</WaveText> : text;

  return (
    <div className="kg-title-wrap" style={{ fontSize: size }}>
      <span className="kg-title-layer kg-title-keyline" aria-hidden="true">
        {content}
      </span>
      <span className="kg-title-layer kg-title-fill" aria-hidden="true">
        {content}
      </span>
      <span className="kg-title-sr">{text}</span>
    </div>
  );
}

export default KawaTitle;
