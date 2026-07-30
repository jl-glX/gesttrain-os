interface BrandLogoProps {
  className?: string;
  alt?: string;
}

export function BrandLogo({
  className = "h-10 w-10 rounded-xl",
  alt = "GestTrain/OS",
}: BrandLogoProps) {
  return (
    <img
      src="/gesttrain-os-logo.png"
      alt={alt}
      className={`shrink-0 object-cover ${className}`}
    />
  );
}
