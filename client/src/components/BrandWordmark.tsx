interface BrandWordmarkProps {
  className?: string;
  titleClassName?: string;
  subtitleClassName?: string;
}

export function BrandWordmark({
  className = "",
  titleClassName = "",
  subtitleClassName = "",
}: BrandWordmarkProps) {
  return (
    <span
      className={`inline-flex flex-col leading-none ${className}`}
      aria-label="Umbravia Forge"
    >
      <span className={titleClassName} aria-hidden="true">
        Umbravia
      </span>
      <span
        className={`mt-0.5 text-[0.58em] font-semibold uppercase tracking-[0.24em] ${subtitleClassName}`}
        aria-hidden="true"
      >
        Forge
      </span>
    </span>
  );
}
