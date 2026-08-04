import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-10">
      <header className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-full max-w-3xl" />
        <Skeleton className="h-5 w-2/3 max-w-2xl" />
      </header>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-9 w-44" />
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_16rem_14rem_16rem]">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-32 w-full" />
        ))}
      </section>

      <section className="space-y-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-40 w-full" />
        ))}
      </section>
    </div>
  );
}
