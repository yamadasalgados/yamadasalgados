// Legacy endpoint kept only so existing Firebase deployments can be closed
// explicitly after the unified order API is published.
import { onRequest } from "firebase-functions/v2/https";

export const createEventOrder = onRequest(
  {
    region: "asia-northeast1",
  },
  (_request, response) => {
    response.status(410).json({
      ok: false,
      code: "LEGACY_ENDPOINT_DISABLED",
      error:
        "This endpoint was replaced by the unified /api/orders/create backend.",
    });
  },
);
