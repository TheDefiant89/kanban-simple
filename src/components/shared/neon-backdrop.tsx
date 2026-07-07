/**
 * Fixed decorative neon backdrop — three large, blurred radial "blobs" sitting
 * behind all app content. Purely cosmetic: pointer-events none, z-index 0, kept
 * subtle (per the redesign's locked Slate config). Content is layered above via
 * position/z-index in the layouts.
 */
export function NeonBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-[0.28] transition-opacity duration-500 dark:opacity-40"
    >
      <span
        className="absolute rounded-full"
        style={{
          top: "-8%",
          left: "-6%",
          width: "44vw",
          height: "44vw",
          background: "radial-gradient(circle, rgba(34,211,238,0.55), transparent 68%)",
          filter: "blur(70px)",
        }}
      />
      <span
        className="absolute rounded-full"
        style={{
          top: "45%",
          left: "62%",
          width: "42vw",
          height: "42vw",
          background: "radial-gradient(circle, rgba(168,85,247,0.55), transparent 68%)",
          filter: "blur(70px)",
        }}
      />
      <span
        className="absolute rounded-full"
        style={{
          top: "68%",
          left: "-8%",
          width: "38vw",
          height: "38vw",
          background: "radial-gradient(circle, rgba(34,211,238,0.5), transparent 68%)",
          filter: "blur(70px)",
        }}
      />
    </div>
  );
}
