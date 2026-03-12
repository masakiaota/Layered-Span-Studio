import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { useAuthSession } from "../hooks/useAuthSession";
import type { UserRecord } from "../types";

const TOKEN_KEY = "layered-span-studio/token";

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
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("does not clear a newer token when a stale auth check fails", async () => {
    const staleCheck = createDeferred<UserRecord>();

    vi.spyOn(api, "login").mockResolvedValue({
      access_token: "new-token",
      expires_in: 3600,
      token_type: "bearer",
    });
    vi.spyOn(api, "getMe").mockImplementation((token: string) => {
      if (token === "old-token") {
        return staleCheck.promise;
      }
      if (token === "new-token") {
        return Promise.resolve(demoUser);
      }
      return Promise.reject(new Error(`Unexpected token: ${token}`));
    });

    localStorage.setItem(TOKEN_KEY, "old-token");

    const { result } = renderHook(() => useAuthSession());

    await waitFor(() => {
      expect(api.getMe).toHaveBeenCalledWith("old-token");
    });

    await act(async () => {
      const loginSucceeded = await result.current.login("demo_login_user", "demo_login_pass");
      expect(loginSucceeded).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.token).toBe("new-token");
      expect(result.current.user).toEqual(demoUser);
    });

    staleCheck.reject(new Error("expired token"));

    await waitFor(() => {
      expect(localStorage.getItem(TOKEN_KEY)).toBe("new-token");
      expect(result.current.token).toBe("new-token");
      expect(result.current.user).toEqual(demoUser);
    });
  });
});
