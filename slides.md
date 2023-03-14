---
canvasWidth: 1024
layout: intro
---

# Effects and Effectful Programs

Or: How to think with composition

---
layout: fact
---

# Scenario

Once upon a time, there was the Best Startup Ever

You're a developer hired to an insure-tech startup, SmoochEarth. They plan to "grow fast" and have a very passionate team running the business.
You're tasked with the usual impossible demand:

Build scalable, secure, robust software that is easy to iterate on and maintain.

Also, do it in 2 weeks


You know the shtick.

---

# Humble Beginning

```ts twoslash
/// <reference path="node_modules/@types/node/index.d.ts"
// ---cut---

async function getLead(id: string): Promise<unknown> {
  const res = await fetch(`/v1/leads/${id}`);

  return await res.json();
}

async function getLeads(ids: string[]): Promise<unknown[]> {
  const leads: unknown[] = [];

  for (const id of ids) {
    leads.push(await getLead(id));
  }

  return leads;
}

async function main() {
  const leads = await getLeads(["1", "2", "3", "4", "5"]);

  for (const lead of leads) {
    console.log(`Got a lead: ${JSON.stringify(lead)}`);
  }
}
```

---

# All together now!

Maximising performance means doing things in parallel as much as possible

Reaching unbounded parallelism is easy enough

```ts twoslash
/// <reference path="node_modules/@types/node/index.d.ts" />
const getLead = async (id: string): Promise<unknown> => {
  const res = await fetch(id);
  return await res.json();
};
// ---cut---
const getLeads = async (ids: string[]) => {
  const leads: Promise<unknown>[] = [];
  for (const id of ids) {
    leads.push(getLead(id));
  }
  return await Promise.all(leads);
};
```

<v-click>

But things get more complicated when you want to control the concurrency..

```ts twoslash
/// <reference path="node_modules/@types/node/index.d.ts" />
const getLead = async (id: string): Promise<unknown> => {
  const res = await fetch(id);
  return await res.json();
};
// ---cut---
const getLeads = async (ids: string[]) => {
  const chunkSize = 5;
  const leads: unknown[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    leads.push(await Promise.all(chunk.map(getLead)));
  }
  return leads;
};
```

</v-click>

---

# Um Akshually

Well, chunking is not really maximizing parallelism now is it?

<style> 
pre .code-container {
  overflow: hidden; 
  font-size: 14px; 
} 

pre .code-container .line {
  padding-bottom: 2px; 
} 

pre.shiki div.line {
  min-height: 0px; 
} 
</style>

```ts twoslash
/// <reference path="node_modules/@types/node/index.d.ts" />
const getLead = async (id: string): Promise<unknown> => {
  const res = await fetch(id);
  return await res.json();
};
// ---cut---
const getLeads = (ids: string[], limit = 5) => {
  const remaining = ids
    .slice(0, ids.length)
    .map((id, index) => [id, index] as const)
    .reverse();
  const results: unknown[] = [];
  return new Promise<unknown[]>((resolve, reject) => {
    let pending = 0;
    for (let i = 0; i < limit; i++) {
      fetchRemaining();
    }
    function fetchRemaining() {
      if (remaining.length > 0) {
        const [remainingToFetchId, remainingToFetchIdx] = remaining.pop()!;
        pending++;
        getLead(remainingToFetchId)
          .then((res) => {
            results[remainingToFetchIdx] = res;
            pending--;
            fetchRemaining();
          })
          .catch((err) => reject(err));
      } else if (pending === 0) {
        resolve(results);
      }
    }
  });
};
```

---

# Well Excuuuuuuse me!

That would have been fine, but what about interruptions?

<style> 
pre .code-container {
  overflow: hidden; 
  font-size: 11px; 
} 

pre .code-container .line {
  padding-bottom: 0px; 
} 

pre.shiki div.line {
  min-height: 0px; 
} 
</style>

