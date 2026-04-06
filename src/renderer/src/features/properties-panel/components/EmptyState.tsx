interface EmptyStateProps {
  message: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <p className="text-xs text-content-faint text-center py-6 px-3">
      {message}
    </p>
  );
}
