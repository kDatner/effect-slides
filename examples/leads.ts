import { Effect, Http, pipe } from "./common"

export const getLead = (id: string) =>
  pipe(
    Http.request(`/v1/leads/${id}`),
    Effect.flatMap(Http.jsonBody)
  )

export const getLeads = (ids: string[]) =>
  Effect.collectAllPar(ids.map(getLead))

