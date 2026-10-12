type Defined<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

/** Drops `undefined` values so partial updates satisfy `exactOptionalPropertyTypes`. */
export function compact<T extends Record<string, unknown>>(value: T): Defined<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Defined<T>;
}