```ts twoslash
/// <reference path="node_modules/@types/node/index.d.ts" />
interface GetLeadsOptions {
  limit?: number;
  signal?: AbortSignal;
}
interface GetLeadOptions {
  signal?: AbortSignal;
}
// ---cut---
const getLead = async (id: string, opts?: GetLeadOptions): Promise<unknown> => {
  const res = await fetch(id, { signal: opts?.signal });
  return await res.json();
};
const getLeads = (ids: string[], opts?: GetLeadsOptions) => {
  const limit = opts?.limit ?? 5;
  const controller = new AbortController();
  const remaining = ids.slice(0, ids.length).map((id, index) => [id, index] as const).reverse();
  const results: unknown[] = [];
  if (opts?.signal) {
    opts.signal.addEventListener("abort", () => {
      controller.abort();
    });
  }
  return new Promise<unknown[]>((resolve, reject) => {
    let pending = 0;
    for (let i = 0; i < limit; i++) {
      fetchRemaining();
    }
    function fetchRemaining() {
      if (remaining.length > 0) {
        const [remainingToFetchId, remainingToFetchIdx] = remaining.pop()!;
        pending++;
        getLead(remainingToFetchId, { signal: controller.signal }).then((res) => {
            results[remainingToFetchIdx] = res;
            pending--;
            fetchRemaining();
          })
          .catch((err) => {
            controller.abort();
            reject(err);
          });
      } else if (pending === 0) {
        resolve(results);
      }
    }
  });
};
```

Though, we don't have interruptions on program shutdown or async interruptions

---

# Hard as steel

What about errors? Resilience is very important, especially when it comes to Http requests 

```ts twoslash
/// <reference path="node_modules/@types/node/index.d.ts" />
interface RetryOptions {
  limit?: number;
  cap?: number;
  base?: number;
  exponent?: number;
}
interface GetLeadOptions {
  signal?: AbortSignal;
}
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
// ---cut---
const callWithRetry = async <A>(
  fn: () => Promise<A>,
  opts?: RetryOptions,
  depth = 0
): Promise<A> => {
  try {
    return await fn();
  } catch (e) {
    if (depth > (opts?.limit ?? 10)) {
      throw e
    }
    await wait(Math.min((opts?.base ?? 2) ** depth * (opts?.exponent ?? 10), opts?.cap ?? 2000))
    return callWithRetry(fn, opts, depth + 1)
  }
}
const getLead = (id: string, opts?: GetLeadOptions): Promise<unknown> => 
  callWithRetry( async () => {
    const res = await fetch(id, { signal: opts?.signal });
    return await res.json();
  }, { limit: 10, cap: 2000, base: 2, exponent: 10 });

```

---

# You think that's enough?

We haven't even covered all the base features usually found in real-world apps

<v-clicks>

  - Logging
  - Metrics
  - Tracing
  - Dependency Injection
  - Fail-Fast Mechanisms
  - Scopes
  - Queue Management
  - Etc.

</v-clicks>

---
layout: center
---
# What about the next guy?

The code looked pretty scary. plus it was hard to understand, let alone extend it...

---
layout: two-cols
---

# Dedicated Solutions

Ol' Reliable

<v-clicks>

  - `got`?
  - `Angular`?
  - `RxJS`?

</v-clicks>

::right::

<v-click>

# Effectful Abstractions

Composable tools like `RxJS` are a step in the right direction.

They enable the developer to write abstract software definitions, 
a pseudo-DSL for the purposes of the business.

But a more fitting tool is something like `Effect-TS`.

Giving us more control over our program, extending it's sphere of influence
outside of the data pipeline and into program definition.

Writing effectful code means writing the _idea_ of execution

</v-click>

---
layout: center
---

# Setup

Just to simplify examples:

```ts
// @filename: common.ts

export * as Effect from '@effect/io/Effect'
export * as Data from '@effect/data/Data'
export { pipe } from '@effect/data/Function'
// so on and so forth
```

---

# Creating a `fetch` wrapper

