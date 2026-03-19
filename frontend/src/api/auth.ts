import type { UserRecord } from "../api-contract";
import { client, unwrapData, unwrapVoid } from "./client";

export function createSession(username: string, password: string) {
  return unwrapData<UserRecord>(client.POST("/auth/session", {
    body: { username, password },
  }));
}

export function getSession() {
  return unwrapData<UserRecord>(client.GET("/auth/session"));
}

export async function deleteSession() {
  await unwrapVoid(client.DELETE("/auth/session"));
}
