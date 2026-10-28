// Source key format: "<base URL without trailing slashes>|<trimmed entity ID>".
// It identifies the cache entry of one entity; every caller must build it alike.

import { text } from "../shared/coerce.ts";

export function sourceKey(baseUrl: unknown, entityId: unknown): string {
    return `${text(baseUrl).trim().replace(/\/+$/, "")}|${text(entityId).trim()}`;
}