```ts twoslash
// @module: esnext
// @filename: common.ts
/// <reference path="node_modules/@types/node/index.d.ts" />
export * from './examples/common'

// @filename: index.ts
export interface FetchError extends Data.Case {
  readonly _tag: "FetchError";
  readonly error: unknown;
}

export interface JsonBodyError extends Data.Case {
  readonly _tag: "JsonBodyError";
  readonly error: unknown
}
// ---cut---
import { Effect, Data } from "./common";

export const FetchError = Data.tagged<FetchError>("FetchError")

export const request = (info: RequestInfo, init?: RequestInit | undefined) =>
  Effect.tryCatchPromise(
    () => fetch(info, init),
    (error) => FetchError({ error })
  );

export const JsonBodyError = Data.tagged<JsonBodyError>("JsonBodyError")

export const jsonBody = (input: Response) =>
  Effect.tryCatchPromise(
    () => input.json() as Promise<unknown>,
    (error) => JsonBodyError({ error })
  );
```

---

# Using the `fetch` wrapper

```ts twoslash
// @module: esnext
// @filename: common.ts
/// <reference path="node_modules/@types/node/index.d.ts" />
export * from './examples/common'

// @filename: index.ts
// ---cut---
import { Effect, Http, pipe } from './common'

export const getLead = (id: string) =>
  pipe(
    Http.request(`/v1/leads/${id}`),
    Effect.flatMap(Http.jsonBody)   
  )

export const getLeads = (ids: string[]) =>
  Effect.collectAll(ids.map(getLead))
```
<v-click>

And if you take a closer look at `getLeads`, you'll see the explicit return types:

```ts twoslash
// @module: esnext
// @filename: common.ts
/// <reference path="node_modules/@types/node/index.d.ts" />
export * from './examples/leads'

// @filename: index.ts
import {getLeads} from './common'
// ---cut---
const leads = getLeads(['a','b','c'])
//    ^?
```
</v-click>

---
layout: center
---

# This is can be read as

An Operation that has no requirements, when performed may fail for either a `FetchError` or a `JsonBodyError`, and when successful returns `Chunk<unknown>`

```ts
Effect<never, FetchError | JsonBodyError, Chunk<unknown>>
```

---

# Error handling

Errors can be classed into two broad categories. Expected and unexpected errors. Failures and Faults.

```ts twoslash
// @module: esnext
// @filename: common.ts
/// <reference path="node_modules/@types/node/index.d.ts" />
export * from './examples/common'

// @module: esnext
// @filename: leads.ts
/// <reference path="node_modules/@types/node/index.d.ts" />
export * from './examples/leads'

// ---cut---
import { Effect, Exit, Cause, pipe } from './common'
import * as Leads from "./leads"

export const program = Effect.all({
  datner: Leads.getLead("datner"),
  tommy: Leads.getLead("tommy")
})

export const main = pipe(
  program,
  Effect.flatMap((leads) => Effect.logInfo(`Leads: ${JSON.stringify(leads)}`)),
  Effect.catchTags({
    FetchError: (error) => Effect.logError('oh no'),
    JsonBodyError: (error) => Effect.logError('oops')
  })
)

Effect.runCallback(main, (exit) => {
  if (Exit.isFailure(exit)) {
    console.error(`Unexpected failure: ${Cause.pretty(exit.cause)}`)
  }
})
```

---

# Hard as Quarts!

```ts twoslash
// @module: esnext
// @filename: common.ts
/// <reference path="node_modules/@types/node/index.d.ts" />
export * from './examples/common'

// @filename: leads.ts
// ---cut---
import { Schedule, Effect, Http, Duration, Predicate, Equal, pipe } from './common'

export const retrySchedule = pipe(
  Schedule.exponential(Duration.millis(10), 2),
  Schedule.either(Schedule.spaced(Duration.seconds(1))),
  Schedule.upTo(Duration.seconds(30)),
)

export const getLead = (id: string) =>
  pipe(
    Http.request(`/v1/leads/${id}`),
    Effect.flatMap(Http.jsonBody),
    Effect.retry(
      Schedule.whileInput(
        retrySchedule,
        Predicate.not<Http.JsonBodyError | Http.FetchError>(Equal.equals(Http.JsonBodyError))
      )
    )
  )
```

