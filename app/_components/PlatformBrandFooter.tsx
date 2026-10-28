/**
 * Identidade institucional do Order System, no fim da página.
 * Não substitui a marca individual de cada seller exibida na vitrine.
 * Mantida no RootLayout para aparecer em todas as rotas sem posição fixa.
 */
export default function PlatformBrandFooter() {
  return (
    <footer
      aria-label="Identidade da plataforma Order System"
      className="w-full shrink-0 border-t border-neutral-200/50 bg-transparent px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 dark:border-neutral-800/50 lg:pb-6"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/order-system-footer.png"
          alt="Order System — Simple Orders. Bigger Business."
          width={433}
          height={132}
          loading="lazy"
          decoding="async"
          className="h-auto w-full max-w-[240px] rounded-md object-contain opacity-85 sm:max-w-[270px]"
        />
      </div>
    </footer>
  );
}
