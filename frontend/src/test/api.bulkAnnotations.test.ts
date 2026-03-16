import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../api";

describe("ApiClient.bulkCreateDocumentAnnotations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves meta: null in request payload", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ created: [], errors: [] }), {
        status: 201,
        headers: {
          "content-type": "application/json",
        },
      }),
    );
    const client = new ApiClient("/api");

    await client.bulkCreateDocumentAnnotations("project-1", "doc-1", [
      {
        label_id: "label-1",
        start: 0,
        end: 2,
        span_text: "頭痛",
        comment: "",
        status: "pending",
        meta: null,
      },
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestOptions = fetchSpy.mock.calls[0]?.[1];
    const body = JSON.parse(String(requestOptions?.body)) as {
      annotations: Array<{ meta: unknown }>;
    };
    expect(body.annotations[0]?.meta).toBeNull();
  });
});
