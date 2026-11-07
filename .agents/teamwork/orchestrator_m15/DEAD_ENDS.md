# Dead Ends Log — Milestone 15

| Iteration | Approach Tried | Why It Failed | Files Touched |
|-----------|---------------|---------------|---------------|
| 3 | Click without drag initializes dragAnchorsRef on mousedown | Clicking overlay without movement triggered spurious onUpdate with identical coordinates | TrendlinePlugin.tsx, FibonacciPlugin.tsx, StickerPlugin.tsx |
| 4 | hasMovedRef on handle/pin dragging without screen-space zero displacement check | Synthetic mousemove events with dx=0, dy=0 set hasMovedRef=true, committing onUpdate | TrendlinePlugin.tsx, FibonacciPlugin.tsx, StickerPlugin.tsx |
| 5 | Screen-space zero displacement checks (`moveEvent.clientX === dragStartPointRef.current.x && moveEvent.clientY === dragStartPointRef.current.y` and `dx === 0 && dy === 0`) returning early without resetting `hasMovedRef.current` | When user drags away and returns to exact origin, early return prevents reaching Guard 2 and leaves hasMovedRef=true and stale displaced coordinates in dragAnchorsRef; commits stale displaced coordinates on mouseup | TrendlinePlugin.tsx, FibonacciPlugin.tsx, StickerPlugin.tsx |
