interface BreadcrumbProps {
  path: string;
  navigate: (path: string) => void;
}

const CURRENT = "text-content font-semibold";
const ANCESTOR = "text-content-muted hover:text-content transition-colors";

/**
 * The current folder as clickable crumbs: `/` for the root, then each
 * segment. The root button doubles as the first slash, so separators sit
 * only between segments — `/a/b`, never `//a/b`.
 */
export function Breadcrumb({ path, navigate }: BreadcrumbProps) {
  const parts = path.split("/").filter(Boolean);

  return (
    <div className="flex items-center gap-0.5 text-[10px] overflow-x-auto flex-1 min-w-0">
      <button
        onClick={() => navigate("/")}
        aria-label="Root folder"
        className={parts.length === 0 ? CURRENT : ANCESTOR}
      >
        /
      </button>
      {parts.map((seg, i) => {
        const segPath = "/" + parts.slice(0, i + 1).join("/");
        return (
          <span key={segPath} className="flex items-center gap-0.5 shrink-0">
            {i > 0 && <span className="text-content-faint">/</span>}
            <button
              onClick={() => navigate(segPath)}
              className={i === parts.length - 1 ? CURRENT : ANCESTOR}
            >
              {seg}
            </button>
          </span>
        );
      })}
    </div>
  );
}
