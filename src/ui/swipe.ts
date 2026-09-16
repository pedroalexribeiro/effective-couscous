export type HorizontalSwipe = "left" | "right";

const MIN_DISTANCE_PX = 56;
const MAX_VERTICAL_RATIO = 0.75;

export function horizontalSwipeDirection(
  deltaX: number,
  deltaY: number,
): HorizontalSwipe | null {
  if (Math.abs(deltaX) < MIN_DISTANCE_PX) {
    return null;
  }
  if (Math.abs(deltaY) > Math.abs(deltaX) * MAX_VERTICAL_RATIO) {
    return null;
  }
  return deltaX < 0 ? "left" : "right";
}