Note the composition of the context-unaware `retrySchedule` with a context-specific `Schedule.whileInput` to refine its behavior.

---

# Hard as DIAMONDS!

Not all errors should be handled explicitly. For example in the previous code
we might define that passing the retry-schedule with an error means we're borked with nothing to do.
In this case carrying the information forward is not only meaninglessly verbose, it's also an implementation-detail leak.

```ts twoslash
// @module: esnext
// @filename: common.ts
/// <reference path="node_modules/@types/node/index.d.ts" />
export * from './examples/common'

// @filename: leads.ts
import { Schedule, Effect, Http, Duration, Predicate, Equal, pipe } from './common'

export const retrySchedule = pipe(
  Schedule.exponential(Duration.millis(10), 2),
  Schedule.either(Schedule.spaced(Duration.seconds(1))),
  Schedule.upTo(Duration.seconds(30)),
)

// ---cut---
export const getLead = (id: string) =>
  pipe(
    Http.request(`/v1/leads/${id}`),
    Effect.flatMap(Http.jsonBody),
    Effect.retry(
      Schedule.whileInput(
        retrySchedule,
        Predicate.not<Http.JsonBodyError | Http.FetchError>(Equal.equals(Http.JsonBodyError))
      )
    ),
    Effect.orDie,
  )
```

<v-click>

Worry not, what is gone is not forgotten
- `Effect.catchAllCause`
- `Effect.sandbox`

</v-click>

---

# Pardon me.

Effect can also describe an interruptible computation, and in fact, differently from other similar frameworks that deal with cancellation.
In Effect cancellation is itself and effect, and is, by nature, async!

```ts twoslash
// @filename: http.ts
import * as Effect from '@effect/io/Effect'
import * as Data from '@effect/data/Data'
export interface FetchError extends Data.Case {
  readonly _tag: "FetchError";
  readonly error: unknown;
}

export const FetchError = Data.tagged<FetchError>("FetchError")
// ---cut---

export const request = (info: RequestInfo, init?: RequestInit | undefined) =>
  Effect.tryCatchPromiseInterrupt(
    (signal) => fetch(info, { ...init, signal }),
    (error) => FetchError({ error })
  );

```

That's it, interruptions are now propagated through the program execution without explicitly passing signals or controllers

---

# That dog-walker belt thing, you know what I mean

Remember doing things in parallel? Remember it sucked? Remember `Effect.collectAll`?

```ts twoslash
// @module: esnext
// @filename: common.ts
/// <reference path="node_modules/@types/node/index.d.ts" />
export * from './examples/common'

// @filename: http.ts
import { Effect, Http, pipe } from "./common"

export const getLead = (id: string) =>
  pipe(
    Http.request(`/v1/leads/${id}`),
    Effect.flatMap(Http.jsonBody)
  )

// ---cut---
export const getLeads = (ids: string[]) => pipe(
  Effect.collectAllPar(ids.map(getLead)),
  Effect.withParallelism(15)
)
```

Or even leave it to the caller

```ts twoslash
// @module: esnext
// @filename: common.ts
/// <reference path="node_modules/@types/node/index.d.ts" />
export * from './examples/common'

// @module: esnext
// @filename: leads.ts
export * from './examples/leads'

// @filename: http.ts
import { Effect, pipe } from "./common"
import * as Leads from './leads'

// ---cut---
export const program = Effect.withParallelism(Leads.getLeads(["1", "2", "3", "4", "5"]), 3)
```

---

# My life Dependencies on it!


```ts twoslash
// @module: esnext
// @filename: common.ts
/// <reference path="node_modules/@types/node/index.d.ts" />
export * from './examples/common'

// @filename: http.ts
// ---cut---
import { Effect, Chunk, Context } from "./common"

export interface LeadRepository {
  readonly getLead: (id: string) => Effect.Effect<never, never, unknown>
  readonly getLeads: (ids: string[]) => Effect.Effect<never, never, Chunk.Chunk<unknown>>
}
export const LeadRepository = Context.Tag<LeadRepository>()

export const program = Effect.gen(function*($) {
  const Leads = yield* $(Effect.service(LeadRepository))

  const leads = yield* $(Leads.getLeads(["1", "2", "3", "4"]))

  for (const lead of leads) {
    yield* $(Effect.log(`lead: ${JSON.stringify(lead)}`))
  }

  return Chunk.size(leads)
})
```

