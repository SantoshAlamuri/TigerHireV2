## How to make a button optimistic

```ts
const { toast } = useToast();
const { mutate } = useOptimisticMutation<Response, Payload>("/api/endpoint", {
  onMutate: (vars) => applyLocalOptimistic(vars),
  onSuccess: () => toast({ title: "Saved", tone: "success" }),
  onError: (err, vars, rollback) => {
    rollback();
    toast({ title: "Failed", description: err.message, tone: "error" });
  },
});
```

## When to use undo vs immediate revert

- Reversible actions (delete, archive, withdraw): show toast with Undo and delay server write for ~5s.
- Forward actions (apply, submit, save): send immediately, optimistic first, revert on error.
- Keep rollback logic local and deterministic so retries are safe.
