type TableName =
  | "users"
  | "reservations"
  | "resources"
  | "chatThreads"
  | "chatEvents";

export type StoredRow = Record<string, unknown> & { readonly _id: string };

type QueryFilter = {
  readonly operator: "eq" | "gt" | "gte" | "lt" | "lte";
  readonly field: string;
  readonly value: unknown;
};

export type QueryTrace = {
  readonly table: TableName;
  indexName: string | null;
  readonly filters: QueryFilter[];
  rowsRead: number | null;
};

class FakeQuery {
  private readonly filters: QueryFilter[];

  constructor(
    private readonly rows: readonly StoredRow[],
    private readonly trace: QueryTrace,
  ) {
    this.filters = trace.filters;
  }

  withIndex(
    name: string,
    configure: (query: FakeQuery) => FakeQuery,
  ): FakeQuery {
    this.trace.indexName = name;
    return configure(this);
  }

  eq(field: string, value: unknown): FakeQuery {
    this.filters.push({ operator: "eq", field, value });
    return this;
  }

  gt(field: string, value: unknown): FakeQuery {
    this.filters.push({ operator: "gt", field, value });
    return this;
  }

  gte(field: string, value: unknown): FakeQuery {
    this.filters.push({ operator: "gte", field, value });
    return this;
  }

  lt(field: string, value: unknown): FakeQuery {
    this.filters.push({ operator: "lt", field, value });
    return this;
  }

  lte(field: string, value: unknown): FakeQuery {
    this.filters.push({ operator: "lte", field, value });
    return this;
  }

  async collect(): Promise<StoredRow[]> {
    const rows = this.matchingRows();
    this.trace.rowsRead = rows.length;
    return rows;
  }

  async take(limit: number): Promise<StoredRow[]> {
    const rows = this.matchingRows().slice(0, limit);
    this.trace.rowsRead = rows.length;
    return rows;
  }

  private matchingRows(): StoredRow[] {
    const rows = this.rows.filter((row) =>
      this.filters.every((filter) => matchesFilter(row, filter)),
    );
    if (this.trace.indexName === "by_resource_status_end") {
      rows.sort(
        (left, right) =>
          Number(left.endMs) - Number(right.endMs) ||
          Number(left._creationTime) - Number(right._creationTime),
      );
    }
    return rows;
  }

  async unique(): Promise<StoredRow | null> {
    const rows = await this.collect();
    if (rows.length > 1) {
      throw new Error("fake_unique_multiple_rows");
    }
    return rows[0] ?? null;
  }
}

export class FakeDatabase {
  readonly tables: Record<TableName, StoredRow[]> = {
    users: [],
    reservations: [],
    resources: [],
    chatThreads: [],
    chatEvents: [],
  };
  readonly operations = {
    queries: 0,
    gets: 0,
    inserts: 0,
    patches: 0,
  };
  readonly queryTraces: QueryTrace[] = [];
  private nextId = 1;

  seed(table: TableName, id: string, value: Record<string, unknown>): void {
    this.tables[table].push({ ...value, _id: id, _creationTime: this.nextId });
    this.nextId += 1;
  }

  query(table: TableName): FakeQuery {
    this.operations.queries += 1;
    const trace: QueryTrace = {
      table,
      indexName: null,
      filters: [],
      rowsRead: null,
    };
    this.queryTraces.push(trace);
    return new FakeQuery(this.tables[table], trace);
  }

  async insert(
    table: TableName,
    value: Record<string, unknown>,
  ): Promise<string> {
    this.operations.inserts += 1;
    const id = `${table}:${this.nextId}`;
    this.seed(table, id, value);
    return id;
  }

  async get(id: string): Promise<StoredRow | null> {
    this.operations.gets += 1;
    for (const rows of Object.values(this.tables)) {
      const row = rows.find((candidate) => candidate._id === id);
      if (row !== undefined) {
        return row;
      }
    }
    return null;
  }

