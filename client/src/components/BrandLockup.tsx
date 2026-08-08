interface BrandLockupProps {
  className?: string;
  alt?: string;
}

export function BrandLockup({
  className = "h-12 w-auto",
  alt = "Umbravia Forge",
}: BrandLockupProps) {
  return (
    <img
      src="/brand/umbravia-forge-wordmark-v2.png"
      alt={alt}
      className={`object-contain object-left ${className}`}
    />
  );
}
