import { describe, expect, it } from "vitest";
import { horizontalSwipeDirection } from "./swipe.ts";

describe("horizontalSwipeDirection", () => {
  it("ignores short flicks", () => {
    expect(horizontalSwipeDirection(-40, 0)).toBeNull();
    expect(horizontalSwipeDirection(40, 0)).toBeNull();
  });

  it("ignores mostly vertical movement", () => {
    expect(horizontalSwipeDirection(-80, 90)).toBeNull();
    expect(horizontalSwipeDirection(80, -90)).toBeNull();
  });

  it("reads a left swipe as next", () => {
    expect(horizontalSwipeDirection(-80, 10)).toBe("left");
  });

  it("reads a right swipe as previous", () => {
    expect(horizontalSwipeDirection(80, -12)).toBe("right");
  });
});
