
export function Ok<T>(value: T): Result<T, never> {
    return Result.Ok(value);
}

export function Err<E>(error: E): Result<never, E> {
    return Result.Err(error);
}

export class Result<Ok, Err> {
    private constructor(
        private readonly inner:
            | { ok: true; value: Ok }
            | { ok: false; error: Err }
    ) { }

    static Ok<T>(value: T): Result<T, never> {
        return new Result({ ok: true, value });
    }

    static Err<E>(error: E): Result<never, E> {
        return new Result({ ok: false, error });
    }

    isOk(): this is { inner: { ok: true; value: Ok } } {
        return this.inner.ok;
    }

    isErr(): this is { inner: { ok: false; error: Err } } {
        return !this.inner.ok;
    }

    unwrap(): Ok {
        if (this.inner.ok) {
            return this.inner.value;
        }
        throw new Error("Tried to unwrap an Err value");
    }

    unwrapErr(): Err {
        if (!this.inner.ok) {
            return this.inner.error;
        }
        throw new Error("Tried to unwrapErr an Ok value");
    }

    map<NewOk>(fn: (value: Ok) => NewOk): Result<NewOk, Err> {
        if (this.inner.ok) {
            return Result.Ok(fn(this.inner.value));
        }
        return Result.Err(this.inner.error);
    }

    mapErr<NewErr>(fn: (error: Err) => NewErr): Result<Ok, NewErr> {
        if (!this.inner.ok) {
            return Result.Err(fn(this.inner.error));
        }
        return Result.Ok(this.inner.value);
    }
}
