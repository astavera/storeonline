/**
 * Renders an approved department image as either full-bleed or a contained color card.
 */

import Image from "next/image";

type DepartmentImageHeroProps = {
  desktopImage: string;
  mobileImage?: string;
  title: string;
  variant?: "contained-color" | "full-bleed";
};

export function DepartmentImageHero({ desktopImage, mobileImage, title, variant = "full-bleed" }: DepartmentImageHeroProps) {
  if (!desktopImage.trim()) return null;

  const mobileSource = mobileImage?.trim() || desktopImage;

  if (variant === "contained-color") {
    return (
      <section aria-label={`${title} hero`} className="bg-surface py-5 sm:py-7 lg:py-10" data-store-component="DepartmentImageHero" data-store-variant={variant}>
        <div className="relative isolate mx-auto h-[210px] w-[calc(100%_-_2rem)] max-w-[1120px] overflow-hidden rounded-lg bg-blue shadow-sm sm:h-[230px] md:w-[84%] lg:h-[260px]">
          <h1 className="sr-only">{title}</h1>
          <Image
            alt=""
            className="object-cover md:hidden"
            fill
            priority
            sizes="calc(100vw - 2rem)"
            src={mobileSource}
            unoptimized={isRemoteImage(mobileSource)}
          />
          <Image
            alt=""
            className="hidden object-cover md:block"
            fill
            priority
            sizes="(min-width: 1334px) 1120px, (min-width: 768px) 84vw, calc(100vw - 2rem)"
            src={desktopImage}
            unoptimized={isRemoteImage(desktopImage)}
          />
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={`${title} hero`}
      className="department-image-hero relative isolate aspect-[4/3] overflow-hidden bg-surface-muted sm:aspect-[16/7] lg:aspect-[3/1]"
      data-store-component="DepartmentImageHero"
    >
      <h1 className="sr-only">{title}</h1>
      <Image
        alt=""
        className="object-cover md:hidden"
        fill
        priority
        sizes="100vw"
        src={mobileSource}
        unoptimized={isRemoteImage(mobileSource)}
      />
      <Image
        alt=""
        className="hidden object-cover md:block"
        fill
        priority
        sizes="100vw"
        src={desktopImage}
        unoptimized={isRemoteImage(desktopImage)}
      />
    </section>
  );
}

function isRemoteImage(source: string) {
  return /^https?:\/\//i.test(source);
}
