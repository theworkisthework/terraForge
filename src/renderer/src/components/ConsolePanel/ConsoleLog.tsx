import { useRef, useEffect } from "react";

interface ConsoleLogProps {
  lines: string[];
}

/**
 * Scrollable terminal output area that auto-scrolls to the bottom
 * when new lines are added.
 */
export function ConsoleLog({ lines }: ConsoleLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <div className="flex-1 overflow-y-auto font-mono text-xs p-2 bg-terminal text-green-400">
      {lines.map((line, i) => (
        <div key={i} className="leading-5 whitespace-pre">
          {line}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}