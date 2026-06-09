interface BreadcrumbProps {
  path: string;
  navigate: (path: string) => void;
}

export function Breadcrumb({ path, navigate }: BreadcrumbProps) {
  const parts = path.split("/").filter(Boolean);

  return (
    <div className="flex items-center gap-0.5 text-[10px] overflow-x-auto flex-1 min-w-0">
      <button
        onClick={() => navigate("/")}
        className={
          path === "/"
            ? "text-white font-semibold"
            : "text-accent hover:text-content"
        }
      >
        /
      </button>
      {parts.map((seg, i) => {
        const segPath = "/" + parts.slice(0, i + 1).join("/");
        return (
          <span key={segPath} className="flex items-center gap-0.5 shrink-0">
            <span className="text-content-faint">/</span>
            <button
              onClick={() => navigate(segPath)}
              className={
                segPath === path
                  ? "text-white font-semibold"
                  : "text-accent hover:text-content"
              }
            >
              {seg}
            </button>
          </span>
        );
      })}
    </div>
  );
}
