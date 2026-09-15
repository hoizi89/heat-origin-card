import { vi } from "vitest";

/*
 * The fixtures are the real Lambda day of 15 September 2026: history from
 * yesterday's midnight to 13:40. Every test runs at that moment.
 */
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date(2026, 8, 15, 13, 40, 0));
