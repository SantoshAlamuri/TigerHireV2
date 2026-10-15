## How to add skeleton loading to a page

```tsx
import { Skeleton } from "@/components/ui/Skeleton";

const { data, loading } = useApiQuery<Foo>("/api/foo");

if (loading) {
  return (
    <div className="...same wrapper as real content...">
      {/* mirror the real shape exactly */}
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-3 w-full" />
      ...
    </div>
  );
}

return <>{/* ...real content... */}</>;
```

## Rules

1. Skeleton shape MUST match real content layout, not approximate it. Same number of rows, same card padding, same column count.
2. Use card-lifted on skeleton cards so they share the same surface as the real ones.
3. Co-locate skeleton with the page (no separate FooSkeleton.tsx). Updates stay in sync.
4. Default to skeletons over spinners. Use a spinner only for fast ephemeral actions (saving, optimistic mutation in flight) where a skeleton would overshoot.
5. Use `shape="circle"` only for genuine circles (avatars, FitRings).
