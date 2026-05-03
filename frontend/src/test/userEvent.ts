import userEvent, { PointerEventsCheckLevel } from "@testing-library/user-event";

type UserEventSetupOptions = Parameters<typeof userEvent.setup>[0];

export function setupUserEvent(options: UserEventSetupOptions = {}) {
  return userEvent.setup({
    pointerEventsCheck: PointerEventsCheckLevel.Never,
    ...options,
  });
}
