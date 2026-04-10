import { Lock, Unlock } from "lucide-react";

interface RatioLockToggleButtonProps {
  ratioLocked: boolean;
  title: string;
  className: string;
  onClick: () => void;
}

export function RatioLockToggleButton({
  ratioLocked,
  title,
  className,
  onClick,
}: RatioLockToggleButtonProps) {
  return (
    <button className={className} title={title} onClick={onClick}>
      {ratioLocked ? (
        <Lock size={12} strokeWidth={2} />
      ) : (
        <Unlock size={12} strokeWidth={2} />
      )}
    </button>
  );
}
