import type { ReactNode } from "react";

interface Props {
  children: string;
  className?: string;
  as?: "span" | "h1" | "h2" | "p";
}

function WaveText({ children, className, as: Tag = "span" }: Props) {
  const letters: ReactNode[] = [...children].map((char, i) => (
    <span key={i} style={{ ["--i" as string]: i }} aria-hidden="true">
      {char === " " ? " " : char}
    </span>
  ));

  return (
    <Tag className={className ? `kg-wave ${className}` : "kg-wave"} aria-label={children}>
      {letters}
    </Tag>
  );
}

export default WaveText;