  async patch(id: string, value: Record<string, unknown>): Promise<void> {
    this.operations.patches += 1;
    const row = await this.get(id);
    if (row === null) {
      throw new Error("fake_patch_missing_row");
    }
    Object.assign(row, value);
  }
}

function matchesFilter(row: StoredRow, filter: QueryFilter) {
  const rowValue = row[filter.field];
  if (filter.operator === "eq") {
    return rowValue === filter.value;
  }
  if (typeof rowValue !== "number" || typeof filter.value !== "number") {
    return false;
  }
  if (filter.operator === "gt") {
    return rowValue > filter.value;
  }
  if (filter.operator === "gte") {
    return rowValue >= filter.value;
  }
  if (filter.operator === "lt") {
    return rowValue < filter.value;
  }
  return rowValue <= filter.value;
}

class FakeScheduler {
  readonly runAtCalls: Array<{
    readonly timestampMs: number;
    readonly args: unknown;
  }> = [];
  readonly runAfterCalls: Array<{
    readonly delayMs: number;
    readonly args: unknown;
  }> = [];

  async runAt(
    timestampMs: number,
    _reference: unknown,
    args: unknown,
  ): Promise<void> {
    this.runAtCalls.push({ timestampMs, args });
  }

  async runAfter(
    delayMs: number,
    _reference: unknown,
    args: unknown,
  ): Promise<void> {
    this.runAfterCalls.push({ delayMs, args });
  }
}

export type TestContext = ReturnType<typeof testContext>;

export function testContext(db: FakeDatabase, userId: string | null) {
  return {
    db,
    scheduler: new FakeScheduler(),
    auth: {
      async getUserIdentity() {
        return userId === null
          ? null
          : {
              subject: userId,
              issuer: "https://test.invalid",
              tokenIdentifier: `test|${userId}`,
            };
      },
    },
  };
}

export async function invoke(
  registered: unknown,
  ctx: TestContext,
  args: Record<string, unknown>,
): Promise<unknown> {
  const handler = Reflect.get(Object(registered), "_handler");
  if (typeof handler !== "function") {
    throw new Error("registered_handler_missing");
  }
  return await Reflect.apply(handler, registered, [ctx, args]);
}

export function exportedArgKeys(registered: unknown): readonly string[] {
  const exportArgs = Reflect.get(Object(registered), "exportArgs");
  if (typeof exportArgs !== "function") {
    throw new Error("registered_args_missing");
  }
  const raw = Reflect.apply(exportArgs, registered, []);
  if (typeof raw !== "string") {
    throw new Error("registered_args_invalid");
  }
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("registered_args_invalid");
  }
  const value = Reflect.get(parsed, "value");
  if (typeof value !== "object" || value === null) {
    throw new Error("registered_args_invalid");
  }
  return Object.keys(value);
}

export function rejectExtraArgs(
  registered: unknown,
  args: Record<string, unknown>,
): void {
  const allowed = new Set(exportedArgKeys(registered));
  const forbidden = Object.keys(args).find((key) => !allowed.has(key));
  if (forbidden !== undefined) {
    throw new Error(`extra_arg:${forbidden}`);
  }
}

export function objectField(value: unknown, field: string): unknown {
  if (typeof value !== "object" || value === null) {
    throw new Error("object_required");
  }
  return Reflect.get(value, field);
}

export function arrayLength(value: unknown): number {
  if (!Array.isArray(value)) {
    throw new Error("array_required");
  }
  return value.length;
}

export function sortedObjectKeys(value: unknown): readonly string[] {
  if (typeof value !== "object" || value === null) {
    throw new Error("object_required");
  }
  return Object.keys(value).sort();
}

export function arrayItem(value: unknown, index: number): unknown {
  if (!Array.isArray(value)) {
    throw new Error("array_required");
  }
  return value[index];
}

export async function rejectionMessage(invocation: Promise<unknown>) {
  try {
    await invocation;
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }
    throw error;
  }
  throw new Error("expected_rejection");
}
