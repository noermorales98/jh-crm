import Image from "next/image";

type BrandLockupProps = {
  tag?: string;
  size?: number;
  priority?: boolean;
};

/**
 * Marca de J&H: el logo 1:1 cubre la palabra "J&H";
 * el tag legal se mantiene como texto.
 */
export function BrandLockup({
  tag = "Multiservices LLC",
  size = 36,
  priority = false,
}: BrandLockupProps) {
  return (
    <>
      <Image
        src="/logo.png"
        alt="J&H"
        width={size}
        height={size}
        className="brand-logo"
        sizes={`${size}px`}
        priority={priority}
      />
      <span className="brand-tag">{tag}</span>
    </>
  );
}
