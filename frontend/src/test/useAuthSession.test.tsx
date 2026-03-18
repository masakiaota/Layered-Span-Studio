import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../api";
import { useAuthSession } from "../hooks/useAuthSession";
import { createQueryWrapper } from "./queryTestUtils";
import type { UserRecord } from "../types";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"];
  let reject!: Deferred<T>["reject"];
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

const demoUser: UserRecord = {
  id: "user-1",
  username: "demo_login_user",
  meta: {},
};

describe("useAuthSession", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("restores an existing session on mount", async () => {
    vi.spyOn(api, "getSession").mockResolvedValue(demoUser);

    const { result } = renderHook(() => useAuthSession(), { wrapper: createQueryWrapper() });

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.user).toEqual(demoUser);
      expect(result.current.error).toBe("");
    });
  });

  it("treats 401 during bootstrap as logged out without surfacing an error", async () => {
    vi.spyOn(api, "getSession").mockRejectedValue(new ApiError("Not authenticated", 401));

    const { result } = renderHook(() => useAuthSession(), { wrapper: createQueryWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.error).toBe("");
    });
  });

  it("logs in via session creation and stores the current user in memory only", async () => {
    vi.spyOn(api, "getSession").mockRejectedValue({ status: 401 });
    vi.spyOn(api, "createSession").mockResolvedValue(demoUser);

    const { result } = renderHook(() => useAuthSession(), { wrapper: createQueryWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      const loginSucceeded = await result.current.login("demo_login_user", "demo_login_pass");
      expect(loginSucceeded).toBe(true);
    });

    expect(api.createSession).toHaveBeenCalledWith("demo_login_user", "demo_login_pass");
    expect(result.current.user).toEqual(demoUser);
    expect(result.current.error).toBe("");
  });

  it("does not let a stale bootstrap session check clear a newer login", async () => {
    const staleBootstrap = createDeferred<UserRecord>();

    vi.spyOn(api, "getSession").mockImplementation(() => staleBootstrap.promise);
    vi.spyOn(api, "createSession").mockResolvedValue(demoUser);

    const { result } = renderHook(() => useAuthSession(), { wrapper: createQueryWrapper() });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      const loginSucceeded = await result.current.login("demo_login_user", "demo_login_pass");
      expect(loginSucceeded).toBe(true);
    });

    expect(result.current.user).toEqual(demoUser);

    await act(async () => {
      staleBootstrap.reject(new ApiError("Not authenticated", 401));
      await staleBootstrap.promise.catch(() => undefined);
    });

    expect(result.current.user).toEqual(demoUser);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("");
  });

  it("clears the user after logout even if the delete request fails", async () => {
    vi.spyOn(api, "getSession").mockResolvedValue(demoUser);
    vi.spyOn(api, "deleteSession").mockRejectedValue(new Error("logout failed"));

    const { result } = renderHook(() => useAuthSession(), { wrapper: createQueryWrapper() });

    await waitFor(() => {
      expect(result.current.user).toEqual(demoUser);
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.error).toBe("logout failed");
  });
});
