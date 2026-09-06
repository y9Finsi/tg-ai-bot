/**
 * Virtual scrolling calculations for message logs and long lists.
 * Renders only the visible window of elements with buffer/overscan for 60 FPS performance.
 */

export function calculateVirtualWindow({
    totalCount,
    itemHeight = 72,
    viewportHeight = 400,
    scrollTop = 0,
    overscan = 5
}) {
    if (!totalCount || totalCount <= 0) {
        return {
            startIndex: 0,
            endIndex: 0,
            topSpacerHeight: 0,
            bottomSpacerHeight: 0,
            totalHeight: 0
        };
    }

    const totalHeight = totalCount * itemHeight;
    const rawStartIndex = Math.floor(scrollTop / itemHeight);
    const rawEndIndex = Math.ceil((scrollTop + viewportHeight) / itemHeight);

    const startIndex = Math.max(0, rawStartIndex - overscan);
    const endIndex = Math.min(totalCount, rawEndIndex + overscan);

    const topSpacerHeight = startIndex * itemHeight;
    const bottomSpacerHeight = Math.max(0, (totalCount - endIndex) * itemHeight);

    return {
        startIndex,
        endIndex,
        topSpacerHeight,
        bottomSpacerHeight,
        totalHeight
    };
}
