import { Effect, Http, Layer, pipe } from "./common"

export const getLead = (id: string) =>
  pipe(
    Http.request(`/v1/leads/${id}`),
    Effect.flatMap(Http.jsonBody),
    Effect.orDie,
  )

export const getLeads = (ids: string[]) =>
  Effect.collectAllPar(ids.map(getLead))

export interface Repository {
  getLead: typeof getLead
  getLeads: typeof getLeads
}

export declare const layer: Layer.Layer<Http.Service, never, Repository>

