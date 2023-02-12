import * as Layer from "@effect/io/Layer";
import * as Effect from "@effect/io/Effect";
import * as Data from "@effect/data/Data";

export interface FetchError extends Data.Case {
  readonly _tag: "FetchError";
  readonly error: unknown;
}

export interface JsonBodyError extends Data.Case {
  readonly _tag: "JsonBodyError";
  readonly error: unknown
}

export const FetchError = Data.tagged<FetchError>("FetchError")

export const request = (info: RequestInfo, init?: RequestInit | undefined) =>
  Effect.tryCatchPromiseInterrupt(
    (signal) => fetch(info, { ...init, signal }),
    (error) => FetchError({ error })
  );

export const JsonBodyError = Data.tagged<JsonBodyError>("JsonBodyError")

export const jsonBody = (input: Response) =>
  Effect.tryCatchPromise(
    () => input.json() as Promise<unknown>,
    (error) => JsonBodyError({ error })
  );

export interface Service {
  request: typeof request
  jsonBody: typeof jsonBody
}


export declare const layer: Layer.Layer<never, never, Service>
