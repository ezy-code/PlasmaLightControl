import { isList } from "../colors/convert.ts";

/** "||" is intentional: null, undefined, 0 and "" all mean "not set". */
export function text(value: unknown): string {
    return String(value || "");
}

export function strings(value: unknown): string[] {
    if (!isList(value))
        return [];
    const result: string[] = [];
    for (let i = 0; i < value.length; ++i)
        result.push(String(value[i]));
    return result;
}