---

# My life Dependencies on it!


```ts twoslash
// @module: esnext
// @filename: common.ts
/// <reference path="node_modules/@types/node/index.d.ts" />
export * from './examples/common'

// @module: esnext
// @filename: leads.ts
/// <reference path="node_modules/@types/node/index.d.ts" />
export * from './examples/leads-or-die'
// @filename: index.ts
import { Effect, Chunk, Context, Exit, Cause, pipe } from "./common"

export interface LeadRepository {
  readonly getLead: (id: string) => Effect.Effect<never, never, unknown>
  readonly getLeads: (ids: string[]) => Effect.Effect<never, never, Chunk.Chunk<unknown>>
}
export const LeadRepository = Context.Tag<LeadRepository>()

export const program = Effect.gen(function*($) {
  const Leads = yield* $(Effect.service(LeadRepository))

  const leads = yield* $(Leads.getLeads(["1", "2", "3", "4"]))

  for (const lead of leads) {
    yield* $(Effect.log(`lead: ${JSON.stringify(lead)}`))
  }

  return Chunk.size(leads)
})
// ---cut---
import { Layer } from "./common"
import * as Leads from "./leads"

export const LiveLeadRepository = Layer.succeed(LeadRepository, Leads)

export const main = pipe(
  program,
  Effect.provideLayer(LiveLeadRepository)
)

Effect.runCallback(main, (exit) => {
  if (Exit.isFailure(exit)) {
    console.error(`Unexpected failure: ${Cause.pretty(exit.cause)}`)
  }
})
```

---

# Composing? How is PHP related?

Layers represent modules of your application and they compose very well, you can imagine a `LeadRepository` which depends on `Http`
and we have a `program` that uses both `LeadRepository` and `Http`

```ts twoslash
// @module: esnext
// @filename: common.ts
/// <reference path="node_modules/@types/node/index.d.ts" />
export * from './examples/common'

// @module: esnext
// @filename: leads.ts
export * from './examples/leads-or-die'

// @filename: index.ts
import { Effect, Http, Chunk, Layer, Context, Exit, Cause, pipe } from "./common"
import * as Leads from './leads'
export declare const program: Effect.Effect<Http.Service | Leads.Repository, never, void>
// ---cut---

export const AppContext = pipe(
  Http.layer,
  Layer.provideMerge(Leads.layer)
)


export const main = pipe(
  program,
  Effect.provideLayer(AppContext)
)

Effect.runCallback(main, (exit) => {
  if (Exit.isFailure(exit)) {
    console.error(`Unexpected failure: ${Cause.pretty(exit.cause)}`)
  }
})
```

---
layout: center
---

# So what did we learn?

<v-clicks>

  1. Real-World software is hard
  2. Concurrent logic is hard
  3. Error Handling is hard
  4. Everything is so hard!!!!
  5. Composition allows us to share generic logic in an uncoupled way
  6. We don't have to solve the problems someone else already did
  7. `Effect-TS` is amazing at building meaningful software

</v-clicks>

---
layout: center
---

# Many thanks

To the following people for being amazing at what they do, and helping me write this presentation

 - Michael Arnaldi - Creator of `Effect-TS`. For providing the precursor to this presentation @MichaelArnaldi
 - Max Brown - Core Maintainer of `Effect-TS`. For patiently teaching me about effect @imax153
 - Giulio Canti - Creator of `fp-ts` and Core Maintainer of `Effect-TS`. For getting me into fp @GiulioCanti
 - Patrick Roza - Active Community member. For being obsessed with laziness and writing insane abstractions
 - Tim Smart - Active Community member. For his time helping me tackle hard problems

---
layout: center
---

# And thank you!

For sticking through this presentation

If you have any questions about compositions, functional programming, or effect-ts. Go ahead!
