import { Lock, Unlock } from "lucide-react";
import { Button } from "../../../components/ui";

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
    <Button className={className} title={title} onClick={onClick}>
      {ratioLocked ? (
        <Lock size={12} strokeWidth={2} />
      ) : (
        <Unlock size={12} strokeWidth={2} />
      )}
    </Button>
  );
}
