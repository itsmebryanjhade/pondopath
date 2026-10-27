import Image from "next/image";

export function ProductBrand() {
  return (
    <div className="flex items-center gap-3">
      <Image src="/brand/pondopath-mark.png" alt="" width={44} height={44} className="h-11 w-11 object-contain" />
      <div>
        <p className="text-xl font-semibold tracking-tight">PondoPath</p>
        <p className="text-xs text-neutral-600">by SoloForge</p>
      </div>
    </div>
  );
}
